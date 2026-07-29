import { Op } from 'sequelize';
import { ChannelDeal } from '../models/frd-models.js';
import { Sku, Order } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { REGION_CODES } from '../constants/platform.js';
import { todayShanghai } from '../utils/market.js';

export async function createChannelDeal(body, userId, transaction = null) {
  const {
    sku_id,
    region,
    qty,
    unit_price,
    deal_time,
    counterparty_type,
    deal_status,
    trust_tag,
    source,
    voucher_path,
    supplier_id,
    order_id,
    note,
  } = body;
  if (!sku_id || !region || qty == null || unit_price == null) {
    throw new AppError('sku_id、region、qty、unit_price 必填');
  }
  const qtyN = Number(qty);
  const priceN = Number(unit_price);
  if (!Number.isFinite(qtyN) || qtyN <= 0) throw new AppError('qty 无效');
  if (!Number.isFinite(priceN) || priceN < 0) throw new AppError('unit_price 无效');
  if (!REGION_CODES.includes(region)) throw new AppError('无效区域');
  const sku = await Sku.findByPk(sku_id, { transaction });
  if (!sku) throw new AppError('SKU 不存在', 404);
  return ChannelDeal.create(
    {
      sku_id: Number(sku_id),
      region,
      qty: qtyN,
      unit_price: priceN,
      deal_time: deal_time ? new Date(deal_time) : new Date(),
      counterparty_type: counterparty_type || '渠道',
      deal_status: deal_status || 'filled',
      trust_tag: trust_tag || 'normal',
      source: source || 'manual',
      voucher_path: voucher_path || null,
      created_by: userId || null,
      supplier_id: supplier_id || null,
      order_id: order_id || null,
      note: note || null,
    },
    { transaction },
  );
}

export async function voidChannelDeal(id, reason, _userId) {
  const row = await ChannelDeal.findByPk(id);
  if (!row) throw new AppError('记录不存在', 404);
  if (row.voided_at) throw new AppError('已作废');
  row.voided_at = new Date();
  row.void_reason = reason || '作废';
  await row.save();
  return row;
}

export async function listChannelDeals({ sku_id, region, from, to, includeVoided } = {}) {
  const where = {};
  if (!includeVoided) where.voided_at = null;
  if (sku_id) where.sku_id = sku_id;
  if (region) where.region = region;
  if (from || to) {
    where.deal_time = {};
    if (from) where.deal_time[Op.gte] = new Date(from);
    if (to) where.deal_time[Op.lte] = new Date(to);
  }
  return ChannelDeal.findAll({
    where,
    include: [{ association: 'sku', attributes: ['id', 'name', 'unit', 'type'] }],
    order: [['deal_time', 'DESC']],
    limit: 500,
  });
}

/** 现货订单完成后写入实际成交样本 */
export async function ingestOrderAsChannelDeal(orderId) {
  const order = await Order.findByPk(orderId, {
    include: [
      { association: 'sku' },
      {
        association: 'quote',
        include: [{ association: 'rfq' }],
      },
    ],
  });
  if (!order || order.status !== '已完成') return null;
  const existing = await ChannelDeal.findOne({ where: { order_id: orderId, voided_at: null } });
  if (existing) return existing;
  const rfq = order.quote?.rfq;
  const qty = rfq?.quantity != null ? Number(rfq.quantity) : 1;
  let region = rfq?.region || 'shanghai';
  if (!REGION_CODES.includes(region)) region = 'shanghai';
  return ChannelDeal.create({
    sku_id: order.sku_id,
    region,
    qty,
    unit_price: Number(order.price),
    deal_time: order.settled_at || new Date(),
    counterparty_type: '平台成交',
    deal_status: 'filled',
    trust_tag: 'order',
    source: 'order',
    order_id: order.id,
    note: `订单#${order.id}`,
  });
}

/** 解析 CSV 文本为成交行（表头：sku_id,region,qty,unit_price,deal_status,note） */
export function parseChannelDealCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[,，\t]/).map((h) => h.trim().toLowerCase());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(/[,，\t]/).map((c) => c.trim());
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i];
    });
    rows.push({
      sku_id: Number(obj.sku_id),
      region: obj.region || 'shanghai',
      qty: Number(obj.qty),
      unit_price: Number(obj.unit_price),
      deal_status: obj.deal_status || 'filled',
      note: obj.note || null,
      counterparty_type: obj.counterparty_type || '渠道',
      trust_tag: obj.trust_tag || 'normal',
    });
  }
  return rows;
}

export async function importChannelDealsCsv(text, userId) {
  const rows = parseChannelDealCsv(text);
  const out = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      out.push(await createChannelDeal({ ...rows[i], source: 'api' }, userId));
    } catch (e) {
      errors.push({ row: i + 2, message: e.message });
    }
  }
  if (!out.length && errors.length) {
    throw new AppError(`CSV 导入失败：${errors[0].message}`);
  }
  return { imported: out, errors };
}

/** 运营确认伙伴/意向成交进入指数样本 */
export async function confirmChannelDeal(id, userId) {
  const row = await ChannelDeal.findByPk(id);
  if (!row) throw new AppError('记录不存在', 404);
  if (row.voided_at) throw new AppError('已作废');
  row.deal_status = 'filled';
  row.trust_tag = row.trust_tag === 'partner_pending' ? 'partner_verified' : row.trust_tag || 'normal';
  row.note = `${row.note || ''}\n[confirm] by#${userId}`.trim();
  await row.save();
  return row;
}

export async function filledDealsForEngine(skuId, region, asOfDate = todayShanghai()) {
  const end = new Date(`${asOfDate}T23:59:59+08:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return ChannelDeal.findAll({
    where: {
      sku_id: skuId,
      region,
      deal_status: 'filled',
      voided_at: null,
      deal_time: { [Op.between]: [start, end] },
    },
    order: [['deal_time', 'ASC']],
  });
}

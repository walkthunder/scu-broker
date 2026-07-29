import { Op } from 'sequelize';
import { PriceIndex, IndexPrint, ReferencePrice, SettlementBill, ForwardContract } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { todayShanghai } from '../utils/market.js';

export async function listIndices({ activeOnly = false } = {}) {
  const where = activeOnly ? { status: 'active' } : {};
  return PriceIndex.findAll({
    where,
    include: [{ association: 'sku', attributes: ['id', 'name', 'unit', 'type'] }],
    order: [['id', 'ASC']],
  });
}

/** 客户侧指数列表：附带最新 published S（批量查，避免路由 N+1） */
export async function listIndicesWithLatest({ activeOnly = true } = {}) {
  const list = await listIndices({ activeOnly });
  const out = [];
  for (const idx of list) {
    const j = idx.toJSON();
    const latest = await getLatestPublished(idx.id);
    j.latest_published = latest
      ? { date: latest.date, settle_price: Number(latest.settle_price) }
      : null;
    out.push(j);
  }
  return out;
}

export async function listPublishedPrints(indexId, { from, to } = {}) {
  const prints = await listPrints(indexId, { from, to });
  return prints
    .filter((p) => p.status === 'published')
    .map((p) => ({
      date: p.date,
      settle_price: Number(p.settle_price),
      source: p.source,
    }));
}

export async function getIndexOrThrow(id) {
  const row = await PriceIndex.findByPk(id, {
    include: [{ association: 'sku', attributes: ['id', 'name', 'unit', 'type'] }],
  });
  if (!row) throw new AppError('指数不存在', 404);
  return row;
}

export async function createIndex({ code, name, sku_id, jump_threshold_pct, status }) {
  if (!code || !name || !sku_id) throw new AppError('code、name、sku_id 必填');
  return PriceIndex.create({
    code: String(code).trim(),
    name: String(name).trim(),
    sku_id: Number(sku_id),
    jump_threshold_pct: jump_threshold_pct != null ? Number(jump_threshold_pct) : 20,
    status: status || 'active',
  });
}

export async function updateIndex(id, patch) {
  const row = await getIndexOrThrow(id);
  for (const f of ['name', 'sku_id', 'jump_threshold_pct', 'status']) {
    if (patch[f] !== undefined) row[f] = patch[f];
  }
  await row.save();
  return row;
}

/** 某日 print 是否已被结算账单引用（不可改价/撤发布） */
export async function isPrintUsedInSettlement(indexId, date) {
  const bill = await SettlementBill.findOne({
    where: { settle_price_date: date },
    include: [
      {
        model: ForwardContract,
        as: 'contract',
        required: true,
        where: { index_id: indexId },
        attributes: ['id'],
      },
    ],
  });
  return !!bill;
}

async function assertPrintEditable(print) {
  if (await isPrintUsedInSettlement(print.index_id, print.date)) {
    throw new AppError('已用于结算，禁止改价或撤销发布', 400, 'PRINT_LOCKED');
  }
}

export async function listPrints(indexId, { from, to } = {}) {
  const where = { index_id: indexId };
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }
  return IndexPrint.findAll({ where, order: [['date', 'DESC']] });
}

export async function getLatestPublished(indexId, onOrBefore = null) {
  const where = { index_id: indexId, status: 'published' };
  if (onOrBefore) where.date = { [Op.lte]: onOrBefore };
  return IndexPrint.findOne({ where, order: [['date', 'DESC']] });
}

/**
 * 从锚定 SKU 当日 price_mid 生成/更新 draft；跳变超阈值 → pending_review
 */
export async function generatePrintFromMid(indexId, date = todayShanghai()) {
  const index = await getIndexOrThrow(indexId);
  const ref = await ReferencePrice.findOne({
    where: { sku_id: index.sku_id, date, region: index.region || 'shanghai' },
  });
  if (!ref) {
    const skuName = index.sku?.name || `SKU#${index.sku_id}`;
    throw new AppError(
      `当日（${date}）锚定 SKU「${skuName}」区域 ${index.region || 'shanghai'} 尚无参考价，请先到「参考价管理」录入低/中/高`,
    );
  }

  const settlePrice = Number(ref.price_mid);
  const prev = await getLatestPublished(indexId, date);
  let status = 'draft';
  if (prev) {
    const prevP = Number(prev.settle_price);
    if (prevP > 0) {
      const jump = Math.abs((settlePrice - prevP) / prevP) * 100;
      if (jump > Number(index.jump_threshold_pct)) status = 'pending_review';
    }
  }

  let print = await IndexPrint.findOne({ where: { index_id: indexId, date } });
  if (print) {
    await assertPrintEditable(print);
    if (print.status === 'published') {
      throw new AppError('已发布的结算价请使用覆写接口或先撤销（若未用于结算）');
    }
    print.settle_price = settlePrice;
    print.source = 'price_mid';
    print.status = status;
    await print.save();
  } else {
    print = await IndexPrint.create({
      index_id: indexId,
      date,
      settle_price: settlePrice,
      source: 'price_mid',
      status,
    });
  }
  return print;
}

/** 人工覆写价格（未用于结算时可改；已发布则回到 pending_review 或 draft） */
export async function upsertManualPrint(indexId, date, settlePrice, { forceStatus } = {}) {
  if (settlePrice == null || Number(settlePrice) <= 0) throw new AppError('settle_price 无效');
  const index = await getIndexOrThrow(indexId);
  let print = await IndexPrint.findOne({ where: { index_id: indexId, date } });
  if (print) {
    await assertPrintEditable(print);
    if (print.status === 'published') {
      throw new AppError('已发布的结算价请先撤销发布再覆写');
    }
  }

  const prev = await getLatestPublished(indexId, date);
  let status = forceStatus || 'draft';
  if (!forceStatus && prev) {
    const prevP = Number(prev.settle_price);
    if (prevP > 0) {
      const jump = Math.abs((Number(settlePrice) - prevP) / prevP) * 100;
      if (jump > Number(index.jump_threshold_pct)) status = 'pending_review';
    }
  }

  if (print) {
    print.settle_price = Number(settlePrice);
    print.source = 'manual';
    print.status = status === 'published' ? 'pending_review' : status;
    await print.save();
  } else {
    print = await IndexPrint.create({
      index_id: indexId,
      date,
      settle_price: Number(settlePrice),
      source: 'manual',
      status,
    });
  }
  return print;
}

export async function publishPrint(indexId, date) {
  const print = await IndexPrint.findOne({ where: { index_id: indexId, date } });
  if (!print) throw new AppError('该日结算价不存在', 404);
  await assertPrintEditable(print);
  if (!['draft', 'pending_review'].includes(print.status) && print.status !== 'published') {
    throw new AppError('当前状态不可发布');
  }
  // 引擎/参考价产出：须走公告双人复核，禁止指数台单笔绕过
  if (['engine', 'reference'].includes(print.source)) {
    const { PriceBulletin } = await import('../models/frd-models.js');
    const bulletin = await PriceBulletin.findOne({ where: { date, status: 'published' } });
    if (!bulletin) {
      throw new AppError('引擎/参考测算价须经当日价格公告双人复核后发布（价格发现）');
    }
  }
  print.status = 'published';
  await print.save();
  return print;
}

/** 撤销发布（未用于结算） */
export async function unpublishPrint(indexId, date) {
  const print = await IndexPrint.findOne({ where: { index_id: indexId, date } });
  if (!print) throw new AppError('该日结算价不存在', 404);
  await assertPrintEditable(print);
  if (print.status !== 'published') throw new AppError('仅已发布可撤销');
  print.status = 'draft';
  await print.save();
  return print;
}

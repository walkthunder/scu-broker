import { Op } from 'sequelize';
import { DealFeed, Order, Sku, Supplier } from '../models/index.js';
import { todayShanghai } from '../utils/market.js';

function guessRegion(supplier) {
  const text = `${supplier?.display_name || ''} ${supplier?.note || ''} ${supplier?.name || ''}`;
  if (/海外|海外区|国际/.test(text)) return '海外';
  if (/南|粤|深|广|成渝|西南/.test(text)) return '南部';
  if (/西|西北|新疆/.test(text)) return '西部';
  if (/北|京津|华北/.test(text)) return '北部';
  return '东部';
}

function guessDealType(sku) {
  if (!sku) return '时租';
  if (sku.type === 'token') return 'Token包';
  if (sku.unit === '月') return '包月';
  if (sku.unit === '年') return '包年';
  return '时租';
}

/** 订单完成时生成脱敏动态草稿（幂等） */
export async function ensureDealFeedDraft(orderId) {
  const existing = await DealFeed.findOne({ where: { order_id: orderId } });
  if (existing) return existing;

  const order = await Order.findByPk(orderId, {
    include: [
      { model: Sku, as: 'sku' },
      { model: Supplier, as: 'supplier' },
    ],
  });
  if (!order || order.status !== '已完成') return null;

  return DealFeed.create({
    order_id: order.id,
    region: guessRegion(order.supplier),
    sku_name: order.sku?.name || `SKU#${order.sku_id}`,
    deal_type: guessDealType(order.sku),
    deal_date: todayShanghai(),
    is_published: false,
  });
}

export async function listPublishedDealFeeds(limit = 20) {
  return DealFeed.findAll({
    where: { is_published: true },
    order: [
      ['published_at', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    attributes: ['id', 'region', 'sku_name', 'deal_type', 'deal_date', 'published_at'],
  });
}

export async function expirePendingQuotes() {
  const { Quote } = await import('../models/index.js');
  const [n] = await Quote.update(
    { status: 'expired' },
    {
      where: {
        status: 'pending',
        expiry_time: { [Op.lt]: new Date() },
      },
    },
  );
  return n;
}

import { Op } from 'sequelize';
import { PriceIndex } from '../models/index.js';
import { MakerQuote, PartnerCapacity } from '../models/frd-models.js';

/**
 * 每个 SKU + 区域唯一主指数（active、id 最小）。
 * 禁止在业务路径用无序 findOne 或「打印最多」启发式。
 */
export async function resolvePrimaryIndex(skuId, region = 'shanghai') {
  if (!(Number(skuId) > 0)) return null;
  return PriceIndex.findOne({
    where: { sku_id: Number(skuId), region: region || 'shanghai', status: 'active' },
    order: [['id', 'ASC']],
  });
}

/**
 * 同 SKU+区域若有多个 active，只保留 id 最小者，其余 inactive。
 * 供 seed / 运维纠偏，幂等。
 */
export async function deactivateDuplicateIndices() {
  const rows = await PriceIndex.findAll({
    where: { status: 'active' },
    attributes: ['id', 'sku_id', 'region', 'code'],
    order: [
      ['sku_id', 'ASC'],
      ['region', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  const keep = new Set();
  let n = 0;
  for (const row of rows) {
    const key = `${row.sku_id}|${row.region || 'shanghai'}`;
    if (!keep.has(key)) {
      keep.add(key);
      continue;
    }
    row.status = 'inactive';
    await row.save();
    n += 1;
  }
  return n;
}

/**
 * 做市 / 伙伴双边参考价（引擎插值与展示参考条共用）。
 * 不进入撮合盘口。
 */
export async function resolveMarketQuote(skuId, region = 'shanghai', { date } = {}) {
  const where = { sku_id: Number(skuId), region: region || 'shanghai' };
  if (date) where.date = date;
  const mq = await MakerQuote.findOne({
    where,
    order: date
      ? [['id', 'DESC']]
      : [
          ['date', 'DESC'],
          ['id', 'DESC'],
        ],
  });
  if (mq && Number(mq.bid) > 0 && Number(mq.ask) > 0) {
    return {
      bid: Number(mq.bid),
      ask: Number(mq.ask),
      mid: (Number(mq.bid) + Number(mq.ask)) / 2,
      source: 'maker',
      date: mq.date,
    };
  }
  const partners = await PartnerCapacity.findAll({
    where: {
      sku_id: Number(skuId),
      region: region || 'shanghai',
      active: true,
      quote_bid: { [Op.gt]: 0 },
      quote_ask: { [Op.gt]: 0 },
    },
    order: [['id', 'ASC']],
  });
  if (!partners.length) return null;
  const mids = partners.map((p) => (Number(p.quote_bid) + Number(p.quote_ask)) / 2);
  const mid = mids.reduce((s, x) => s + x, 0) / mids.length;
  const bid = Math.min(...partners.map((p) => Number(p.quote_bid)));
  const ask = Math.max(...partners.map((p) => Number(p.quote_ask)));
  return { bid, ask, mid, source: 'partner', date: null };
}

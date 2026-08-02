import { Op } from 'sequelize';
import { MtmStatement, RightContract } from '../models/frd-models.js';
import { ForwardContract } from '../models/index.js';
import { getLatestPublished } from './index-price.js';
import { computeCashSettlement } from './forward-settle.js';
import { todayShanghai } from '../utils/market.js';
import { sequelize } from '../config/database.js';

/**
 * 生成当日盯市结算单：预售持仓浮动盈亏 + 权益持仓内在价值快照
 */
export async function generateDailyMtmStatements(date = todayShanghai()) {
  const opens = await ForwardContract.findAll({
    where: { status: 'open', settle_mode: 'cash' },
  });
  const rights = await RightContract.findAll({ where: { status: 'open' } });
  let n = 0;

  for (const c of opens) {
    const print = await getLatestPublished(c.index_id, date);
    if (!print) continue;
    const mt = computeCashSettlement({
      strike: c.strike_price,
      settlePrice: print.settle_price,
      qty: c.qty,
    });
    // 买方视角
    await upsertStmt({
      user_id: c.buyer_id,
      date,
      ref_type: 'forward',
      ref_id: c.id,
      mark_price: Number(print.settle_price),
      mtm_amount: mt.signed_amount,
      margin_frozen: Number(c.margin_frozen),
      note: `预售盯市 S=${print.settle_price}`,
    });
    // 卖方视角相反
    await upsertStmt({
      user_id: c.seller_id,
      date,
      ref_type: 'forward',
      ref_id: c.id,
      mark_price: Number(print.settle_price),
      mtm_amount: -mt.signed_amount,
      margin_frozen: null,
      note: `预售盯市(卖方) S=${print.settle_price}`,
    });
    n += 2;
  }

  for (const r of rights) {
    const { getLatestPublished: glp } = await import('./index-price.js');
    const { resolvePrimaryIndex } = await import('./market-resolve.js');
    const index = await resolvePrimaryIndex(r.sku_id, r.region);
    let spot = Number(r.strike);
    if (index) {
      const print = await glp(index.id, date);
      if (print) spot = Number(print.settle_price);
    }
    let intrinsic = 0;
    if (r.kind === 'call') intrinsic = Math.max(0, spot - Number(r.strike)) * Number(r.qty);
    else intrinsic = Math.max(0, Number(r.strike) - spot) * Number(r.qty);
    const mtm = Math.round((intrinsic - Number(r.premium)) * 100) / 100;
    await upsertStmt({
      user_id: r.buyer_id,
      date,
      ref_type: 'right',
      ref_id: r.id,
      mark_price: spot,
      mtm_amount: mtm,
      margin_frozen: null,
      note: `${r.kind} 盯市 内在=${intrinsic.toFixed(2)}`,
    });
    n += 1;
  }

  return { date, written: n };
}

async function upsertStmt(row) {
  const existing = await MtmStatement.findOne({
    where: {
      user_id: row.user_id,
      date: row.date,
      ref_type: row.ref_type,
      ref_id: row.ref_id,
    },
  });
  if (existing) {
    Object.assign(existing, row);
    await existing.save();
    return existing;
  }
  return MtmStatement.create(row);
}

export async function listMtmStatements(userId, { from, to, limit = 100 } = {}) {
  const where = { user_id: userId };
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }
  return MtmStatement.findAll({
    where,
    order: [
      ['date', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
  });
}

export async function runMtmJob(date = todayShanghai()) {
  const { monitorForwardMargins } = await import('./margin-monitor.js');
  const statements = await generateDailyMtmStatements(date);
  const margins = await monitorForwardMargins();
  return { statements, margins };
}

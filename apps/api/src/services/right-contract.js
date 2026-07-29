import { Op } from 'sequelize';
import { RightContract } from '../models/frd-models.js';
import { DeliveryChannel, DeliveryOrder, PriceIndex } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { getPlatformParams } from './platform-config.js';
import { getLatestPublished } from './index-price.js';
import { assertBuyingPower, postLedger } from './ledger.js';
import { todayShanghai, addDaysShanghai } from '../utils/market.js';
import { REGION_CODES } from '../constants/platform.js';
import { sequelize } from '../config/database.js';

/** 简化权利金参考：premium ≈ 0.4 * S * σ * sqrt(T/365) * qty 调整 + 内在价值 */
export function refPremium({ spot, strike, kind, days, vol, qty }) {
  const S = Number(spot);
  const K = Number(strike);
  const T = Math.max(1, Number(days)) / 365;
  const sigma = Number(vol) || 0.35;
  const timeValue = 0.4 * S * sigma * Math.sqrt(T);
  let intrinsic = 0;
  if (kind === 'call') intrinsic = Math.max(0, S - K);
  else intrinsic = Math.max(0, K - S);
  const unit = Math.round((intrinsic * 0.5 + timeValue) * 100) / 100;
  const deltaApprox = kind === 'call' ? (S > K ? 0.6 : 0.4) : S < K ? -0.6 : -0.4;
  return {
    premium_ref: Math.round(unit * Number(qty) * 100) / 100,
    unit_premium: unit,
    delta: deltaApprox,
    intrinsic: Math.round(intrinsic * 100) / 100,
    time_value: Math.round(timeValue * 100) / 100,
  };
}

export function payoffDiagram({ kind, strike, premiumUnit, spotMin, spotMax, steps = 21 }) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const S = spotMin + ((spotMax - spotMin) * i) / (steps - 1);
    let payoff;
    if (kind === 'call') payoff = Math.max(0, S - strike) - premiumUnit;
    else payoff = Math.max(0, strike - S) - premiumUnit;
    pts.push({ spot: Math.round(S * 100) / 100, pnl: Math.round(payoff * 100) / 100 });
  }
  const be = kind === 'call' ? strike + premiumUnit : strike - premiumUnit;
  return { points: pts, breakeven: Math.round(be * 100) / 100 };
}

async function latestSpotForSkuRegion(skuId, region) {
  const index = await PriceIndex.findOne({
    where: { sku_id: skuId, region, status: 'active' },
  });
  if (!index) return null;
  const print = await getLatestPublished(index.id);
  return print ? Number(print.settle_price) : null;
}

async function putNotional(statuses, transaction) {
  const openPuts = await RightContract.findAll({
    where: { kind: 'put', status: { [Op.in]: statuses } },
    transaction,
  });
  return openPuts.reduce((s, r) => s + Number(r.strike) * Number(r.qty), 0);
}

async function assertPutPoolCapacity(addNotional, transaction) {
  const params = await getPlatformParams();
  const notional = await putNotional(['open', 'pending_confirm'], transaction);
  const pool = Number(params.put_pool_balance);
  const minCov = Number(params.put_pool_coverage_min);
  if (pool <= 0 || notional + addNotional > pool / Math.max(minCov, 1e-9)) {
    throw new AppError('认沽资金池覆盖不足，拒绝开仓', 400, 'PUT_POOL');
  }
}

export async function createRight(body, brokerId) {
  const {
    kind,
    buyer_id,
    writer_supplier_id,
    sku_id,
    region,
    qty,
    unit,
    strike,
    premium,
    window_start,
    window_end,
    note,
  } = body;
  if (!['call', 'put'].includes(kind)) throw new AppError('kind 须为 call 或 put');
  if (!buyer_id || !sku_id || !region || !qty || !strike || premium == null) {
    throw new AppError('缺少必要字段');
  }
  if (!REGION_CODES.includes(region)) throw new AppError('无效区域');
  const params = await getPlatformParams();
  if (!Number(params.rights_enabled)) throw new AppError('权益产品暂未开放', 403);
  const start = window_start || todayShanghai();
  const end = window_end || addDaysShanghai(start, Number(params.right_days));
  const spot = (await latestSpotForSkuRegion(sku_id, region)) || Number(strike);
  const ref = refPremium({
    spot,
    strike: Number(strike),
    kind,
    days: params.right_days,
    vol: params.vol_for_premium,
    qty: Number(qty),
  });

  if (kind === 'put') {
    await assertPutPoolCapacity(Number(strike) * Number(qty));
  }

  const { assertCapacity } = await import('./partner-capacity.js');
  const { assertNotUnderMarginBlock } = await import('./margin-monitor.js');
  await assertNotUnderMarginBlock(buyer_id);

  return sequelize.transaction(async (t) => {
    await assertCapacity('rights', sku_id, region, qty, t);
    return RightContract.create(
      {
        kind,
        buyer_id,
        writer_supplier_id: writer_supplier_id || null,
        sku_id,
        region,
        qty: Number(qty),
        unit: unit || '台·月',
        strike: Number(strike),
        premium: Number(premium),
        premium_ref: ref.premium_ref,
        window_start: start,
        window_end: end,
        status: 'pending_confirm',
        broker_id: brokerId || null,
        note: note || null,
      },
      { transaction: t },
    );
  });
}

export async function confirmRight(id, userId) {
  const row = await RightContract.findByPk(id);
  if (!row) throw new AppError('不存在', 404);
  if (row.status !== 'pending_confirm') throw new AppError('状态不可确认');
  if (Number(row.buyer_id) !== Number(userId)) throw new AppError('仅买方可确认', 403);
  row.buyer_confirmed_at = new Date();
  await row.save();
  return row;
}

export async function confirmRightFee(id, operatorId) {
  return sequelize.transaction(async (t) => {
    const row = await RightContract.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) throw new AppError('不存在', 404);
    if (!row.buyer_confirmed_at) throw new AppError('买方尚未确认');
    if (row.status !== 'pending_confirm') throw new AppError('状态不可收费确认');
    if (row.kind === 'put') {
      await assertPutPoolCapacity(0, t);
    }
    await assertBuyingPower(row.buyer_id, Number(row.premium), t);
    await postLedger(
      {
        userId: row.buyer_id,
        type: 'premium',
        amount: Number(row.premium),
        ref_type: 'right',
        ref_id: row.id,
        note: `${row.kind} 权利金`,
        operatorId,
        mode: 'debit',
      },
      t,
    );
    row.fee_confirmed_at = new Date();
    row.status = 'open';
    await row.save({ transaction: t });
    return presentRight(row);
  });
}

export async function presentRight(row) {
  const j = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
  const spot = await latestSpotForSkuRegion(j.sku_id, j.region);
  const unitPrem = Number(j.premium) / Math.max(Number(j.qty), 1e-9);
  const ref = refPremium({
    spot: spot || j.strike,
    strike: j.strike,
    kind: j.kind,
    days: 30,
    vol: 0.35,
    qty: j.qty,
  });
  j.analytics = {
    spot,
    ...ref,
    payoff: payoffDiagram({
      kind: j.kind,
      strike: Number(j.strike),
      premiumUnit: unitPrem,
      spotMin: Number(j.strike) * 0.7,
      spotMax: Number(j.strike) * 1.3,
    }),
  };
  return j;
}

export async function exerciseRight(id, userId, { channel_id } = {}) {
  return sequelize.transaction(async (t) => {
    const row = await RightContract.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [{ association: 'sku' }],
    });
    if (!row) throw new AppError('不存在', 404);
    if (row.status !== 'open') throw new AppError('不可行权');
    const today = todayShanghai();
    if (today < row.window_start || today > row.window_end) throw new AppError('不在行权窗内');
    if (Number(row.buyer_id) !== Number(userId)) throw new AppError('仅持有人可行权', 403);

    const spot = (await latestSpotForSkuRegion(row.sku_id, row.region)) || Number(row.strike);

    if (row.kind === 'call') {
      let channelId = channel_id;
      if (!channelId) {
        const ch = await DeliveryChannel.findOne({
          where: { sku_id: row.sku_id, active: true },
          transaction: t,
        });
        if (!ch) throw new AppError('无可用交割通道');
        channelId = ch.id;
      }
      const del = await DeliveryOrder.create(
        {
          right_contract_id: row.id,
          channel_id: channelId,
          status: 'pending',
          requested_by: userId,
          priority: true,
          note: `认购行权 strike=${row.strike}`,
        },
        { transaction: t },
      );
      row.delivery_order_id = del.id;
      row.status = 'exercised';
      row.exercised_at = new Date();
      await row.save({ transaction: t });
      return presentRight(row);
    }

    // put: 回售，买方获得 max(K-S,0)*qty；从认沽资金池扣减
    const payoff = Math.max(0, Number(row.strike) - spot) * Number(row.qty);
    row.settle_amount = Math.round(payoff * 100) / 100;
    row.status = 'exercised';
    row.exercised_at = new Date();
    await row.save({ transaction: t });
    if (payoff > 0) {
      const { PlatformConfig } = await import('../models/frd-models.js');
      let cfg = await PlatformConfig.findOne({
        where: { key: 'put_pool_balance' },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!cfg) {
        const params = await getPlatformParams();
        cfg = await PlatformConfig.create(
          {
            key: 'put_pool_balance',
            value: String(params.put_pool_balance),
            note: '认沽资金池',
          },
          { transaction: t },
        );
        cfg = await PlatformConfig.findOne({
          where: { key: 'put_pool_balance' },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
      }
      const pool = Number(cfg.value);
      if (pool + 1e-9 < payoff) {
        throw new AppError('认沽资金池余额不足，无法兑付', 400, 'PUT_POOL');
      }
      cfg.value = String(Math.round((pool - payoff) * 100) / 100);
      cfg.note = '认沽行权兑付';
      await cfg.save({ transaction: t });
      const { clearConfigCache } = await import('./platform-config.js');
      clearConfigCache();
      await postLedger(
        {
          userId: row.buyer_id,
          type: 'payout',
          amount: payoff,
          ref_type: 'right',
          ref_id: row.id,
          note: '认沽行权回售结算',
          mode: 'available',
        },
        t,
      );
    }
    return presentRight(row);
  });
}

export async function expireRights(asOf = todayShanghai()) {
  const [n] = await RightContract.update(
    { status: 'expired' },
    { where: { status: 'open', window_end: { [Op.lt]: asOf } } },
  );
  return n;
}

export async function listRights({ userId, kind, status } = {}) {
  const where = {};
  if (userId) where.buyer_id = userId;
  if (kind) where.kind = kind;
  if (status) where.status = status;
  const rows = await RightContract.findAll({
    where,
    include: [
      { association: 'sku', attributes: ['id', 'name', 'unit'] },
      { association: 'buyer', attributes: ['id', 'name', 'company_name'] },
      { association: 'writer_supplier', attributes: ['id', 'name', 'display_name'] },
    ],
    order: [['id', 'DESC']],
  });
  return Promise.all(rows.map((r) => presentRight(r)));
}

export async function putPoolStats() {
  const params = await getPlatformParams();
  const notional = await putNotional(['open', 'pending_confirm']);
  const pool = Number(params.put_pool_balance);
  return {
    open_count: (
      await RightContract.count({ where: { kind: 'put', status: { [Op.in]: ['open', 'pending_confirm'] } } })
    ),
    notional,
    pool_balance: pool,
    coverage: notional > 0 ? pool / notional : null,
  };
}

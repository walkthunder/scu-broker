import { Op } from 'sequelize';
import { todayShanghai } from '../utils/market.js';
import { runEngineAll, submitBulletinForReview } from './index-engine.js';
import { expireRights } from './right-contract.js';
import { expirePendingConfirms, settleBatch } from './forward-settle.js';
import { expireStalePendingDeliveries } from './delivery.js';
import { monitorForwardMargins } from './margin-monitor.js';
import { runMtmJob } from './mtm-statements.js';
import { SpotBookOrder } from '../models/frd-models.js';
import { postLedger } from './ledger.js';
import { sequelize } from '../config/database.js';

export async function expireSpotOrders(now = new Date()) {
  const stale = await SpotBookOrder.findAll({
    where: {
      status: { [Op.in]: ['open', 'partial'] },
      expires_at: { [Op.lt]: now },
    },
  });
  let n = 0;
  for (const o of stale) {
    await sequelize.transaction(async (t) => {
      const order = await SpotBookOrder.findByPk(o.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!order || !['open', 'partial'].includes(order.status)) return;
      const unfilled = Number(order.qty) - Number(order.filled_qty);
      if (order.side === 'buy' && unfilled > 0 && order.price) {
        // 与挂单一致：按全额名义释放未成交冻结（非初始保证金比例）
        const m = Math.round(Number(order.price) * unfilled * 100) / 100;
        if (m > 0) {
          await postLedger(
            {
              userId: order.user_id,
              type: 'margin_release',
              amount: m,
              ref_type: 'spot_book',
              ref_id: order.id,
              note: '挂单过期释放全额冻结',
              mode: 'release',
            },
            t,
          );
        }
      }
      order.status = 'expired';
      await order.save({ transaction: t });
      n += 1;
    });
  }
  return n;
}

/** 17:00 预备：跑引擎并提交双人复核（不自动发布） */
export async function dailyPublishPrep(date = todayShanghai(), userId = null) {
  const engine = await runEngineAll(date, userId);
  let bulletin = null;
  let bulletin_error = null;
  try {
    bulletin = await submitBulletinForReview(date, userId);
  } catch (e) {
    bulletin_error = e.message;
  }
  return { date, engine, bulletin, bulletin_error };
}

export async function runExpireAll(now = new Date()) {
  const asOf = todayShanghai();
  return {
    spot_orders: await expireSpotOrders(now),
    rights: await expireRights(asOf),
    forward_confirms: await expirePendingConfirms(now),
    delivery_pending: await expireStalePendingDeliveries(asOf),
  };
}

export async function runDailyJobs({ date = todayShanghai(), userId = null, settle = true } = {}) {
  const publish = await dailyPublishPrep(date, userId);
  const mtm = await runMtmJob(date);
  const expired = await runExpireAll();
  const settlement = settle ? await settleBatch({ asOf: date }) : null;
  return { publish, mtm, margins: mtm.margins, expired, settlement };
}

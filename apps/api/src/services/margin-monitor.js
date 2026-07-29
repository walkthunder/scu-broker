import { Op } from 'sequelize';
import { ForwardContract } from '../models/index.js';
import { getLatestPublished } from './index-price.js';
import { computeCashSettlement } from './forward-settle.js';
import { assertBuyingPower, postLedger, getBuyingPower } from './ledger.js';
import { sequelize } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { notifyForwardPendingConfirm } from './notify.js';

/**
 * 盯市追保：保证金权益 = 冻结 − max(买方浮亏,0)；低于维持保证金则追保冻结。
 * 返回追保清单。
 */
export async function monitorForwardMargins() {
  const opens = await ForwardContract.findAll({
    where: { status: 'open', settle_mode: 'cash' },
    include: [{ association: 'index' }, { association: 'buyer', attributes: ['id', 'name', 'phone', 'email'] }],
  });
  const calls = [];
  for (const c of opens) {
    const print = await getLatestPublished(c.index_id);
    if (!print) continue;
    const mt = computeCashSettlement({
      strike: c.strike_price,
      settlePrice: print.settle_price,
      qty: c.qty,
    });
    // 买方浮亏时 signed_amount < 0
    const buyerLoss = mt.signed_amount < 0 ? Math.abs(mt.signed_amount) : 0;
    const notional = Number(c.strike_price) * Number(c.qty);
    const maintain = Math.round(notional * (Number(c.margin_maintain_pct || 8) / 100) * 100) / 100;
    const equity = Number(c.margin_frozen) - buyerLoss;
    if (equity + 1e-9 >= maintain) continue;

    const need = Math.round((maintain - equity) * 100) / 100;
    if (!(need > 0)) continue;

    try {
      await sequelize.transaction(async (t) => {
        const locked = await ForwardContract.findByPk(c.id, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!locked || locked.status !== 'open') return;
        await assertBuyingPower(locked.buyer_id, need, t);
        await postLedger(
          {
            userId: locked.buyer_id,
            type: 'margin_freeze',
            amount: need,
            ref_type: 'forward',
            ref_id: locked.id,
            note: `盯市追保（维持 ${maintain}，权益 ${equity.toFixed(2)}）`,
            mode: 'freeze',
          },
          t,
        );
        locked.margin_frozen = Number(locked.margin_frozen) + need;
        locked.note = `${locked.note || ''}\n[margin-call] +${need} @ ${print.date}`.trim();
        await locked.save({ transaction: t });
      });
      calls.push({
        contract_id: c.id,
        buyer_id: c.buyer_id,
        amount: need,
        maintain,
        equity: Math.round(equity * 100) / 100,
        ok: true,
      });
      try {
        await notifyForwardPendingConfirm(c);
      } catch {
        /* notify best-effort */
      }
    } catch (e) {
      calls.push({
        contract_id: c.id,
        buyer_id: c.buyer_id,
        amount: need,
        ok: false,
        reason: e.message || '追保失败',
        code: e.code || null,
      });
    }
  }
  return { checked: opens.length, margin_calls: calls };
}

export async function listUnderMargined() {
  const opens = await ForwardContract.findAll({
    where: { status: 'open', settle_mode: 'cash' },
  });
  const out = [];
  for (const c of opens) {
    const print = await getLatestPublished(c.index_id);
    if (!print) continue;
    const mt = computeCashSettlement({
      strike: c.strike_price,
      settlePrice: print.settle_price,
      qty: c.qty,
    });
    const buyerLoss = mt.signed_amount < 0 ? Math.abs(mt.signed_amount) : 0;
    const notional = Number(c.strike_price) * Number(c.qty);
    const maintain = Math.round(notional * (Number(c.margin_maintain_pct || 8) / 100) * 100) / 100;
    const equity = Number(c.margin_frozen) - buyerLoss;
    if (equity + 1e-9 < maintain) {
      const bal = await getBuyingPower(c.buyer_id);
      out.push({
        contract_id: c.id,
        buyer_id: c.buyer_id,
        equity: Math.round(equity * 100) / 100,
        maintain,
        shortfall: Math.round((maintain - equity) * 100) / 100,
        available: bal.available,
      });
    }
  }
  return out;
}

/** 可用资金不足且已欠保的客户禁止新开风险仓 */
export async function assertNotUnderMarginBlock(userId) {
  const under = await listUnderMargined();
  const hit = under.find((u) => Number(u.buyer_id) === Number(userId) && u.available + 1e-9 < u.shortfall);
  if (hit) {
    throw new AppError(
      `账户存在未补足追保（合约 #${hit.contract_id}，缺口 ${hit.shortfall}），暂不可开新仓`,
      400,
      'MARGIN_CALL',
    );
  }
}

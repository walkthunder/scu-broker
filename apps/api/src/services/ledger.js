import { Op } from 'sequelize';
import { LedgerAccount, LedgerEntry } from '../models/frd-models.js';
import { User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { sequelize } from '../config/database.js';

export async function ensureAccount(userId, transaction) {
  let acc = await LedgerAccount.findOne({ where: { user_id: userId }, transaction });
  if (!acc) {
    acc = await LedgerAccount.create(
      { user_id: userId, available: 0, frozen: 0 },
      { transaction },
    );
  }
  return acc;
}

export async function getBuyingPower(userId) {
  const acc = await ensureAccount(userId);
  return {
    available: Number(acc.available),
    frozen: Number(acc.frozen),
    total: Number(acc.available) + Number(acc.frozen),
  };
}

export async function assertBuyingPower(userId, need, transaction) {
  const user = await User.findByPk(userId, { transaction });
  if (user?.blacklisted) throw new AppError('账户已列入黑名单', 403);
  const acc = await ensureAccount(userId, transaction);
  if (Number(acc.available) + 1e-9 < Number(need)) {
    throw new AppError(`可用资金不足：需要 ${need}，可用 ${acc.available}`, 400, 'INSUFFICIENT_FUNDS');
  }
  return acc;
}

/**
 * amount>0 增加 available；freeze 从 available→frozen；release 从 frozen→available
 */
export async function postLedger({
  userId,
  type,
  amount,
  ref_type,
  ref_id,
  note,
  operatorId,
  mode = 'available', // available | freeze | release | unfreeze_debit | debit
}, transaction) {
  const run = async (t) => {
    const acc = await ensureAccount(userId, t);
    await acc.reload({ transaction: t, lock: t.LOCK.UPDATE });
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!(amt > 0) && type !== 'settle') {
      /* allow settle 0 */
    }
    if (mode === 'available') {
      acc.available = Number(acc.available) + amt;
    } else if (mode === 'debit') {
      if (Number(acc.available) + 1e-9 < amt) {
        throw new AppError(`可用资金不足：需要 ${amt}，可用 ${acc.available}`, 400, 'INSUFFICIENT_FUNDS');
      }
      acc.available = Number(acc.available) - amt;
    } else if (mode === 'freeze') {
      if (Number(acc.available) < amt) throw new AppError('可用资金不足，无法冻结保证金');
      acc.available = Number(acc.available) - amt;
      acc.frozen = Number(acc.frozen) + amt;
    } else if (mode === 'release') {
      const use = Math.min(Number(acc.frozen), amt);
      acc.frozen = Number(acc.frozen) - use;
      acc.available = Number(acc.available) + use;
    } else if (mode === 'unfreeze_debit') {
      const use = Math.min(Number(acc.frozen), amt);
      acc.frozen = Number(acc.frozen) - use;
      const rest = amt - use;
      if (rest > 0) {
        if (Number(acc.available) < rest) throw new AppError('资金不足');
        acc.available = Number(acc.available) - rest;
      }
    } else {
      throw new AppError('未知 ledger mode');
    }
    await acc.save({ transaction: t });
    return LedgerEntry.create(
      {
        account_id: acc.id,
        type,
        amount: amt,
        balance_after: Number(acc.available),
        ref_type: ref_type || null,
        ref_id: ref_id || null,
        note: note || null,
        operator_id: operatorId || null,
      },
      { transaction: t },
    );
  };
  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

export async function listEntries(userId, limit = 50) {
  const acc = await ensureAccount(userId);
  return LedgerEntry.findAll({
    where: { account_id: acc.id },
    order: [['id', 'DESC']],
    limit,
  });
}

/** 按流水类型汇总分账视图（保证金/权利金/结算等） */
export async function getLedgerBreakdown(userId) {
  const bal = await getBuyingPower(userId);
  const acc = await ensureAccount(userId);
  const entries = await LedgerEntry.findAll({ where: { account_id: acc.id } });
  const byType = {};
  for (const e of entries) {
    byType[e.type] = (byType[e.type] || 0) + Number(e.amount);
  }
  return {
    ...bal,
    buckets: {
      margin_frozen: bal.frozen,
      premium_paid: byType.premium || 0,
      settle_net: (byType.settle || 0) + (byType.payout || 0) - (byType.penalty || 0),
      deposits: byType.deposit || 0,
      partner_pay: byType.partner_pay || 0,
      penalty: byType.penalty || 0,
    },
    by_type: byType,
  };
}

export function entriesToCsv(entries) {
  const header = 'id,type,amount,balance_after,ref_type,ref_id,note,created_at';
  const lines = entries.map((e) => {
    const j = typeof e.toJSON === 'function' ? e.toJSON() : e;
    return [
      j.id,
      j.type,
      j.amount,
      j.balance_after,
      j.ref_type || '',
      j.ref_id || '',
      JSON.stringify(j.note || ''),
      j.createdAt || j.created_at || '',
    ].join(',');
  });
  return [header, ...lines].join('\n');
}

export async function adminDeposit(userId, amount, operatorId, note) {
  if (!(Number(amount) > 0)) throw new AppError('金额须大于 0');
  return postLedger({
    userId,
    type: 'deposit',
    amount: Number(amount),
    note: note || '运营入账',
    operatorId,
    mode: 'available',
  });
}

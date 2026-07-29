import { Op } from 'sequelize';
import {
  ForwardContract,
  SettlementBill,
  User,
  PriceIndex,
} from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { todayShanghai } from '../utils/market.js';
import { sequelize } from '../config/database.js';
import { getLatestPublished } from './index-price.js';
import {
  notifyForwardPendingConfirm,
  notifyForwardOpened,
  notifyForwardBill,
} from './notify.js';
import { isInDeliveryWindow } from './delivery-window.js';
import {
  assertForwardTransition,
  canRequestDelivery,
  lifecycleLabel,
} from './forward-state.js';
import {
  shouldSkipCashSettle,
  expireStalePendingDeliveries,
  deliveryRatioStats,
} from './delivery.js';

const CONFIRM_HOURS = 72;

const contractInclude = [
  { association: 'index', include: [{ association: 'sku', attributes: ['id', 'name', 'unit'] }] },
  { association: 'buyer', attributes: ['id', 'name', 'phone', 'company_name', 'email'] },
  { association: 'seller', attributes: ['id', 'name', 'phone', 'company_name', 'email'] },
  { association: 'broker', attributes: ['id', 'name', 'phone'] },
  { association: 'bill' },
  { association: 'delivery_orders' },
];

export function computeCashSettlement({ strike, settlePrice, qty }) {
  const X = Number(strike);
  const S = Number(settlePrice);
  const q = Number(qty);
  const signed = Math.round((S - X) * q * 100) / 100;
  let pay_direction = 'none';
  if (signed > 0) pay_direction = 'seller_to_buyer';
  else if (signed < 0) pay_direction = 'buyer_to_seller';
  return {
    amount: Math.abs(signed),
    signed_amount: signed,
    pay_direction,
  };
}

export async function presentForward(row, { markToMarket = true, viewerUserId = null } = {}) {
  const j = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
  j.lifecycle_label = lifecycleLabel(j.status);
  j.can_request_delivery = canRequestDelivery(j);
  const orders = j.delivery_orders || [];
  j.delivery_pending_review = orders.some((d) => d.status === 'pending');
  j.delivery_approved = orders.some((d) => d.status === 'approved');
  if (markToMarket && j.status === 'open' && j.index_id && j.settle_mode !== 'physical') {
    const print = await getLatestPublished(j.index_id);
    if (print) {
      const mt = computeCashSettlement({
        strike: j.strike_price,
        settlePrice: print.settle_price,
        qty: j.qty,
      });
      let signed = mt.signed_amount;
      let pay_direction = mt.pay_direction;
      // 客户视角：卖方看空头浮动盈亏（与买方相反）
      if (
        viewerUserId != null &&
        Number(viewerUserId) === Number(j.seller_id) &&
        Number(viewerUserId) !== Number(j.buyer_id)
      ) {
        signed = -signed;
        if (pay_direction === 'seller_to_buyer') pay_direction = 'buyer_to_seller';
        else if (pay_direction === 'buyer_to_seller') pay_direction = 'seller_to_buyer';
      }
      j.mtm = {
        settle_price: Number(print.settle_price),
        settle_price_date: print.date,
        signed_amount: signed,
        pay_direction,
        note: viewerUserId != null ? '非最终结算·对本方' : '非最终结算·买方视角',
      };
    } else {
      j.mtm = null;
    }
  }
  j.delivery_window_open =
    canRequestDelivery(j) && isInDeliveryWindow(j.expiry_date);
  return j;
}

export async function createForward(body, brokerId) {
  const {
    index_id,
    buyer_id,
    seller_id,
    qty,
    unit,
    strike_price,
    expiry_date,
    settle_mode,
    note,
    confirm_hours,
  } = body;
  if (!index_id || !buyer_id || !seller_id || qty == null || !strike_price || !expiry_date) {
    throw new AppError('index_id、buyer_id、seller_id、qty、strike_price、expiry_date 必填');
  }
  if (Number(buyer_id) === Number(seller_id)) throw new AppError('买方与卖方不能为同一人');
  if (!(Number(qty) > 0)) throw new AppError('数量须大于 0');
  if (!(Number(strike_price) > 0)) throw new AppError('锁价 X 须大于 0');
  const index = await PriceIndex.findByPk(index_id);
  if (!index || index.status !== 'active') throw new AppError('指数不存在或未启用');
  const latestS = await getLatestPublished(index.id);
  if (!latestS) {
    throw new AppError('该指数尚无已发布结算价 S，请先在价格指数发布后再开仓');
  }
  const [buyer, seller] = await Promise.all([
    User.findByPk(buyer_id),
    User.findByPk(seller_id),
  ]);
  if (!buyer || !seller) throw new AppError('买方或卖方用户不存在');

  if (settle_mode === 'physical') {
    throw new AppError('开仓默认现金结算，请到期前在窗口内申请实物交割');
  }

  const hours = Number(confirm_hours) > 0 ? Number(confirm_hours) : CONFIRM_HOURS;
  const deadline = new Date(Date.now() + hours * 3600 * 1000);

  const contract = await ForwardContract.create({
    index_id: Number(index_id),
    buyer_id: Number(buyer_id),
    seller_id: Number(seller_id),
    qty: Number(qty),
    unit: unit || '月',
    strike_price: Number(strike_price),
    expiry_date,
    settle_mode: 'cash',
    status: 'pending_confirm',
    broker_id: brokerId || null,
    confirm_deadline_at: deadline,
    note: note || null,
  });

  const full = await ForwardContract.findByPk(contract.id, { include: contractInclude });
  await notifyForwardPendingConfirm(full);
  return full;
}

async function tryOpen(contract) {
  if (contract.buyer_confirmed_at && contract.seller_confirmed_at) {
    assertForwardTransition(contract.status, 'open');
    contract.status = 'open';
    await contract.save();
    const full = await ForwardContract.findByPk(contract.id, { include: contractInclude });
    await notifyForwardOpened(full);
    return full;
  }
  return contract;
}

function cancelIfPastDeadline(contract) {
  if (contract.confirm_deadline_at && new Date(contract.confirm_deadline_at) < new Date()) {
    assertForwardTransition(contract.status, 'cancelled');
    contract.status = 'cancelled';
    contract.cancel_reason = '确认超时自动取消';
    return true;
  }
  return false;
}

export async function confirmForward(contractId, userId) {
  const contract = await ForwardContract.findByPk(contractId, { include: contractInclude });
  if (!contract) throw new AppError('合约不存在', 404);
  if (contract.status !== 'pending_confirm') throw new AppError('当前状态不可确认');
  if (cancelIfPastDeadline(contract)) {
    await contract.save();
    throw new AppError('已超过确认截止时间，合约已取消');
  }

  const uid = Number(userId);
  if (uid === Number(contract.buyer_id)) {
    if (contract.buyer_confirmed_at) throw new AppError('买方已确认');
    contract.buyer_confirmed_at = new Date();
    contract.buyer_confirm_by = uid;
  } else if (uid === Number(contract.seller_id)) {
    if (contract.seller_confirmed_at) throw new AppError('卖方已确认');
    contract.seller_confirmed_at = new Date();
    contract.seller_confirm_by = uid;
  } else {
    throw new AppError('仅买方或卖方可确认', 403);
  }
  await contract.save();
  return tryOpen(contract);
}

export async function proxyConfirm(contractId, { side, note }, operatorId) {
  if (!note || !String(note).trim()) throw new AppError('代理确认必须填写备注');
  if (!['buyer', 'seller'].includes(side)) throw new AppError('side 须为 buyer 或 seller');

  const contract = await ForwardContract.findByPk(contractId, { include: contractInclude });
  if (!contract) throw new AppError('合约不存在', 404);
  if (contract.status !== 'pending_confirm') throw new AppError('当前状态不可确认');
  if (cancelIfPastDeadline(contract)) {
    await contract.save();
    throw new AppError('已超过确认截止时间，合约已取消');
  }

  const now = new Date();
  if (side === 'buyer') {
    if (contract.buyer_confirmed_at) throw new AppError('买方已确认');
    contract.buyer_confirmed_at = now;
    contract.buyer_confirm_by = operatorId;
  } else {
    if (contract.seller_confirmed_at) throw new AppError('卖方已确认');
    contract.seller_confirmed_at = now;
    contract.seller_confirm_by = operatorId;
  }
  const existing = contract.note || '';
  contract.note = `${existing}\n[proxy-confirm ${side}] ${String(note).trim()}`.trim();
  await contract.save();
  return tryOpen(contract);
}

export async function cancelForward(contractId, reason) {
  const contract = await ForwardContract.findByPk(contractId);
  if (!contract) throw new AppError('合约不存在', 404);
  if (contract.status !== 'pending_confirm') throw new AppError('仅待确认合约可作废');
  assertForwardTransition(contract.status, 'cancelled');
  contract.status = 'cancelled';
  contract.cancel_reason = reason || 'Broker 作废';
  await contract.save();
  return contract;
}

export async function expirePendingConfirms(now = new Date()) {
  const [n] = await ForwardContract.update(
    {
      status: 'cancelled',
      cancel_reason: '确认超时自动取消',
    },
    {
      where: {
        status: 'pending_confirm',
        confirm_deadline_at: { [Op.lt]: now },
      },
    },
  );
  return n;
}

export async function listForwardsAdmin(query = {}) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.index_id) where.index_id = query.index_id;
  return ForwardContract.findAll({
    where,
    include: contractInclude,
    order: [['id', 'DESC']],
  });
}

export async function listForwardsForUser(userId) {
  const rows = await ForwardContract.findAll({
    where: {
      [Op.or]: [{ buyer_id: userId }, { seller_id: userId }],
    },
    include: contractInclude,
    order: [['id', 'DESC']],
  });
  return Promise.all(rows.map((r) => presentForward(r, { viewerUserId: userId })));
}

/** 单笔现金结算 */
export async function settleOne(contractId, { asOf = todayShanghai() } = {}) {
  if (await shouldSkipCashSettle(contractId)) {
    return { contract_id: Number(contractId), ok: false, reason: '已转实物交割或有进行中工单' };
  }

  const result = await sequelize.transaction(async (t) => {
    const locked = await ForwardContract.findByPk(contractId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!locked || locked.status !== 'open' || locked.settle_mode !== 'cash') {
      throw new AppError('合约状态已变更');
    }
    if (locked.expiry_date > asOf) throw new AppError('未到期');
    if (await shouldSkipCashSettle(contractId)) {
      throw new AppError('已转实物交割或有进行中工单');
    }

    const print = await getLatestPublished(locked.index_id, locked.expiry_date);
    if (!print) throw new AppError('无可用 published 结算价');

    const dup = await SettlementBill.findOne({
      where: { contract_id: locked.id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (dup) throw new AppError('已有账单');

    const settled = computeCashSettlement({
      strike: locked.strike_price,
      settlePrice: print.settle_price,
      qty: locked.qty,
    });

    assertForwardTransition(locked.status, 'settled');
    const bill = await SettlementBill.create(
      {
        contract_id: locked.id,
        settle_date: asOf,
        settle_price: print.settle_price,
        settle_price_date: print.date,
        strike: locked.strike_price,
        qty: locked.qty,
        amount: settled.amount,
        pay_direction: settled.pay_direction,
        pay_status: 'pending',
      },
      { transaction: t },
    );
    locked.status = 'settled';
    await locked.save({ transaction: t });
    return { bill, ...settled };
  });

  const full = await ForwardContract.findByPk(contractId, { include: contractInclude });
  try {
    await notifyForwardBill(full, result.bill);
  } catch (notifyErr) {
    console.error('[settleOne] notify failed', contractId, notifyErr?.message || notifyErr);
  }

  return {
    contract_id: Number(contractId),
    ok: true,
    bill_id: result.bill.id,
    amount: result.amount,
    pay_direction: result.pay_direction,
  };
}

/** 到期批结算：编排 = 超时确认 + 过期交割驳回 + 逐笔 settleOne */
export async function settleBatch({ asOf = todayShanghai() } = {}) {
  await expirePendingConfirms();
  await expireStalePendingDeliveries(asOf);

  const contracts = await ForwardContract.findAll({
    where: {
      status: 'open',
      settle_mode: 'cash',
      expiry_date: { [Op.lte]: asOf },
    },
    attributes: ['id'],
  });

  const results = [];
  for (const c of contracts) {
    try {
      results.push(await settleOne(c.id, { asOf }));
    } catch (e) {
      results.push({
        contract_id: c.id,
        ok: false,
        reason: e.message || '结算失败',
      });
    }
  }
  return results;
}

export async function confirmBillPay(billId, operatorId) {
  const bill = await SettlementBill.findByPk(billId, {
    include: [{ association: 'contract', include: contractInclude }],
  });
  if (!bill) throw new AppError('账单不存在', 404);
  if (bill.pay_status === 'done') throw new AppError('已确认收付');
  bill.pay_status = 'done';
  bill.confirmed_by = operatorId;
  bill.confirmed_at = new Date();
  await bill.save();
  return bill;
}

export async function listBillsAdmin() {
  return SettlementBill.findAll({
    include: [{ association: 'contract', include: contractInclude }],
    order: [['id', 'DESC']],
  });
}

export async function listBillsForUser(userId) {
  const bills = await SettlementBill.findAll({
    include: [
      {
        association: 'contract',
        required: true,
        where: {
          [Op.or]: [{ buyer_id: userId }, { seller_id: userId }],
        },
        include: contractInclude.filter((i) => i.association !== 'bill'),
      },
    ],
    order: [['id', 'DESC']],
  });
  return bills.map((b) => {
    const j = b.toJSON();
    const c = j.contract;
    const isBuyer = c && Number(c.buyer_id) === Number(userId);
    let my_role = isBuyer ? 'buyer' : 'seller';
    let cashflow = 'flat';
    if (j.pay_direction === 'seller_to_buyer') {
      cashflow = isBuyer ? 'receive' : 'pay';
    } else if (j.pay_direction === 'buyer_to_seller') {
      cashflow = isBuyer ? 'pay' : 'receive';
    }
    j.my_role = my_role;
    j.cashflow = cashflow;
    j.cashflow_label =
      cashflow === 'receive' ? '应收' : cashflow === 'pay' ? '应付' : '无收付';
    return j;
  });
}

export async function dashboardForwardStats() {
  const [settled_contracts, pending_confirms] = await Promise.all([
    ForwardContract.count({ where: { status: 'settled' } }),
    ForwardContract.count({ where: { status: 'pending_confirm' } }),
  ]);
  const ratio = await deliveryRatioStats();
  return {
    settled_contracts,
    pending_confirms,
    delivered_contracts: ratio.delivered_contracts,
    physical_ratio_pct: ratio.physical_ratio_pct,
  };
}

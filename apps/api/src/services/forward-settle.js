import { Op } from 'sequelize';
import {
  ForwardContract,
  SettlementBill,
  User,
  PriceIndex,
} from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { todayShanghai, addDaysShanghai, addMonthsShanghai } from '../utils/market.js';
import { sequelize } from '../config/database.js';
import { getLatestPublished } from './index-price.js';
import {
  notifyForwardPendingConfirm,
  notifyForwardOpened,
  notifyForwardBill,
} from './notify.js';
import { isInDeliveryWindow, deliveryWindowDaysBefore } from './delivery-window.js';
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
import { assertCapacity, consumeCapacity, releaseCapacity } from './partner-capacity.js';
import { assertNotionalLimits } from './exposure.js';
import { getPlatformParams } from './platform-config.js';
import { suggestPresalePrice } from './index-engine.js';
import { assertBuyingPower, postLedger } from './ledger.js';

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
    canRequestDelivery(j) && (await isInDeliveryWindow(j.expiry_date));
  const spotOpen = Number(j.spot_ref_at_open);
  const strike = Number(j.strike_price);
  if (spotOpen > 0 && strike > 0) {
    j.discount_pct = Math.round(((spotOpen - strike) / spotOpen) * 10000) / 100;
    j.discount_label =
      j.discount_pct > 0
        ? `相对开仓现货折让约 ${j.discount_pct}%`
        : j.discount_pct < 0
          ? `相对开仓现货溢价约 ${Math.abs(j.discount_pct)}%`
          : '与开仓现货持平';
  }
  if (j.mtm?.settle_price > 0 && strike > 0) {
    j.vs_settle_pct =
      Math.round(((Number(j.mtm.settle_price) - strike) / Number(j.mtm.settle_price)) * 10000) / 100;
  }
  j.intent_window_open = j.status === 'open' && (await isInDeliveryWindow(j.expiry_date));
  return j;
}

/** 客户可见的预售挂牌（按活跃指数 + 建议预售价） */
export async function listPresaleOffers() {
  const params = await getPlatformParams();
  const indices = await PriceIndex.findAll({
    where: { status: 'active' },
    include: [{ association: 'sku', attributes: ['id', 'name', 'unit'] }],
    order: [['id', 'ASC']],
  });
  const out = [];
  for (const idx of indices) {
    const print = await getLatestPublished(idx.id);
    if (!print) continue;
    const spot = Number(print.settle_price);
    const band = suggestPresalePrice(spot, params);
    const months = Number(params.presale_months) || 6;
    out.push({
      index_id: idx.id,
      code: idx.code,
      region: idx.region,
      sku: idx.sku,
      spot_settle: spot,
      spot_date: print.date,
      strike_suggest: band.mid,
      strike_low: band.low,
      strike_high: band.high,
      basis_pct: band.basis_pct,
      discount_pct: Math.round(((spot - band.mid) / spot) * 10000) / 100,
      expiry_suggest: addMonthsShanghai(todayShanghai(), months),
      tenor_months: months,
      unit: idx.sku?.unit || '台·月',
    });
  }
  return out;
}

async function resolveDefaultSellerId() {
  const email = process.env.DEFAULT_FORWARD_SELLER_EMAIL || 'seller@comprix.local';
  const seller = await User.findOne({ where: { email } });
  if (!seller) throw new AppError('默认对手方未配置，请联系运营', 503);
  return seller.id;
}

/** 客户自助买入预售（对手方固定为平台默认卖方，忽略客户端传入的 seller_id） */
export async function selfOpenForward(buyerId, body) {
  const seller_id = await resolveDefaultSellerId();
  if (Number(seller_id) === Number(buyerId)) {
    throw new AppError('默认对手方未配置或与买方相同，请联系运营', 503);
  }
  return createForward(
    {
      ...body,
      buyer_id: buyerId,
      seller_id,
      presale: true,
      note: body.note || '客户自助预售',
    },
    null,
  );
}

export async function createForward(body, brokerId) {
  let {
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
    region,
    presale,
    tenor_months,
  } = body;
  if (!index_id || !buyer_id || !seller_id || qty == null || !strike_price) {
    throw new AppError('index_id、buyer_id、seller_id、qty、strike_price 必填');
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

  const params = await getPlatformParams();

  // FRD 预售：默认固定 6 月交割；测试可用 tenor_months / 显式 expiry_date 覆盖
  if (presale || (!expiry_date && tenor_months == null)) {
    const months = Number(tenor_months > 0 ? tenor_months : params.presale_months);
    expiry_date = addMonthsShanghai(todayShanghai(), months);
  }
  if (!expiry_date) throw new AppError('expiry_date 必填');

  const spot = Number(latestS.settle_price);
  const band = suggestPresalePrice(spot, params);
  const x = Number(strike_price);
  if (x < band.low * 0.85 || x > band.high * 1.15) {
    throw new AppError(
      `预售价偏离基差带过多（建议 ${band.low}-${band.high}，现货 ${spot}）`,
    );
  }

  const hours = Number(confirm_hours) > 0 ? Number(confirm_hours) : CONFIRM_HOURS;
  const deadline = new Date(Date.now() + hours * 3600 * 1000);
  const reg = region || index.region || 'shanghai';
  const expiry = new Date(expiry_date);
  const deliveryMonth = `${expiry.getUTCFullYear()}-${String(expiry.getUTCMonth() + 1).padStart(2, '0')}`;
  const code = `PS-${index.code}-${deliveryMonth}-${Date.now().toString(36).slice(-4)}`;
  const marginPct = Number(params.margin_initial_pct);
  const notional = x * Number(qty);
  const marginFrozen = Math.round(notional * (marginPct / 100) * 100) / 100;

  const { assertNotUnderMarginBlock } = await import('./margin-monitor.js');
  await assertNotUnderMarginBlock(buyer_id);

  return sequelize.transaction(async (t) => {
    await assertNotionalLimits(buyer_id, notional, t);
    await assertBuyingPower(buyer_id, marginFrozen, t);
    if (index.sku_id) {
      await assertCapacity('forward', index.sku_id, reg, qty, t);
      await consumeCapacity('forward', index.sku_id, reg, qty, t);
    }
    const contract = await ForwardContract.create(
      {
        index_id: Number(index_id),
        buyer_id: Number(buyer_id),
        seller_id: Number(seller_id),
        qty: Number(qty),
        unit: unit || '台·月',
        strike_price: x,
        expiry_date,
        region: reg,
        contract_code: code,
        delivery_month: deliveryMonth,
        basis_rate: params.presale_basis_pct,
        spot_ref_at_open: spot,
        margin_initial_pct: marginPct,
        margin_maintain_pct: params.margin_maintain_pct,
        margin_frozen: marginFrozen,
        settle_mode: 'cash',
        status: 'pending_confirm',
        broker_id: brokerId || null,
        confirm_deadline_at: deadline,
        note: note || null,
      },
      { transaction: t },
    );

    await postLedger(
      {
        userId: buyer_id,
        type: 'margin_freeze',
        amount: marginFrozen,
        ref_type: 'forward',
        ref_id: contract.id,
        note: '预售初始保证金',
        mode: 'freeze',
      },
      t,
    );

    const full = await ForwardContract.findByPk(contract.id, {
      include: contractInclude,
      transaction: t,
    });
    await notifyForwardPendingConfirm(full);
    return full;
  });
}

export async function setDeliveryIntent(contractId, userId, intent) {
  if (!['cash', 'physical'].includes(intent)) throw new AppError('intent 须为 cash 或 physical');
  const contract = await ForwardContract.findByPk(contractId, { include: contractInclude });
  if (!contract) throw new AppError('合约不存在', 404);
  if (contract.status !== 'open') throw new AppError('仅持仓中可确认交割意愿');
  if (Number(userId) !== Number(contract.buyer_id)) throw new AppError('仅买方可确认意愿', 403);
  if (!(await isInDeliveryWindow(contract.expiry_date))) {
    const n = await deliveryWindowDaysBefore();
    const windowStart = addDaysShanghai(contract.expiry_date, -n);
    throw new AppError(
      `交割意愿确认窗口为到期前 ${n} 天至到期日（${windowStart} ~ ${contract.expiry_date}）`,
    );
  }
  contract.delivery_intent = intent;
  await contract.save();
  return presentForward(contract, { viewerUserId: userId });
}

async function releaseForwardCapacityIfAny(contract, transaction) {
  const index = await PriceIndex.findByPk(contract.index_id, { transaction });
  if (!index?.sku_id) return;
  await releaseCapacity(
    'forward',
    index.sku_id,
    contract.region || index.region || 'shanghai',
    contract.qty,
    transaction,
  );
}

async function tryOpen(contract, transaction) {
  if (contract.buyer_confirmed_at && contract.seller_confirmed_at) {
    assertForwardTransition(contract.status, 'open');
    contract.status = 'open';
    await contract.save({ transaction });
    const full = await ForwardContract.findByPk(contract.id, {
      include: contractInclude,
      transaction,
    });
    await notifyForwardOpened(full);
    return full;
  }
  return contract;
}

async function cancelIfPastDeadline(contract, transaction) {
  if (contract.confirm_deadline_at && new Date(contract.confirm_deadline_at) < new Date()) {
    assertForwardTransition(contract.status, 'cancelled');
    contract.status = 'cancelled';
    contract.cancel_reason = '确认超时自动取消';
    if (Number(contract.margin_frozen) > 0) {
      const { postLedger } = await import('./ledger.js');
      await postLedger(
        {
          userId: contract.buyer_id,
          type: 'margin_release',
          amount: Number(contract.margin_frozen),
          ref_type: 'forward',
          ref_id: contract.id,
          note: '预售超时释放保证金',
          mode: 'release',
        },
        transaction,
      );
      contract.margin_frozen = 0;
    }
    await releaseForwardCapacityIfAny(contract, transaction);
    return true;
  }
  return false;
}

export async function confirmForward(contractId, userId) {
  const result = await sequelize.transaction(async (t) => {
    const contract = await ForwardContract.findByPk(contractId, {
      include: contractInclude,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!contract) throw new AppError('合约不存在', 404);
    if (contract.status !== 'pending_confirm') throw new AppError('当前状态不可确认');
    if (await cancelIfPastDeadline(contract, t)) {
      await contract.save({ transaction: t });
      return { timedOut: true };
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
    await contract.save({ transaction: t });
    return { timedOut: false, contract: await tryOpen(contract, t) };
  });
  if (result.timedOut) throw new AppError('已超过确认截止时间，合约已取消');
  return result.contract;
}

export async function proxyConfirm(contractId, { side, note }, operatorId) {
  if (!note || !String(note).trim()) throw new AppError('代理确认必须填写备注');
  if (!['buyer', 'seller'].includes(side)) throw new AppError('side 须为 buyer 或 seller');

  const result = await sequelize.transaction(async (t) => {
    const contract = await ForwardContract.findByPk(contractId, {
      include: contractInclude,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!contract) throw new AppError('合约不存在', 404);
    if (contract.status !== 'pending_confirm') throw new AppError('当前状态不可确认');
    if (await cancelIfPastDeadline(contract, t)) {
      await contract.save({ transaction: t });
      return { timedOut: true };
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
    await contract.save({ transaction: t });
    return { timedOut: false, contract: await tryOpen(contract, t) };
  });
  if (result.timedOut) throw new AppError('已超过确认截止时间，合约已取消');
  return result.contract;
}

export async function cancelForward(contractId, reason) {
  const { postLedger } = await import('./ledger.js');
  return sequelize.transaction(async (t) => {
    const contract = await ForwardContract.findByPk(contractId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!contract) throw new AppError('合约不存在', 404);
    if (contract.status !== 'pending_confirm') throw new AppError('仅待确认合约可作废');
    assertForwardTransition(contract.status, 'cancelled');
    contract.status = 'cancelled';
    contract.cancel_reason = reason || 'Broker 作废';
    await contract.save({ transaction: t });
    if (Number(contract.margin_frozen) > 0) {
      await postLedger(
        {
          userId: contract.buyer_id,
          type: 'margin_release',
          amount: Number(contract.margin_frozen),
          ref_type: 'forward',
          ref_id: contract.id,
          note: '预售作废释放保证金',
          mode: 'release',
        },
        t,
      );
      contract.margin_frozen = 0;
      await contract.save({ transaction: t });
    }
    await releaseForwardCapacityIfAny(contract, t);
    return contract;
  });
}

export async function expirePendingConfirms(now = new Date()) {
  const { postLedger } = await import('./ledger.js');
  const stale = await ForwardContract.findAll({
    where: {
      status: 'pending_confirm',
      confirm_deadline_at: { [Op.lt]: now },
    },
  });
  let n = 0;
  for (const c of stale) {
    await sequelize.transaction(async (t) => {
      const contract = await ForwardContract.findByPk(c.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!contract || contract.status !== 'pending_confirm') return;
      contract.status = 'cancelled';
      contract.cancel_reason = '确认超时自动取消';
      await contract.save({ transaction: t });
      if (Number(contract.margin_frozen) > 0) {
        await postLedger(
          {
            userId: contract.buyer_id,
            type: 'margin_release',
            amount: Number(contract.margin_frozen),
            ref_type: 'forward',
            ref_id: contract.id,
            note: '预售超时释放保证金',
            mode: 'release',
          },
          t,
        );
        contract.margin_frozen = 0;
        await contract.save({ transaction: t });
      }
      await releaseForwardCapacityIfAny(contract, t);
      n += 1;
    });
  }
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
    return { contract_id: Number(contractId), ok: false, reason: '交割进行中或争议中，跳过现金结算' };
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
      throw new AppError('交割进行中或争议中，不可现金结算');
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
    const frozen = Number(locked.margin_frozen) || 0;
    if (frozen > 0) {
      const { postLedger } = await import('./ledger.js');
      // 买方应付差价时保留冻结保证金供 confirmBillPay 扣款，其余释放
      const keep =
        settled.pay_direction === 'buyer_to_seller' && Number(settled.amount) > 0
          ? Math.min(frozen, Number(settled.amount))
          : 0;
      const releaseAmt = frozen - keep;
      if (releaseAmt > 0) {
        await postLedger(
          {
            userId: locked.buyer_id,
            type: 'margin_release',
            amount: releaseAmt,
            ref_type: 'forward',
            ref_id: locked.id,
            note: '预售结算释放保证金',
            mode: 'release',
          },
          t,
        );
      }
      locked.margin_frozen = keep;
    }
    await locked.save({ transaction: t });
    await releaseForwardCapacityIfAny(locked, t);
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
  return sequelize.transaction(async (t) => {
    const bill = await SettlementBill.findByPk(billId, {
      include: [{ association: 'contract', include: contractInclude }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!bill) throw new AppError('账单不存在', 404);
    if (bill.pay_status === 'done') throw new AppError('已确认收付');
    const contract = bill.contract;
    if (!contract) throw new AppError('账单无关联合约');

    const amt = Number(bill.amount);
    if (amt > 0 && bill.pay_direction !== 'none') {
      const { postLedger } = await import('./ledger.js');
      const payer =
        bill.pay_direction === 'buyer_to_seller' ? contract.buyer_id : contract.seller_id;
      const payee =
        bill.pay_direction === 'buyer_to_seller' ? contract.seller_id : contract.buyer_id;
      const buyerFrozen = Number(contract.margin_frozen) || 0;
      const payerMode =
        Number(payer) === Number(contract.buyer_id) && buyerFrozen > 0
          ? 'unfreeze_debit'
          : 'debit';
      await postLedger(
        {
          userId: payer,
          type: 'settle',
          amount: amt,
          ref_type: 'settlement_bill',
          ref_id: bill.id,
          note: '远期差价结算扣款',
          operatorId,
          mode: payerMode,
        },
        t,
      );
      await postLedger(
        {
          userId: payee,
          type: 'settle',
          amount: amt,
          ref_type: 'settlement_bill',
          ref_id: bill.id,
          note: '远期差价结算入账',
          operatorId,
          mode: 'available',
        },
        t,
      );
      if (buyerFrozen > 0) {
        contract.margin_frozen = 0;
        await contract.save({ transaction: t });
      }
    } else if (Number(contract.margin_frozen) > 0) {
      const { postLedger } = await import('./ledger.js');
      await postLedger(
        {
          userId: contract.buyer_id,
          type: 'margin_release',
          amount: Number(contract.margin_frozen),
          ref_type: 'forward',
          ref_id: contract.id,
          note: '账单确认后释放剩余保证金',
          operatorId,
          mode: 'release',
        },
        t,
      );
      contract.margin_frozen = 0;
      await contract.save({ transaction: t });
    }

    bill.pay_status = 'done';
    bill.confirmed_by = operatorId;
    bill.confirmed_at = new Date();
    await bill.save({ transaction: t });
    const j = bill.toJSON();
    j.ledger_posted = amt > 0 && bill.pay_direction !== 'none';
    return j;
  });
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

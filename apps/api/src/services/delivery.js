import { Op } from 'sequelize';
import {
  DeliveryChannel,
  DeliveryWhitelist,
  DeliveryOrder,
  ForwardContract,
  Supplier,
  Sku,
  User,
} from '../models/index.js';
import { sequelize } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { todayShanghai } from '../utils/market.js';
import {
  isInDeliveryWindow,
  DELIVERY_WINDOW_DAYS_BEFORE,
} from './delivery-window.js';
import {
  assertForwardTransition,
  blocksCashSettle,
  canRequestDelivery,
} from './forward-state.js';

export { isInDeliveryWindow } from './delivery-window.js';

const orderInclude = [
  {
    association: 'contract',
    include: [
      { association: 'index', include: [{ association: 'sku', attributes: ['id', 'name'] }] },
      { association: 'buyer', attributes: ['id', 'name', 'phone', 'company_name', 'email'] },
      { association: 'seller', attributes: ['id', 'name', 'phone', 'company_name', 'email'] },
    ],
  },
  {
    association: 'channel',
    include: [
      { association: 'supplier', attributes: ['id', 'name', 'display_name'] },
      { association: 'sku', attributes: ['id', 'name'] },
    ],
  },
  { association: 'requester', attributes: ['id', 'name', 'phone', 'email'] },
];

export async function listChannels({ activeOnly = false } = {}) {
  const where = activeOnly ? { active: true } : {};
  return DeliveryChannel.findAll({
    where,
    include: [
      { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'display_name'] },
      { model: Sku, as: 'sku', attributes: ['id', 'name', 'unit'] },
    ],
    order: [['id', 'ASC']],
  });
}

export async function createChannel({ supplier_id, sku_id, name, active }) {
  if (!supplier_id || !sku_id || !name) throw new AppError('supplier_id、sku_id、name 必填');
  const [sup, sku] = await Promise.all([
    Supplier.findByPk(supplier_id),
    Sku.findByPk(sku_id),
  ]);
  if (!sup) throw new AppError('供应商不存在', 404);
  if (!sku) throw new AppError('SKU 不存在', 404);
  return DeliveryChannel.create({
    supplier_id: Number(supplier_id),
    sku_id: Number(sku_id),
    name: String(name).trim(),
    active: active !== false,
  });
}

export async function updateChannel(id, patch) {
  const row = await DeliveryChannel.findByPk(id);
  if (!row) throw new AppError('交割通道不存在', 404);
  for (const f of ['name', 'supplier_id', 'sku_id', 'active']) {
    if (patch[f] !== undefined) row[f] = patch[f];
  }
  await row.save();
  return row;
}

export async function listWhitelists() {
  return DeliveryWhitelist.findAll({
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'phone', 'company_name', 'email', 'role'] },
      { model: User, as: 'approver', attributes: ['id', 'name'] },
    ],
    order: [['id', 'ASC']],
  });
}

export async function upsertWhitelist({ user_id, active = true, note }, approvedBy) {
  if (!user_id) throw new AppError('user_id 必填');
  const user = await User.findByPk(user_id);
  if (!user) throw new AppError('用户不存在', 404);
  let row = await DeliveryWhitelist.findOne({ where: { user_id } });
  if (row) {
    row.active = !!active;
    if (note !== undefined) row.note = note;
    row.approved_by = approvedBy;
    await row.save();
  } else {
    row = await DeliveryWhitelist.create({
      user_id: Number(user_id),
      active: !!active,
      note: note || null,
      approved_by: approvedBy,
    });
  }
  return row;
}

export async function isUserWhitelisted(userId) {
  const row = await DeliveryWhitelist.findOne({
    where: { user_id: userId, active: true },
  });
  return !!row;
}

export async function requestDelivery(contractId, userId, { channel_id, note } = {}) {
  if (!channel_id) throw new AppError('请选择交割通道');

  return sequelize.transaction(async (t) => {
    const contract = await ForwardContract.findByPk(contractId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [{ association: 'index' }],
    });
    if (!contract) throw new AppError('合约不存在', 404);
    if (!canRequestDelivery(contract)) throw new AppError('仅持仓中现金合约可申请交割');

    const uid = Number(userId);
    if (uid !== Number(contract.buyer_id) && uid !== Number(contract.seller_id)) {
      throw new AppError('仅合约买方或卖方可申请', 403);
    }
    if (!(await isUserWhitelisted(uid))) {
      throw new AppError('账户未开通实物交割白名单', 403);
    }
    if (!isInDeliveryWindow(contract.expiry_date)) {
      throw new AppError(
        `不在交割申请窗口内（到期日前 ${DELIVERY_WINDOW_DAYS_BEFORE} 天至到期日当日）`,
      );
    }

    const openReq = await DeliveryOrder.findOne({
      where: {
        contract_id: contract.id,
        status: { [Op.in]: ['pending', 'approved'] },
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (openReq) throw new AppError('已有进行中的交割申请');

    const channel = await DeliveryChannel.findByPk(channel_id, { transaction: t });
    if (!channel || !channel.active) throw new AppError('交割通道不可用');

    if (contract.index?.sku_id && Number(channel.sku_id) !== Number(contract.index.sku_id)) {
      throw new AppError('交割通道 SKU 与合约标的不一致');
    }

    return DeliveryOrder.create(
      {
        contract_id: contract.id,
        channel_id: channel.id,
        status: 'pending',
        requested_by: uid,
        note: note || null,
      },
      { transaction: t },
    );
  });
}

export async function listDeliveryOrders(query = {}) {
  const where = {};
  if (query.status) where.status = query.status;
  const include = orderInclude.map((inc) => {
    const copy = { ...inc };
    if (inc.include) copy.include = inc.include.map((x) => ({ ...x }));
    return copy;
  });
  if (query.supplier_id) {
    const chInc = include.find((i) => i.association === 'channel');
    if (chInc) {
      chInc.where = { ...(chInc.where || {}), supplier_id: Number(query.supplier_id) };
      chInc.required = true;
    }
  }
  return DeliveryOrder.findAll({
    where,
    include,
    order: [['id', 'DESC']],
  });
}

export async function approveDelivery(orderId, operatorId) {
  const row = await DeliveryOrder.findByPk(orderId, { include: orderInclude });
  if (!row) throw new AppError('交割工单不存在', 404);
  if (row.status !== 'pending') throw new AppError('仅待审核工单可批准');

  await sequelize.transaction(async (t) => {
    const order = await DeliveryOrder.findByPk(orderId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!order || order.status !== 'pending') throw new AppError('工单状态已变更');

    if (order.contract_id) {
      const contract = await ForwardContract.findByPk(order.contract_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!contract || contract.status !== 'open') throw new AppError('合约状态不可交割');
      assertForwardTransition(contract.status, 'delivery_pending');
      contract.status = 'delivery_pending';
      contract.settle_mode = 'physical';
      await contract.save({ transaction: t });
    } else if (order.right_contract_id) {
      const { RightContract } = await import('../models/frd-models.js');
      const right = await RightContract.findByPk(order.right_contract_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!right || right.status !== 'exercised') {
        throw new AppError('权益状态不可交割（须已行权）');
      }
    } else if (!order.spot_fill_id && !order.order_id) {
      throw new AppError('工单缺少关联合约/成交，无法批准');
    }

    order.status = 'approved';
    order.reviewed_by = operatorId;
    order.reviewed_at = new Date();
    await order.save({ transaction: t });
  });

  return DeliveryOrder.findByPk(orderId, { include: orderInclude });
}

export async function rejectDelivery(orderId, operatorId, reason) {
  const row = await DeliveryOrder.findByPk(orderId, { include: orderInclude });
  if (!row) throw new AppError('交割工单不存在', 404);
  if (row.status !== 'pending') throw new AppError('仅待审核工单可驳回');
  row.status = 'rejected';
  row.reviewed_by = operatorId;
  row.reviewed_at = new Date();
  row.note = `${row.note || ''}\n[reject] ${reason || '驳回'}`.trim();
  await row.save();
  return row;
}

export async function completeDelivery(orderId, operatorId) {
  const row = await DeliveryOrder.findByPk(orderId, { include: orderInclude });
  if (!row) throw new AppError('交割工单不存在', 404);
  if (!['approved', 'in_delivery'].includes(row.status)) {
    throw new AppError('仅已批准/交割中工单可完成');
  }

  await sequelize.transaction(async (t) => {
    const order = await DeliveryOrder.findByPk(orderId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!order || !['approved', 'in_delivery'].includes(order.status)) {
      throw new AppError('工单状态已变更');
    }

    if (order.contract_id) {
      const contract = await ForwardContract.findByPk(order.contract_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!contract || contract.status !== 'delivery_pending') {
        throw new AppError('合约状态不可完成交割');
      }
      assertForwardTransition(contract.status, 'delivered');
      contract.status = 'delivered';
      contract.settle_mode = 'physical';
      if (Number(contract.margin_frozen) > 0) {
        const { postLedger } = await import('./ledger.js');
        await postLedger(
          {
            userId: contract.buyer_id,
            type: 'margin_release',
            amount: Number(contract.margin_frozen),
            ref_type: 'forward',
            ref_id: contract.id,
            note: '实物交割完成释放保证金',
            operatorId,
            mode: 'release',
          },
          t,
        );
        contract.margin_frozen = 0;
      }
      await contract.save({ transaction: t });
    }

    order.status = 'done';
    order.completed_at = new Date();
    if (!order.reviewed_by) order.reviewed_by = operatorId;
    await order.save({ transaction: t });
  });

  return DeliveryOrder.findByPk(orderId, { include: orderInclude });
}

export async function startDelivery(orderId, operatorId) {
  const order = await DeliveryOrder.findByPk(orderId, {
    include: orderInclude,
  });
  if (!order) throw new AppError('交割工单不存在', 404);
  if (order.status !== 'approved') throw new AppError('仅已批准工单可进入交割中');
  order.status = 'in_delivery';
  if (!order.reviewed_by) order.reviewed_by = operatorId;
  await order.save();
  return DeliveryOrder.findByPk(orderId, { include: orderInclude });
}

export async function uploadDeliveryVoucher(orderId, voucherPath, note, { supplier_id } = {}) {
  const order = await DeliveryOrder.findByPk(orderId, { include: orderInclude });
  if (!order) throw new AppError('交割工单不存在', 404);
  if (supplier_id != null) {
    const sid = order.channel?.supplier_id ?? order.channel?.supplier?.id;
    if (Number(sid) !== Number(supplier_id)) {
      throw new AppError('无权操作该交割工单', 403);
    }
  }
  if (!['approved', 'in_delivery', 'done'].includes(order.status)) {
    throw new AppError('当前状态不可上传凭证');
  }
  order.voucher_path = voucherPath;
  if (note) order.note = `${order.note || ''}\n[voucher] ${note}`.trim();
  if (order.status === 'approved') order.status = 'in_delivery';
  await order.save();
  return DeliveryOrder.findByPk(orderId, { include: orderInclude });
}

/** 三方对账完成 → reconciled，可选伙伴收款入账 */
export async function reconcileDelivery(orderId, operatorId, { partner_pay_amount, partner_user_id } = {}) {
  return sequelize.transaction(async (t) => {
    const order = await DeliveryOrder.findByPk(orderId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: orderInclude,
    });
    if (!order) throw new AppError('交割工单不存在', 404);
    if (!['done', 'in_delivery'].includes(order.status)) {
      throw new AppError('仅已交割/交割中工单可对账');
    }
    if (!order.voucher_path && order.status === 'in_delivery') {
      throw new AppError('请先上传交割凭证');
    }
    order.status = 'reconciled';
    order.reconciled_at = new Date();
    if (!order.completed_at) order.completed_at = new Date();
    await order.save({ transaction: t });

    if (partner_pay_amount && Number(partner_pay_amount) > 0 && partner_user_id) {
      const { postLedger } = await import('./ledger.js');
      await postLedger(
        {
          userId: partner_user_id,
          type: 'partner_pay',
          amount: Number(partner_pay_amount),
          ref_type: 'delivery',
          ref_id: order.id,
          note: '交割对账伙伴收款',
          operatorId,
          mode: 'available',
        },
        t,
      );
    }
    return DeliveryOrder.findByPk(orderId, { include: orderInclude, transaction: t });
  });
}

/** 争议：冻结流程待人工裁定（不自动扣款） */
export async function disputeDelivery(orderId, operatorId, { reason, note } = {}) {
  const order = await DeliveryOrder.findByPk(orderId, { include: orderInclude });
  if (!order) throw new AppError('交割工单不存在', 404);
  if (['reconciled', 'rejected', 'done'].includes(order.status)) {
    throw new AppError('当前状态不可标记争议');
  }
  order.status = 'dispute';
  order.note = [order.note, `【争议】${reason || note || '客户/伙伴争议'}`]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
  order.reviewed_by = operatorId;
  order.reviewed_at = new Date();
  await order.save();
  return order;
}

/** 违约：扣划保证金并可选拉黑 */
export async function defaultDelivery(orderId, operatorId, { reason, blacklist = false, penalty_amount } = {}) {
  return sequelize.transaction(async (t) => {
    const order = await DeliveryOrder.findByPk(orderId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: orderInclude,
    });
    if (!order) throw new AppError('交割工单不存在', 404);
    if (['reconciled', 'rejected'].includes(order.status)) {
      throw new AppError('当前状态不可标记违约');
    }

    let buyerId = order.requested_by;
    let margin = Number(penalty_amount) || 0;
    if (order.contract_id) {
      const contract = await ForwardContract.findByPk(order.contract_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (contract) {
        buyerId = contract.buyer_id;
        if (!(margin > 0)) margin = Number(contract.margin_frozen) || 0;
        if (margin > 0 && Number(contract.margin_frozen) > 0) {
          const { postLedger } = await import('./ledger.js');
          const use = Math.min(margin, Number(contract.margin_frozen));
          await postLedger(
            {
              userId: buyerId,
              type: 'penalty',
              amount: use,
              ref_type: 'delivery',
              ref_id: order.id,
              note: reason || '交割违约扣划保证金',
              operatorId,
              mode: 'unfreeze_debit',
            },
            t,
          );
          contract.margin_frozen = Number(contract.margin_frozen) - use;
        }
        const leftover = Number(contract.margin_frozen) || 0;
        if (leftover > 0) {
          const { postLedger } = await import('./ledger.js');
          await postLedger(
            {
              userId: buyerId,
              type: 'margin_release',
              amount: leftover,
              ref_type: 'forward',
              ref_id: contract.id,
              note: '交割违约后释放剩余保证金',
              operatorId,
              mode: 'release',
            },
            t,
          );
          contract.margin_frozen = 0;
        }
        if (['open', 'delivery_pending'].includes(contract.status)) {
          assertForwardTransition(contract.status, 'cancelled');
          contract.status = 'cancelled';
          contract.cancel_reason = reason || '交割违约';
        }
        await contract.save({ transaction: t });
      }
    } else if (margin > 0 && buyerId) {
      const { postLedger } = await import('./ledger.js');
      await postLedger(
        {
          userId: buyerId,
          type: 'penalty',
          amount: margin,
          ref_type: 'delivery',
          ref_id: order.id,
          note: reason || '交割违约扣款',
          operatorId,
          mode: 'debit',
        },
        t,
      );
    }

    order.status = 'rejected';
    order.reviewed_by = operatorId;
    order.reviewed_at = new Date();
    order.note = `${order.note || ''}\n[default] ${reason || '违约处置'}`.trim();
    await order.save({ transaction: t });

    if (blacklist && buyerId) {
      const user = await User.findByPk(buyerId, { transaction: t, lock: t.LOCK.UPDATE });
      if (user) {
        user.blacklisted = true;
        await user.save({ transaction: t });
      }
    }

    return DeliveryOrder.findByPk(orderId, { include: orderInclude, transaction: t });
  });
}

export async function deliveryRatioStats() {
  const [settled, delivered] = await Promise.all([
    ForwardContract.count({ where: { status: 'settled' } }),
    ForwardContract.count({ where: { status: 'delivered' } }),
  ]);
  const total = settled + delivered;
  const physical_ratio = total === 0 ? 0 : Math.round((delivered / total) * 1000) / 10;
  return {
    settled_contracts: settled,
    delivered_contracts: delivered,
    physical_ratio_pct: physical_ratio,
  };
}

/** 合约是否因交割流程应跳过现金结算 */
export async function shouldSkipCashSettle(contractId) {
  const contract = await ForwardContract.findByPk(contractId);
  if (blocksCashSettle(contract)) return true;
  const active = await DeliveryOrder.findOne({
    where: {
      contract_id: contractId,
      status: { [Op.in]: ['pending', 'approved', 'in_delivery'] },
    },
  });
  return !!active;
}

/**
 * 到期日已过仍未审批的 pending 工单自动驳回，避免永远卡死现金结算。
 * approved / delivery_pending 不自动驳回。
 */
export async function expireStalePendingDeliveries(asOf = todayShanghai()) {
  const pending = await DeliveryOrder.findAll({
    where: { status: 'pending' },
    include: [{ association: 'contract', attributes: ['id', 'expiry_date', 'status'] }],
  });
  let n = 0;
  for (const order of pending) {
    const expiry = order.contract?.expiry_date;
    if (!expiry || expiry >= asOf) continue;
    order.status = 'rejected';
    order.reviewed_at = new Date();
    order.note = `${order.note || ''}\n[auto-reject] 超过到期日未审批，释放现金结算`.trim();
    await order.save();
    n += 1;
  }
  return n;
}

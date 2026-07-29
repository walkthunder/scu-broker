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
import { AppError } from '../utils/errors.js';
import { todayShanghai, addDaysShanghai } from '../utils/market.js';

const WINDOW_DAYS_BEFORE = 7;

const orderInclude = [
  {
    association: 'contract',
    include: [
      { association: 'index', include: [{ association: 'sku', attributes: ['id', 'name'] }] },
      { association: 'buyer', attributes: ['id', 'name', 'phone', 'company_name'] },
      { association: 'seller', attributes: ['id', 'name', 'phone', 'company_name'] },
    ],
  },
  {
    association: 'channel',
    include: [
      { association: 'supplier', attributes: ['id', 'name', 'display_name'] },
      { association: 'sku', attributes: ['id', 'name'] },
    ],
  },
  { association: 'requester', attributes: ['id', 'name', 'phone'] },
];

/** 申请窗口：expiry_date 往前 T-7 ～ 到期日当日（含） */
export function isInDeliveryWindow(expiryDate, asOf = todayShanghai()) {
  if (!expiryDate) return false;
  const start = addDaysShanghai(expiryDate, -WINDOW_DAYS_BEFORE);
  return asOf >= start && asOf <= expiryDate;
}

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
      { model: User, as: 'user', attributes: ['id', 'name', 'phone', 'company_name', 'role'] },
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
  const contract = await ForwardContract.findByPk(contractId, {
    include: [{ association: 'index' }, { association: 'delivery_orders' }],
  });
  if (!contract) throw new AppError('合约不存在', 404);
  if (contract.status !== 'open') throw new AppError('仅持仓中合约可申请交割');
  if (contract.settle_mode === 'physical') throw new AppError('合约已转入实物交割意向');

  const uid = Number(userId);
  if (uid !== contract.buyer_id && uid !== contract.seller_id) {
    throw new AppError('仅合约买方或卖方可申请', 403);
  }
  if (!(await isUserWhitelisted(uid))) {
    throw new AppError('账户未开通实物交割白名单', 403);
  }
  if (!isInDeliveryWindow(contract.expiry_date)) {
    throw new AppError(
      `不在交割申请窗口内（到期日前 ${WINDOW_DAYS_BEFORE} 天至到期日当日）`,
    );
  }

  const openReq = (contract.delivery_orders || []).find((d) =>
    ['pending', 'approved'].includes(d.status),
  );
  if (openReq) throw new AppError('已有进行中的交割申请');

  const channel = await DeliveryChannel.findByPk(channel_id);
  if (!channel || !channel.active) throw new AppError('交割通道不可用');

  // 通道 SKU 尽量与指数锚定 SKU 一致（宽松：仅提示不强绑时仍允许，若 index.sku_id 存在则校验）
  if (contract.index?.sku_id && Number(channel.sku_id) !== Number(contract.index.sku_id)) {
    throw new AppError('交割通道 SKU 与合约标的不一致');
  }

  return DeliveryOrder.create({
    contract_id: contract.id,
    channel_id: channel.id,
    status: 'pending',
    requested_by: uid,
    note: note || null,
  });
}

export async function listDeliveryOrders(query = {}) {
  const where = {};
  if (query.status) where.status = query.status;
  return DeliveryOrder.findAll({
    where,
    include: orderInclude,
    order: [['id', 'DESC']],
  });
}

export async function approveDelivery(orderId, operatorId, { create_spot_order = false } = {}) {
  const row = await DeliveryOrder.findByPk(orderId, { include: orderInclude });
  if (!row) throw new AppError('交割工单不存在', 404);
  if (row.status !== 'pending') throw new AppError('仅待审核工单可批准');

  const contract = await ForwardContract.findByPk(row.contract_id);
  if (!contract || contract.status !== 'open') throw new AppError('合约状态不可交割');

  row.status = 'approved';
  row.reviewed_by = operatorId;
  row.reviewed_at = new Date();
  await row.save();

  contract.settle_mode = 'physical';
  await contract.save();

  // 可选建现货履约单：本轮仅留关联位，不强行建复杂订单（无 quote）
  if (create_spot_order) {
    row.note = `${row.note || ''}\n[approve] 已标记需线下建履约单`.trim();
    await row.save();
  }

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
  if (row.status !== 'approved') throw new AppError('仅已批准工单可完成');

  const contract = await ForwardContract.findByPk(row.contract_id);
  if (!contract) throw new AppError('合约不存在', 404);
  if (!['open'].includes(contract.status)) throw new AppError('合约状态不可完成交割');

  row.status = 'done';
  row.completed_at = new Date();
  if (!row.reviewed_by) row.reviewed_by = operatorId;
  await row.save();

  contract.status = 'delivered';
  contract.settle_mode = 'physical';
  await contract.save();

  return DeliveryOrder.findByPk(orderId, { include: orderInclude });
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
  if (!contract) return true;
  if (contract.settle_mode === 'physical') return true;
  if (contract.status === 'delivered') return true;
  const active = await DeliveryOrder.findOne({
    where: {
      contract_id: contractId,
      status: { [Op.in]: ['pending', 'approved'] },
    },
  });
  return !!active;
}

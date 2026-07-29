import { AppError } from '../utils/errors.js';

/**
 * 远期合约状态真相源（对齐现货 order-state）。
 *
 * 主路径：
 *   pending_confirm → open → settled          （现金）
 *   pending_confirm → open → delivery_pending → delivered  （实物）
 * 任意待确认可 → cancelled
 *
 * settle_mode：开仓固定 cash；批准交割时改为 physical（与 status 同步，不单独驱动流转）。
 */
export const FORWARD_STATUSES = [
  'draft',
  'pending_confirm',
  'open',
  'delivery_pending',
  'settled',
  'delivered',
  'cancelled',
];

const ALLOWED = {
  pending_confirm: ['open', 'cancelled'],
  open: ['settled', 'delivery_pending', 'cancelled'],
  delivery_pending: ['delivered'],
  draft: ['pending_confirm', 'cancelled'],
};

export function assertForwardTransition(from, to) {
  const next = ALLOWED[from];
  if (!next || !next.includes(to)) {
    throw new AppError(`非法远期状态流转：${from} → ${to}`);
  }
}

/** 可申请实物交割 */
export function canRequestDelivery(contract) {
  return contract?.status === 'open' && contract?.settle_mode !== 'physical';
}

/** 持仓中（含已批准待交割） */
export function isActivePosition(status) {
  return status === 'open' || status === 'delivery_pending';
}

/** 应跳过现金结算的终态/实物路径 */
export function blocksCashSettle(contract) {
  if (!contract) return true;
  if (contract.status === 'delivered' || contract.status === 'delivery_pending') return true;
  if (contract.status === 'settled' || contract.status === 'cancelled') return true;
  if (contract.settle_mode === 'physical') return true;
  return false;
}

export function lifecycleLabel(status) {
  const map = {
    pending_confirm: '待确认',
    open: '持仓中',
    delivery_pending: '交割中',
    settled: '已结算',
    delivered: '已交割',
    cancelled: '已取消',
    draft: '草稿',
  };
  return map[status] || status;
}

import { AppError } from '../utils/errors.js';

const MAIN_FLOW = ['待签约', '待交付', '待验收', '待结算', '已完成'];

export function assertOrderTransition(from, to) {
  if (to === '已取消' || to === '已赔付') {
    if (from === '已完成' || from === '已取消') {
      throw new AppError(`无法从 ${from} 变更为 ${to}`);
    }
    return;
  }
  const fromIdx = MAIN_FLOW.indexOf(from);
  const toIdx = MAIN_FLOW.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || toIdx !== fromIdx + 1) {
    throw new AppError(`非法状态流转：${from} → ${to}`);
  }
}

export const ORDER_STATUS_TIMESTAMPS = {
  待交付: 'signed_at',
  待验收: 'delivered_at',
  待结算: 'accepted_at',
  已完成: 'settled_at',
};

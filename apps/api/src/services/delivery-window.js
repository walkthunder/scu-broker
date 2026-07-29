import { todayShanghai, addDaysShanghai } from '../utils/market.js';

/** 交割申请窗口：到期日前 N 天至到期日当日（含） */
export const DELIVERY_WINDOW_DAYS_BEFORE = 7;

export function isInDeliveryWindow(expiryDate, asOf = todayShanghai()) {
  if (!expiryDate) return false;
  const start = addDaysShanghai(expiryDate, -DELIVERY_WINDOW_DAYS_BEFORE);
  return asOf >= start && asOf <= expiryDate;
}

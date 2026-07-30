import { todayShanghai, addDaysShanghai } from '../utils/market.js';
import { getPlatformParams } from './platform-config.js';

/** 与 PlatformConfig.intent_days_before_expiry 同一窗口（默认 7） */
export async function deliveryWindowDaysBefore() {
  const params = await getPlatformParams();
  return Math.max(1, Number(params.intent_days_before_expiry || 7));
}

/** 交割申请 / 交割意愿：到期日前 N 天至到期日当日（含） */
export async function isInDeliveryWindow(expiryDate, asOf = todayShanghai()) {
  if (!expiryDate) return false;
  const n = await deliveryWindowDaysBefore();
  const start = addDaysShanghai(expiryDate, -n);
  return asOf >= start && asOf <= expiryDate;
}

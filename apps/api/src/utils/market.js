/** Asia/Shanghai YYYY-MM-DD */
export function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDaysShanghai(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/** 前台可见：active + is_public + 非测试命名 */
export function publicSkuWhere() {
  return {
    status: 'active',
    is_public: true,
  };
}

export function isTestSkuName(name) {
  return typeof name === 'string' && /^SKU-T-/i.test(name);
}

export function calcChange(todayMid, yesterdayMid) {
  if (todayMid == null || yesterdayMid == null || Number(yesterdayMid) === 0) {
    return { change_pct: null, change_label: '—' };
  }
  const pct = ((Number(todayMid) - Number(yesterdayMid)) / Number(yesterdayMid)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const label =
    rounded > 0 ? `↑ ${rounded}%` : rounded < 0 ? `↓ ${Math.abs(rounded)}%` : '0%';
  return { change_pct: rounded, change_label: label };
}

/** FRD 附录默认参数（可被 PlatformConfig 覆盖） */
export const REGIONS = [
  { code: 'shanghai', name: '上海' },
  { code: 'neimeng', name: '内蒙' },
  { code: 'guizhou', name: '贵州' },
];

export const REGION_CODES = REGIONS.map((r) => r.code);

export const FRD_DEFAULTS = {
  outlier_pct: 25,
  min_samples: 3,
  decay_days: 7,
  presale_basis_pct: -20,
  presale_basis_band_pct: 5,
  margin_initial_pct: 15,
  margin_maintain_pct: 8,
  right_days: 30,
  presale_months: 6,
  publish_hour_shanghai: 17,
  rfq_qty_threshold: 50,
  put_pool_coverage_min: 1.0,
  put_pool_balance: 5_000_000,
  vol_for_premium: 0.35,
  intent_days_before_expiry: 7,
  rights_enabled: 1,
  customer_limit_notional: 50_000_000,
  platform_limit_notional: 500_000_000,
};

export function regionLabel(code) {
  return REGIONS.find((r) => r.code === code)?.name || code || '—';
}

/** 演示样本，不是已发布结算价，不构成要约。3 日内按演示日 2026-11-05 计算。 */
export const asOf = '2026-11-01';
export const demoClock = '2026-11-05';

export interface GpuSeries {
  id: string;
  name: string;
  title: string;
  kind: string;
  unit: string;
  color: string;
  samples: number;
  values: number[];
}

export type AuctionStatus = 'soon' | 'live' | 'done';

export interface Auction {
  id: string;
  org: string;
  channel: string;
  title: string;
  detail: string;
  qty: string;
  window: string;
  windowNote: string;
  method: string;
  price: string;
  priceNote: string;
  status: AuctionStatus;
  within3: boolean;
  action: string;
}

export const periods: string[] = [
  '05-16',
  '06-01',
  '06-16',
  '07-01',
  '07-16',
  '08-01',
  '08-16',
  '09-01',
  '09-16',
  '10-01',
  '10-16',
  '11-01',
];

export const gpuSeries: GpuSeries[] = [
  {
    id: 'h200',
    name: 'H200',
    title: '硅元算力指数 · H200',
    kind: '进口旗舰加速卡',
    unit: '元/卡·时',
    color: '#E07A2F',
    samples: 29,
    values: [20.2, 20.45, 20.3, 20.7, 20.95, 20.8, 21.15, 21.35, 21.1, 21.4, 21.23, 21.1],
  },
  {
    id: 'ptg',
    name: '平头哥',
    title: '硅元算力指数 · 平头哥',
    kind: '国产加速卡',
    unit: '元/卡·时',
    color: '#7D8B99',
    samples: 64,
    values: [8.7, 8.55, 8.8, 8.5, 8.65, 8.4, 8.55, 8.35, 8.2, 8.28, 8.05, 8],
  },
  {
    id: 'ascend',
    name: '昇腾',
    title: '硅元算力指数 · 昇腾',
    kind: '国产昇腾加速卡',
    unit: '元/卡·时',
    color: '#3D8B84',
    samples: 46,
    values: [13.1, 13.35, 13.2, 13.55, 13.8, 13.65, 13.9, 14.15, 13.95, 14.2, 14.05, 14.2],
  },
];

export function latest(series: GpuSeries): number {
  return series.values[series.values.length - 1];
}

export function changeRate(series: GpuSeries): number {
  const values = series.values;
  const prev = values[values.length - 2];
  return (values[values.length - 1] - prev) / prev;
}

export function formatPrice(value: number): string {
  return Number(value).toFixed(2);
}

export function formatPct(rate: number): string {
  const text = (rate * 100).toFixed(1);
  return `${rate > 0 ? '+' : ''}${text}%`;
}

export function formatRatio(a: number, b: number): string {
  return (a / b).toFixed(2);
}

export const auctions: Auction[] = [
  {
    id: 'ali-lot-soon',
    org: '阿里拍卖',
    channel: '资产处置频道',
    title: '【总价拍卖】50,000 DCU 算力服务容量使用权',
    detail: '整体打包 · 不可分割 · 使用期 3 个月',
    qty: '50,000 DCU',
    window: '11-05 10:00',
    windowNote: '至 11-06 10:00',
    method: '总价拍卖',
    price: '¥300,000 起拍',
    priceNote: '参考价 400,000 · 保证金 15,000',
    status: 'soon',
    within3: true,
    action: '前往查看',
  },
  {
    id: 'ali-unit-soon',
    org: '阿里拍卖',
    channel: '资产处置频道',
    title: '【单价拍卖】50,000 DCU 算力服务容量使用权',
    detail: '按每 DCU 单价竞价 · 同一买受人整体受让 · 使用期 3 个月',
    qty: '50,000 DCU',
    window: '11-06 10:00',
    windowNote: '至 11-07 10:00',
    method: '单价拍卖',
    price: '¥8.00 / DCU 起拍',
    priceNote: '加价 0.05 元/DCU · 保证金 15,000',
    status: 'soon',
    within3: true,
    action: '前往查看',
  },
  {
    id: 'jd-east-live',
    org: '京东拍卖',
    channel: '资产处置频道',
    title: '20,000 DCU 算力服务容量使用权 · 华东',
    detail: '国产加速卡折算 · 交付：企业账号 / API 密钥 · 使用期 6 个月',
    qty: '20,000 DCU',
    window: '11-04 09:00',
    windowNote: '至 11-05 09:00 · 距开拍 2 天 20 小时',
    method: '单价拍卖',
    price: '¥6.80 / DCU 起拍',
    priceNote: '当前 7.05 · 已出价 5 次',
    status: 'live',
    within3: true,
    action: '前往查看',
  },
  {
    id: 'suaee-west-live',
    org: '上海产权交易所',
    channel: '公开挂牌',
    title: '100,000 DCU 算力服务容量使用权 · 西部',
    detail: '国产加速卡折算 · 可分拆 4 个子标的 · 使用期 12 个月',
    qty: '100,000 DCU',
    window: '已于 10-31 10:00 开拍',
    windowNote: '11-02 15:00 结束 · 延时已触发 3 次',
    method: '单价拍卖',
    price: '¥7.30 / DCU 当前',
    priceNote: '起拍 6.50 · 已出价 21 次',
    status: 'live',
    within3: false,
    action: '前往查看',
  },
  {
    id: 'licensed-north-done',
    org: '某持牌拍卖机构',
    channel: '公开竞价',
    title: '30,000 DCU 算力服务容量使用权 · 华北',
    detail: '进口加速卡折算 · 使用期 3 个月 · 支持预约技术验证',
    qty: '30,000 DCU',
    window: '10-28 14:00',
    windowNote: '10-29 11:26 成交',
    method: '单价拍卖',
    price: '¥12.40 / DCU 成交',
    priceNote: '起拍 11.80 · 已入 DCU-N 样本',
    status: 'done',
    within3: false,
    action: '成交详情',
  },
  {
    id: 'suaee-lot-soon',
    org: '上海产权交易所',
    channel: '公开挂牌',
    title: '【总价拍卖】40,000 DCU 算力服务容量使用权',
    detail: '整体打包 · 不可分割 · 使用期 6 个月',
    qty: '40,000 DCU',
    window: '11-18 14:00',
    windowNote: '至 11-19 14:00',
    method: '总价拍卖',
    price: '¥260,000 起拍',
    priceNote: '参考价 320,000 · 保证金 12,000',
    status: 'soon',
    within3: false,
    action: '前往查看',
  },
  {
    id: 'jd-south-soon',
    org: '京东拍卖',
    channel: '资产处置频道',
    title: '【单价拍卖】15,000 DCU 算力服务容量使用权 · 华南',
    detail: '国产加速卡折算 · 使用期 3 个月',
    qty: '15,000 DCU',
    window: '11-12 10:00',
    windowNote: '至 11-13 10:00',
    method: '单价拍卖',
    price: '¥7.50 / DCU 起拍',
    priceNote: '加价 0.05 元/DCU · 保证金 8,000',
    status: 'soon',
    within3: false,
    action: '前往查看',
  },
  {
    id: 'ali-south-done',
    org: '阿里拍卖',
    channel: '资产处置频道',
    title: '【单价拍卖】12,000 DCU 算力服务容量使用权 · 华南',
    detail: '进口加速卡折算 · 使用期 1 个月',
    qty: '12,000 DCU',
    window: '10-21 10:00',
    windowNote: '10-22 16:40 成交',
    method: '单价拍卖',
    price: '¥9.80 / DCU 成交',
    priceNote: '起拍 9.20 · 已出价 9 次',
    status: 'done',
    within3: false,
    action: '成交详情',
  },
  {
    id: 'licensed-east-done',
    org: '某持牌拍卖机构',
    channel: '公开竞价',
    title: '18,000 DCU 算力服务容量使用权 · 华东',
    detail: '国产加速卡折算 · 使用期 6 个月',
    qty: '18,000 DCU',
    window: '10-15 14:00',
    windowNote: '10-16 11:05 成交',
    method: '单价拍卖',
    price: '¥6.90 / DCU 成交',
    priceNote: '起拍 6.40 · 已出价 7 次',
    status: 'done',
    within3: false,
    action: '成交详情',
  },
];

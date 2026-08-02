import { Op } from 'sequelize';
import { ChannelDeal, PriceBulletin } from '../models/frd-models.js';
import { PriceIndex, IndexPrint, ReferencePrice, Sku, ForwardContract, RightContract } from '../models/index.js';
import { getPlatformParams } from './platform-config.js';
import { filledDealsForEngine } from './channel-deal.js';
import { AppError } from '../utils/errors.js';
import { todayShanghai, addDaysShanghai } from '../utils/market.js';
import { REGIONS } from '../constants/platform.js';
import { isPrintUsedInSettlement, getLatestPublished } from './index-price.js';

function weightedMedian(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a.price - b.price);
  const totalW = sorted.reduce((s, x) => s + x.weight, 0);
  if (totalW <= 0) return null;
  let acc = 0;
  for (const s of sorted) {
    acc += s.weight;
    if (acc >= totalW / 2) return s.price;
  }
  return sorted[sorted.length - 1].price;
}

function buildWeightedSamples(deals, decayDays, asOf) {
  const asOfMs = new Date(`${asOf}T23:59:59+08:00`).getTime();
  return deals.map((d) => {
    const ageDays = Math.max(0, (asOfMs - new Date(d.deal_time).getTime()) / 86400000);
    const decay = Math.exp(-ageDays / Math.max(1, decayDays));
    return {
      price: Number(d.unit_price),
      weight: Number(d.qty) * decay,
      qty: Number(d.qty),
    };
  });
}

/**
 * 加权中位数 + 异常值剔除
 */
export function computeSettlementFromDeals(deals, { outlierPct, decayDays, minSamples, asOf }) {
  let samples = buildWeightedSamples(deals, decayDays, asOf);
  if (!samples.length) {
    return { price: null, sample_count: 0, is_reference: true, method: 'empty' };
  }
  let mid = weightedMedian(samples);
  const lo = mid * (1 - outlierPct / 100);
  const hi = mid * (1 + outlierPct / 100);
  samples = samples.filter((s) => s.price >= lo && s.price <= hi);
  mid = weightedMedian(samples);
  const count = samples.length;
  if (count < minSamples || mid == null) {
    return { price: mid, sample_count: count, is_reference: true, method: 'insufficient' };
  }
  return { price: Math.round(mid * 100) / 100, sample_count: count, is_reference: false, method: 'engine' };
}

export async function runIndexEngineForIndex(indexId, date = todayShanghai(), userId = null) {
  const index = await PriceIndex.findByPk(indexId, { include: [{ association: 'sku' }] });
  if (!index) throw new AppError('指数不存在', 404);
  const params = await getPlatformParams();
  const deals = await filledDealsForEngine(index.sku_id, index.region || 'shanghai', date);
  let result = computeSettlementFromDeals(deals, {
    outlierPct: Number(params.outlier_pct),
    decayDays: Number(params.decay_days),
    minSamples: Number(params.min_samples),
    asOf: date,
  });

  if (result.price == null || result.is_reference) {
    const prev = await getLatestPublished(indexId, addDaysShanghai(date, -1));
    const ref = await ReferencePrice.findOne({
      where: { sku_id: index.sku_id, region: index.region || 'shanghai', date },
    });
    const region = index.region || 'shanghai';
    const { resolveMarketQuote } = await import('./market-resolve.js');
    const mq = await resolveMarketQuote(index.sku_id, region, { date });
    const mmMid = mq?.mid ?? null;
    let fallback = null;
    let method = 'reference';
    if (mmMid != null && prev) {
      fallback = (mmMid + Number(prev.settle_price)) / 2;
      method = 'mm_blend';
    } else if (mmMid != null) {
      fallback = mmMid;
      method = 'mm_quote';
    } else if (ref) {
      fallback = Number(ref.price_mid);
    } else if (prev) {
      fallback = Number(prev.settle_price);
    } else {
      fallback = result.price;
    }
    if (fallback == null) throw new AppError(`指数 ${index.code} 无样本且无参考价/做市报价可插值`);
    result = {
      price: Math.round(Number(fallback) * 100) / 100,
      sample_count: result.sample_count || 0,
      is_reference: true,
      method,
    };
  }

  if (await isPrintUsedInSettlement(indexId, date)) {
    throw new AppError('已用于结算，禁止改价', 400, 'PRINT_LOCKED');
  }

  let print = await IndexPrint.findOne({ where: { index_id: indexId, date } });
  const source =
    result.method === 'engine'
      ? 'engine'
      : result.method === 'reference' || result.method === 'mm_blend' || result.method === 'mm_quote'
        ? 'reference'
        : 'manual';
  if (print) {
    const wasPublished = print.status === 'published';
    print.settle_price = result.price;
    print.source = source;
    // 已发布则保留 published，避免日作业把早上公告打回 draft 导致前台指数回退到昨日
    if (!wasPublished) {
      print.status = 'draft';
      print.reviewed_by = null;
    }
    print.sample_count = result.sample_count;
    print.is_reference = !!result.is_reference;
    print.calculated_by = userId;
    await print.save();
  } else {
    print = await IndexPrint.create({
      index_id: indexId,
      date,
      settle_price: result.price,
      source,
      status: 'draft',
      sample_count: result.sample_count,
      is_reference: !!result.is_reference,
      calculated_by: userId,
    });
  }
  return { print, result };
}

export async function runEngineAll(date = todayShanghai(), userId = null) {
  const indices = await PriceIndex.findAll({ where: { status: 'active' } });
  const out = [];
  for (const idx of indices) {
    try {
      out.push(await runIndexEngineForIndex(idx.id, date, userId));
    } catch (e) {
      out.push({ index_id: idx.id, error: e.message });
    }
  }
  return out;
}

export async function submitBulletinForReview(date, userId) {
  const indices = await PriceIndex.findAll({
    where: { status: 'active' },
    include: [{ association: 'sku', attributes: ['id', 'name', 'unit'] }],
  });
  const params = await getPlatformParams();
  const basis = Number(params.presale_basis_pct);
  const rightsOpen = await RightContract.findAll({
    where: { status: 'open' },
    limit: 50,
    include: [{ association: 'sku', attributes: ['name'] }],
  });
  const rights_ref = rightsOpen.slice(0, 12).map((r) => ({
    id: r.id,
    kind: r.kind,
    sku: r.sku?.name,
    region: r.region,
    strike: Number(r.strike),
    premium: Number(r.premium),
    premium_ref: r.premium_ref != null ? Number(r.premium_ref) : null,
  }));
  const lines = [];
  for (const idx of indices) {
    const print = await IndexPrint.findOne({ where: { index_id: idx.id, date } });
    if (!print) continue;
    const prev = await getLatestPublished(idx.id, addDaysShanghai(date, -1));
    const change =
      prev && Number(prev.settle_price) > 0
        ? ((Number(print.settle_price) - Number(prev.settle_price)) / Number(prev.settle_price)) * 100
        : null;
    lines.push({
      index_id: idx.id,
      code: idx.code,
      name: idx.name,
      region: idx.region,
      sku: idx.sku?.name,
      settle_price: Number(print.settle_price),
      change_pct: change != null ? Math.round(change * 100) / 100 : null,
      sample_count: print.sample_count,
      is_reference: !!print.is_reference,
      presale_ref: Math.round(Number(print.settle_price) * (1 + basis / 100) * 100) / 100,
    });
  }
  if (!lines.length) throw new AppError('当日无指数草稿，请先运行测算引擎');

  // 全国综合价：同 SKU 跨区域结算价等权平均
  const bySku = {};
  for (const line of lines) {
    const key = line.sku || line.code;
    if (!bySku[key]) bySku[key] = [];
    bySku[key].push(line.settle_price);
  }
  const national = Object.entries(bySku).map(([sku, prices]) => ({
    sku,
    national_price: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
    regions: prices.length,
  }));

  let bulletin = await PriceBulletin.findOne({ where: { date } });
  const payload = {
    date,
    lines,
    regions: REGIONS,
    national,
    rights_ref,
    presale_basis_pct: basis,
  };
  if (bulletin) {
    if (bulletin.status === 'published') {
      throw new AppError('当日公告已发布，请走撤销流程或次日再报；禁止静默回退复核');
    }
    bulletin.payload = payload;
    bulletin.status = 'pending_review';
    bulletin.calculated_by = userId;
    bulletin.reviewed_by = null;
    await bulletin.save();
  } else {
    bulletin = await PriceBulletin.create({
      date,
      status: 'pending_review',
      payload,
      calculated_by: userId,
    });
  }
  for (const line of lines) {
    const print = await IndexPrint.findOne({ where: { index_id: line.index_id, date } });
    if (!print) continue;
    if (await isPrintUsedInSettlement(line.index_id, date)) continue;
    print.status = 'pending_review';
    print.reviewed_by = null;
    await print.save();
  }
  return bulletin;
}

export async function reviewPublishBulletin(date, reviewerId) {
  const bulletin = await PriceBulletin.findOne({ where: { date } });
  if (!bulletin) throw new AppError('公告不存在', 404);
  if (bulletin.status !== 'pending_review') throw new AppError('当前状态不可复核发布');
  if (!bulletin.calculated_by) {
    throw new AppError('公告缺少测算人，无法完成双人复核');
  }
  if (Number(bulletin.calculated_by) === Number(reviewerId)) {
    throw new AppError('测算人与复核人不能为同一人（双人复核）');
  }
  const lines = bulletin.payload?.lines || [];
  for (const line of lines) {
    const print = await IndexPrint.findOne({ where: { index_id: line.index_id, date } });
    if (!print) continue;
    if (await isPrintUsedInSettlement(line.index_id, date)) continue;
    print.status = 'published';
    print.reviewed_by = reviewerId;
    await print.save();
  }
  bulletin.status = 'published';
  bulletin.reviewed_by = reviewerId;
  bulletin.published_at = new Date();
  bulletin.snapshot = { ...bulletin.payload, published_at: bulletin.published_at };
  await bulletin.save();
  return bulletin;
}

export async function getCurve({ sku_id, region, kind = 'spot', from, to, granularity = 'day' }) {
  const whereDate = {};
  if (from) whereDate[Op.gte] = from;
  if (to) whereDate[Op.lte] = to;
  const gran = ['day', 'week', 'month'].includes(granularity) ? granularity : 'day';

  if (kind === 'spot') {
    const { resolvePrimaryIndex } = await import('./market-resolve.js');
    const index = await resolvePrimaryIndex(sku_id, region || 'shanghai');
    if (!index) return [];
    const prints = await IndexPrint.findAll({
      where: {
        index_id: index.id,
        status: 'published',
        ...(Object.keys(whereDate).length ? { date: whereDate } : {}),
      },
      order: [['date', 'ASC']],
    });
    const refs = await ReferencePrice.findAll({
      where: {
        sku_id,
        region: region || 'shanghai',
        ...(Object.keys(whereDate).length ? { date: whereDate } : {}),
      },
    });
    const refMap = Object.fromEntries(refs.map((r) => [r.date, r]));
    const daily = prints.map((p) => ({
      date: p.date,
      settle: Number(p.settle_price),
      low: refMap[p.date] ? Number(refMap[p.date].price_low) : null,
      high: refMap[p.date] ? Number(refMap[p.date].price_high) : null,
      is_reference: !!p.is_reference,
    }));
    return aggregateCurve(daily, gran, 'settle');
  }

  if (kind === 'presale') {
    const rows = await ForwardContract.findAll({
      where: {
        region: region || 'shanghai',
        status: { [Op.in]: ['open', 'settled', 'delivered'] },
      },
      include: [
        {
          association: 'index',
          where: sku_id ? { sku_id: Number(sku_id) } : undefined,
          required: !!sku_id,
        },
      ],
      order: [['createdAt', 'ASC']],
      limit: 500,
    });
    const daily = rows.map((r) => ({
      date: r.createdAt?.toISOString?.().slice(0, 10) || r.expiry_date,
      price: Number(r.strike_price),
      basis_rate: Number(r.basis_rate),
      spot_ref: r.spot_ref_at_open != null ? Number(r.spot_ref_at_open) : null,
      contract_code: r.contract_code,
    }));
    return aggregateCurve(daily, gran, 'price');
  }

  if (kind === 'right') {
    const rows = await RightContract.findAll({
      where: {
        sku_id,
        region: region || 'shanghai',
        status: { [Op.in]: ['open', 'exercised', 'expired'] },
      },
      order: [['createdAt', 'ASC']],
      limit: 500,
    });
    const daily = rows.map((r) => ({
      date: r.window_start,
      kind: r.kind,
      premium: Number(r.premium),
      strike: Number(r.strike),
    }));
    return aggregateCurve(daily, gran, 'premium');
  }
  return [];
}

function weekKey(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(iso) {
  return String(iso).slice(0, 7);
}

function aggregateCurve(points, gran, valueKey) {
  if (gran === 'day' || !points.length) return points;
  const buckets = new Map();
  for (const p of points) {
    const key = gran === 'week' ? weekKey(p.date) : monthKey(p.date);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  return [...buckets.entries()].map(([bucket, arr]) => {
    const vals = arr.map((x) => Number(x[valueKey])).filter((n) => Number.isFinite(n));
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const lows = arr.map((x) => x.low).filter((n) => n != null);
    const highs = arr.map((x) => x.high).filter((n) => n != null);
    return {
      date: bucket,
      [valueKey]: avg != null ? Math.round(avg * 100) / 100 : null,
      settle: valueKey === 'settle' && avg != null ? Math.round(avg * 100) / 100 : undefined,
      price: valueKey === 'price' && avg != null ? Math.round(avg * 100) / 100 : undefined,
      premium: valueKey === 'premium' && avg != null ? Math.round(avg * 100) / 100 : undefined,
      low: lows.length ? Math.min(...lows.map(Number)) : null,
      high: highs.length ? Math.max(...highs.map(Number)) : null,
      sample_count: arr.length,
      granularity: gran,
    };
  });
}

export function suggestPresalePrice(spotSettle, params) {
  const basis = Number(params.presale_basis_pct);
  const band = Number(params.presale_basis_band_pct);
  const mid = spotSettle * (1 + basis / 100);
  return {
    mid: Math.round(mid * 100) / 100,
    low: Math.round(mid * (1 - band / 100) * 100) / 100,
    high: Math.round(mid * (1 + band / 100) * 100) / 100,
    basis_pct: basis,
  };
}

/** 公告导出：HTML 快照（浏览器可打印为 PDF） */
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function getBulletinExportHtml(date) {
  const bulletin = await PriceBulletin.findOne({ where: { date } });
  if (!bulletin) throw new AppError('公告不存在', 404);
  const payload = bulletin.snapshot || bulletin.payload || {};
  const lines = payload.lines || [];
  const national = payload.national || [];
  const rows = lines
    .map(
      (l) =>
        `<tr><td>${escHtml(l.code)}</td><td>${escHtml(l.sku)}</td><td>${escHtml(l.region)}</td><td>${escHtml(l.settle_price)}</td><td>${escHtml(l.change_pct ?? '—')}</td><td>${escHtml(l.presale_ref ?? '—')}</td><td>${l.is_reference ? '参考价' : escHtml(l.sample_count ?? '—')}</td></tr>`,
    )
    .join('');
  const nat = national
    .map((n) => `<li>${escHtml(n.sku)}: ${escHtml(n.national_price)}（${escHtml(n.regions)} 区）</li>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>价格公告 ${escHtml(date)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body{font-family:"PingFang SC","Helvetica Neue",sans-serif;padding:28px;color:#0f172a;background:#fff}
  h1{font-size:22px;margin:0 0 8px;letter-spacing:.04em}
  .meta{color:#64748b;font-size:13px;margin-bottom:20px}
  table{border-collapse:collapse;width:100%;margin:12px 0 24px}
  th{background:#0f172a;color:#f8fafc;font-weight:600}
  td,th{border:1px solid #cbd5e1;padding:8px 10px;font-size:13px;text-align:left}
  tr:nth-child(even) td{background:#f8fafc}
  h2{font-size:15px;margin:20px 0 8px;color:#334155}
  .actions{margin:16px 0 24px}
  .actions button{margin-right:8px;padding:8px 14px;border:1px solid #94a3b8;background:#fff;border-radius:6px;cursor:pointer}
  @media print {.actions{display:none}}
  .foot{margin-top:28px;color:#94a3b8;font-size:11px}
</style>
</head><body>
<div class="actions">
  <button onclick="window.print()">打印 / 另存 PDF</button>
  <button onclick="downloadPng()">下载长图 PNG</button>
</div>
<div id="sheet">
<h1>硅元引擎 · 日价格公告 ${escHtml(date)}</h1>
<p class="meta">状态：${escHtml(bulletin.status)} · 发布于 ${escHtml(bulletin.published_at || '—')} · 双人复核留痕可审计</p>
<h2>区域结算价 · 预售参考（现货×(1${Number(payload.presale_basis_pct ?? -20) >= 0 ? '+' : ''}${escHtml(payload.presale_basis_pct ?? -20)}%)）</h2>
<table><thead><tr><th>指数</th><th>标的</th><th>区域</th><th>结算价 S</th><th>涨跌%</th><th>预售参考</th><th>样本/标注</th></tr></thead><tbody>${rows}</tbody></table>
<h2>全国综合价</h2><ul>${nat || '<li>无</li>'}</ul>
<p class="foot">CompriX 对客素材 · 导出 ${escHtml(new Date().toISOString())} · 不构成要约</p>
</div>
<script>
async function downloadPng(){
  const el=document.getElementById('sheet');
  const w=Math.max(el.scrollWidth,720), h=el.scrollHeight+40;
  const c=document.createElement('canvas'); c.width=w*2; c.height=h*2;
  const ctx=c.getContext('2d'); ctx.scale(2,2); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#0f172a'; ctx.font='bold 20px sans-serif';
  ctx.fillText(document.querySelector('h1').innerText,24,36);
  ctx.font='13px sans-serif'; ctx.fillStyle='#334155';
  let y=64;
  document.querySelectorAll('tbody tr').forEach(tr=>{
    const t=[...tr.children].map(td=>td.innerText).join('  |  ');
    ctx.fillText(t.slice(0,120),24,y); y+=22;
  });
  const a=document.createElement('a'); a.href=c.toDataURL('image/png'); a.download='bulletin-${escHtml(date)}.png'; a.click();
}
</script>
</body></html>`;
}

export async function getNationalComposite(date = todayShanghai()) {
  const bulletin = await PriceBulletin.findOne({
    where: { date, status: 'published' },
  });
  const row =
    bulletin ||
    (await PriceBulletin.findOne({
      where: { status: 'published' },
      order: [['date', 'DESC']],
    }));
  if (!row) return [];
  let payload = row.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  if (payload?.national?.length) return payload.national;
  let snapshot = row.snapshot;
  if (typeof snapshot === 'string') {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      snapshot = null;
    }
  }
  if (snapshot?.national?.length) return snapshot.national;
  return [];
}

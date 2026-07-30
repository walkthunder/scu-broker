import { Op } from 'sequelize';
import {
  ReferencePrice,
  PriceIndex,
  IndexPrint,
  Sku,
  Announcement,
  DealFeed,
  User,
} from '../models/index.js';
import { PriceBulletin, MakerQuote, PartnerCapacity, ChannelDeal } from '../models/frd-models.js';
import { todayShanghai, addDaysShanghai } from '../utils/market.js';
import { isPrintUsedInSettlement } from './index-price.js';
import { REGIONS } from '../constants/platform.js';

/** 2026 中旬国内算力现货量级锚点（元 / SKU 单位） */
export const MARKET_ANCHORS = {
  H100: 118000,
  H200: 142000,
  PPU: 52000,
  '算力 Token': 2.08,
  'H100 包月': 98000,
  H800: 28.5,
  A100: 16.8,
  'GPT Token': 9.2,
  'DeepSeek Token': 1.35,
};

const REGION_FACTOR = { shanghai: 1, neimeng: 0.96, guizhou: 0.93 };

function roundMoney(n, unitHint) {
  const x = Number(n);
  if (!(x > 0)) return x;
  if (unitHint === 'token' || x < 100) return Math.round(x * 1000) / 1000;
  return Math.round(x * 100) / 100;
}

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** 确定性微抖动，避免每次 seed 剧烈跳价 */
export function driftedMid(anchor, date, skuName, region) {
  const base = Number(anchor) * (REGION_FACTOR[region] || 1);
  const dayNoise = (hash01(`${skuName}|${region}|${date}`) - 0.5) * 0.028;
  const week = Math.sin(hash01(date) * Math.PI * 2) * 0.012;
  return base * (1 + dayNoise + week);
}

export function bandFromMid(mid, skuType) {
  const m = Number(mid);
  if (skuType === 'token' || m < 100) {
    return {
      price_low: roundMoney(m * 0.92, 'token'),
      price_mid: roundMoney(m, 'token'),
      price_high: roundMoney(m * 1.1, 'token'),
    };
  }
  return {
    price_low: roundMoney(m * 0.82),
    price_mid: roundMoney(m),
    price_high: roundMoney(m * 1.22),
  };
}

async function systemAdminId() {
  const admin = await User.findOne({
    where: { role: 'admin' },
    order: [['id', 'ASC']],
    attributes: ['id'],
  });
  return admin?.id || null;
}

/**
 * 写入/刷新某日参考价（幂等）。优先用已有最近一日价做滚动，否则用锚点。
 */
export async function upsertReferenceDay(date, { createdBy } = {}) {
  const skus = await Sku.findAll({
    where: { status: 'active', is_public: true },
  });
  const regions = ['shanghai', 'neimeng', 'guizhou'];
  const adminId = createdBy ?? (await systemAdminId());
  let upserted = 0;

  for (const sku of skus) {
    const anchor = MARKET_ANCHORS[sku.name] ?? (sku.type === 'token' ? 2 : 50000);
    for (const region of regions) {
      const prev = await ReferencePrice.findOne({
        where: {
          sku_id: sku.id,
          region,
          date: { [Op.lt]: date },
        },
        order: [['date', 'DESC']],
      });
      const mid = prev
        ? Number(prev.price_mid) *
          (1 + (hash01(`${sku.id}|${region}|${date}|roll`) - 0.5) * 0.018)
        : driftedMid(anchor, date, sku.name, region);
      const band = bandFromMid(mid, sku.type);
      const [row, created] = await ReferencePrice.findOrCreate({
        where: { sku_id: sku.id, date, region },
        defaults: {
          sku_id: sku.id,
          date,
          region,
          ...band,
          source: '系统滚动',
          created_by: adminId,
        },
      });
      if (created) {
        upserted += 1;
        continue;
      }
      // 已有但 mid 为空/0：补齐；已有真实录入不覆盖
      if (!(Number(row.price_mid) > 0)) {
        Object.assign(row, band);
        row.source = row.source || '系统滚动';
        await row.save();
        upserted += 1;
      }
    }
  }
  return upserted;
}

/** 保证活跃指数当日有 published 结算价 */
export async function ensureIndexPrints(date) {
  const indices = await PriceIndex.findAll({
    where: { status: 'active' },
    include: [{ association: 'sku', attributes: ['id', 'name', 'type'] }],
  });
  let n = 0;
  for (const idx of indices) {
    if (await isPrintUsedInSettlement(idx.id, date)) continue;
    const region = idx.region || 'shanghai';
    let ref = await ReferencePrice.findOne({
      where: { sku_id: idx.sku_id, date, region },
    });
    if (!ref) {
      ref = await ReferencePrice.findOne({
        where: { sku_id: idx.sku_id, region },
        order: [['date', 'DESC']],
      });
    }
    if (!ref || !(Number(ref.price_mid) > 0)) continue;
    const settle = Number(ref.price_mid);
    const [print] = await IndexPrint.findOrCreate({
      where: { index_id: idx.id, date },
      defaults: {
        index_id: idx.id,
        date,
        settle_price: settle,
        source: 'reference',
        status: 'published',
        is_reference: true,
        sample_count: 0,
      },
    });
    if (print.status !== 'published' || !(Number(print.settle_price) > 0)) {
      print.settle_price = settle;
      print.source = 'reference';
      print.status = 'published';
      print.is_reference = true;
      await print.save();
      n += 1;
    }
  }
  return n;
}

/** 保证当日价格公告已发布（首页 / 全国综合价依赖） */
export async function ensurePublishedBulletin(date, userId = null) {
  const existing = await PriceBulletin.findOne({ where: { date } });
  if (existing?.status === 'published' && existing.payload?.lines?.length) {
    return existing;
  }

  const indices = await PriceIndex.findAll({
    where: { status: 'active' },
    include: [{ association: 'sku', attributes: ['id', 'name', 'unit'] }],
  });
  const lines = [];
  for (const idx of indices) {
    const print = await IndexPrint.findOne({
      where: { index_id: idx.id, date, status: 'published' },
    });
    if (!print) continue;
    const prev = await IndexPrint.findOne({
      where: {
        index_id: idx.id,
        status: 'published',
        date: { [Op.lt]: date },
      },
      order: [['date', 'DESC']],
    });
    const change =
      prev && Number(prev.settle_price) > 0
        ? Math.round(
            ((Number(print.settle_price) - Number(prev.settle_price)) /
              Number(prev.settle_price)) *
              10000,
          ) / 100
        : null;
    lines.push({
      index_id: idx.id,
      code: idx.code,
      name: idx.name,
      region: idx.region,
      sku: idx.sku?.name,
      settle_price: Number(print.settle_price),
      change_pct: change,
      sample_count: print.sample_count || 0,
      is_reference: !!print.is_reference,
      presale_ref: Math.round(Number(print.settle_price) * 0.8 * 100) / 100,
    });
  }
  if (!lines.length) return null;

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

  const payload = {
    date,
    lines,
    regions: REGIONS,
    national,
    rights_ref: [],
    presale_basis_pct: -20,
    headline: '算力现货偏紧，包月询价活跃；H100/H200 上海机房交期约 1–3 天',
  };
  const adminId = userId ?? (await systemAdminId());
  if (existing) {
    existing.payload = payload;
    existing.status = 'published';
    existing.calculated_by = existing.calculated_by || adminId;
    existing.reviewed_by = adminId;
    existing.published_at = existing.published_at || new Date();
    await existing.save();
    return existing;
  }
  return PriceBulletin.create({
    date,
    status: 'published',
    payload,
    calculated_by: adminId,
    reviewed_by: adminId,
    published_at: new Date(),
  });
}

async function ensureMakerQuotes(date) {
  const adminId = await systemAdminId();
  const names = ['H100', 'H200', 'PPU', '算力 Token'];
  let n = 0;
  for (const name of names) {
    const sku = await Sku.findOne({ where: { name } });
    if (!sku) continue;
    for (const region of ['shanghai', 'neimeng', 'guizhou']) {
      const ref = await ReferencePrice.findOne({
        where: { sku_id: sku.id, date, region },
      });
      if (!ref) continue;
      const mid = Number(ref.price_mid);
      const spread = mid < 100 ? mid * 0.04 : mid * 0.025;
      const [row] = await MakerQuote.findOrCreate({
        where: { sku_id: sku.id, region, date },
        defaults: {
          sku_id: sku.id,
          region,
          date,
          bid: roundMoney(mid - spread, sku.type),
          ask: roundMoney(mid + spread, sku.type),
          created_by: adminId,
        },
      });
      if (!(Number(row.bid) > 0)) {
        row.bid = roundMoney(mid - spread, sku.type);
        row.ask = roundMoney(mid + spread, sku.type);
        await row.save();
      }
      const caps = await PartnerCapacity.findAll({
        where: { sku_id: sku.id, region, active: true },
      });
      for (const cap of caps) {
        if (!(Number(cap.quote_bid) > 0)) {
          cap.quote_bid = row.bid;
          cap.quote_ask = row.ask;
          await cap.save();
        }
      }
      n += 1;
    }
  }
  return n;
}

async function ensureDealFeeds(date) {
  const adminId = await systemAdminId();
  const samples = [
    { region: '东部', sku_name: 'H100', deal_type: '包月' },
    { region: '东部', sku_name: 'H200', deal_type: '包月' },
    { region: '南部', sku_name: 'H100', deal_type: '时租' },
    { region: '西部', sku_name: 'PPU', deal_type: '包月' },
    { region: '北部', sku_name: '算力 Token', deal_type: 'Token包' },
    { region: '北部', sku_name: 'DeepSeek Token', deal_type: 'Token包' },
    { region: '海外', sku_name: 'H100', deal_type: '时租' },
    { region: '南部', sku_name: 'H800', deal_type: '时租' },
  ];
  let n = 0;
  for (let i = 0; i < samples.length; i++) {
    const f = samples[i];
    const deal_date = addDaysShanghai(date, -(i % 4));
    const [row] = await DealFeed.findOrCreate({
      where: {
        sku_name: f.sku_name,
        region: f.region,
        deal_type: f.deal_type,
        deal_date,
      },
      defaults: {
        ...f,
        deal_date,
        order_id: null,
        is_published: true,
        published_by: adminId,
        published_at: new Date(),
      },
    });
    if (!row.is_published) {
      row.is_published = true;
      row.published_by = adminId;
      row.published_at = new Date();
      await row.save();
      n += 1;
    }
  }
  return n;
}

async function ensureAnnouncement() {
  const title = 'H100 / H200 现货偏紧，包月询价建议提前 1–2 天';
  const [row] = await Announcement.findOrCreate({
    where: { title },
    defaults: {
      title,
      content:
        '上海/内蒙机房 H100 包月询价活跃，Broker 通常 2–6 小时反馈；正式报价 24 小时有效。国产 PPU 交期相对充裕。',
      position: 'top',
      bg_color: '#0f172a',
      text_color: '#f8fafc',
      is_active: true,
      start_time: new Date(Date.now() - 86400000),
      end_time: new Date(Date.now() + 45 * 86400000),
      created_by: await systemAdminId(),
    },
  });
  if (!row.is_active) {
    row.is_active = true;
    row.end_time = new Date(Date.now() + 45 * 86400000);
    await row.save();
  }
  // 失效过期通告
  await Announcement.update(
    { is_active: false },
    {
      where: {
        is_active: true,
        end_time: { [Op.lt]: new Date() },
      },
    },
  );
  return row;
}

async function ensureChannelSamples(date) {
  const adminId = await systemAdminId();
  if (!adminId) return 0;
  const { createChannelDeal } = await import('./channel-deal.js');
  let n = 0;
  for (const name of ['H100', 'H200', 'PPU']) {
    const sku = await Sku.findOne({ where: { name } });
    if (!sku) continue;
    const ref = await ReferencePrice.findOne({
      where: { sku_id: sku.id, date, region: 'shanghai' },
    });
    if (!ref) continue;
    const mid = Number(ref.price_mid);
    const exists = await ChannelDeal.count({
      where: {
        sku_id: sku.id,
        region: 'shanghai',
        deal_status: 'filled',
        deal_time: {
          [Op.gte]: new Date(`${addDaysShanghai(date, -2)}T00:00:00+08:00`),
        },
      },
    });
    if (exists >= 3) continue;
    for (let i = 0; i < 3; i++) {
      await createChannelDeal(
        {
          sku_id: sku.id,
          region: 'shanghai',
          qty: 4 + i * 2,
          unit_price: roundMoney(mid * (0.97 + i * 0.015)),
          deal_status: 'filled',
          source: 'manual',
          note: 'market-day sample',
          deal_time: new Date(`${addDaysShanghai(date, -i)}T14:30:00+08:00`),
        },
        adminId,
      ).catch(() => null);
      n += 1;
    }
  }
  return n;
}

/**
 * 启动 / 日切：保证「今天」行情大厅有真实可展示数据（幂等、不覆盖已有有效价）。
 */
export async function ensureMarketDay(asOf = todayShanghai()) {
  const refs = await upsertReferenceDay(asOf);
  const prints = await ensureIndexPrints(asOf);
  const bulletin = await ensurePublishedBulletin(asOf);
  const makers = await ensureMakerQuotes(asOf);
  const feeds = await ensureDealFeeds(asOf);
  await ensureAnnouncement();
  const channels = await ensureChannelSamples(asOf);
  return {
    date: asOf,
    reference_upserted: refs,
    index_prints: prints,
    bulletin: bulletin?.id || null,
    maker_quotes: makers,
    deal_feeds: feeds,
    channel_samples: channels,
  };
}

/**
 * 冷启动：回填近 N 日参考价曲线（仅补缺，不改已有 mid>0 的行）。
 */
export async function backfillMarketHistory(days = 21, asOf = todayShanghai()) {
  let total = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = addDaysShanghai(asOf, -i);
    total += await upsertReferenceDay(d);
    await ensureIndexPrints(d);
  }
  await ensurePublishedBulletin(asOf);
  await ensureMakerQuotes(asOf);
  await ensureDealFeeds(asOf);
  await ensureAnnouncement();
  return { days, reference_upserted: total, as_of: asOf };
}

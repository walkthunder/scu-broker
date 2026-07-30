import { Router } from 'express';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { ok, AppError } from '../utils/errors.js';
import { REGIONS } from '../constants/platform.js';
import {
  createChannelDeal,
  voidChannelDeal,
  listChannelDeals,
  importChannelDealsCsv,
  confirmChannelDeal,
} from '../services/channel-deal.js';
import {
  runEngineAll,
  submitBulletinForReview,
  reviewPublishBulletin,
  getCurve,
  getBulletinExportHtml,
  getNationalComposite,
} from '../services/index-engine.js';
import { getPlatformParams, setPlatformParam, seedPlatformDefaults } from '../services/platform-config.js';
import { getLatestPublished } from '../services/index-price.js';
import {
  adminDeposit,
  adminWithdraw,
  getBuyingPower,
  listEntries,
  getLedgerBreakdown,
  entriesToCsv,
} from '../services/ledger.js';
import {
  placeSpotOrder,
  cancelSpotOrder,
  getOrderBook,
  estimateImpact,
} from '../services/spot-book.js';
import {
  createRight,
  confirmRight,
  confirmRightFee,
  exerciseRight,
  listRights,
  putPoolStats,
  refPremium,
  presentRight,
  selfOpenRight,
} from '../services/right-contract.js';
import { PartnerCapacity, CrmLead, CrmNote, SpotBookOrder, MakerQuote, PriceBulletin as PB } from '../models/frd-models.js';
import { User, PriceIndex } from '../models/index.js';
import {
  setDeliveryIntent,
  listBillsForUser,
  listPresaleOffers,
  selfOpenForward,
} from '../services/forward-settle.js';
import { todayShanghai } from '../utils/market.js';
import { Op } from 'sequelize';
import {
  dailyPublishPrep,
  runExpireAll,
  runDailyJobs,
} from '../services/frd-jobs.js';
import { monitorForwardMargins, listUnderMargined } from '../services/margin-monitor.js';
import {
  submitPartnerApplication,
  listPartnerApplications,
  reviewPartnerApplication,
} from '../services/partner-onboard.js';
import {
  uploadDeliveryVoucher,
  listDeliveryOrders,
} from '../services/delivery.js';
import multer from 'multer';
import path from 'path';
import { config } from '../config/index.js';
import fs from 'fs';

const uploadDir = path.join(config.uploadDir, 'vouchers');
fs.mkdirSync(uploadDir, { recursive: true });
const voucherUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 8 * 1024 * 1024 },
});

const router = Router();
const staff = [authRequired, requireRoles('broker', 'admin')];
const portal = [authRequired, requireRoles('customer', 'broker', 'admin', 'partner')];
const partner = [authRequired, requireRoles('partner', 'admin')];

router.get('/meta/regions', (_req, res) => ok(res, REGIONS));

router.get('/platform-config', ...staff, async (_req, res, next) => {
  try {
    ok(res, await getPlatformParams());
  } catch (e) {
    next(e);
  }
});

router.put('/platform-config/:key', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    ok(res, await setPlatformParam(req.params.key, req.body.value, req.body.note));
  } catch (e) {
    next(e);
  }
});

router.post('/platform-config/seed-defaults', ...staff, requireRoles('admin'), async (_req, res, next) => {
  try {
    await seedPlatformDefaults();
    ok(res, await getPlatformParams());
  } catch (e) {
    next(e);
  }
});

// —— 渠道成交 ——
router.get('/channel-deals', ...staff, async (req, res, next) => {
  try {
    ok(res, await listChannelDeals(req.query));
  } catch (e) {
    next(e);
  }
});

router.post('/channel-deals', ...staff, async (req, res, next) => {
  try {
    ok(res, await createChannelDeal(req.body, req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/channel-deals/:id/void', ...staff, async (req, res, next) => {
  try {
    ok(res, await voidChannelDeal(req.params.id, req.body.reason, req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/channel-deals/import', ...staff, async (req, res, next) => {
  try {
    if (!req.body.csv) throw new AppError('请提供 csv 文本');
    const result = await importChannelDealsCsv(req.body.csv, req.user.id);
    ok(res, result.imported, result.errors?.length ? `部分失败 ${result.errors.length} 行` : 'ok');
  } catch (e) {
    next(e);
  }
});

router.post('/channel-deals/:id/confirm', ...staff, async (req, res, next) => {
  try {
    ok(res, await confirmChannelDeal(req.params.id, req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post(
  '/channel-deals/:id/voucher',
  ...staff,
  voucherUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('请上传凭证文件');
      const { ChannelDeal } = await import('../models/frd-models.js');
      const row = await ChannelDeal.findByPk(req.params.id);
      if (!row) throw new AppError('记录不存在', 404);
      row.voucher_path = `/uploads/vouchers/${path.basename(req.file.filename)}`;
      await row.save();
      ok(res, row);
    } catch (e) {
      next(e);
    }
  },
);
// —— 指数引擎 / 公告 ——
router.post('/index-engine/run', ...staff, async (req, res, next) => {
  try {
    const date = req.body.date || todayShanghai();
    ok(res, await runEngineAll(date, req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/price-bulletins/submit', ...staff, async (req, res, next) => {
  try {
    ok(res, await submitBulletinForReview(req.body.date || todayShanghai(), req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/price-bulletins/:date/publish', ...staff, async (req, res, next) => {
  try {
    ok(res, await reviewPublishBulletin(req.params.date, req.user.id));
  } catch (e) {
    next(e);
  }
});

router.get('/price-bulletins', ...staff, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const list = await PB.findAll({ where, order: [['date', 'DESC']], limit: 60 });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

router.get('/price-bulletins/latest', async (_req, res, next) => {
  try {
    const row = await PB.findOne({ where: { status: 'published' }, order: [['date', 'DESC']] });
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

router.get('/curves', async (req, res, next) => {
  try {
    ok(
      res,
      await getCurve({
        sku_id: Number(req.query.sku_id),
        region: req.query.region || 'shanghai',
        kind: req.query.kind || 'spot',
        from: req.query.from,
        to: req.query.to,
        granularity: req.query.granularity || 'day',
      }),
    );
  } catch (e) {
    next(e);
  }
});

// —— 账本 ——
router.post('/ledger/deposit', ...staff, async (req, res, next) => {
  try {
    await adminDeposit(req.body.user_id, req.body.amount, req.user.id, req.body.note);
    ok(res, await getBuyingPower(req.body.user_id));
  } catch (e) {
    next(e);
  }
});

router.post('/ledger/withdraw', ...staff, async (req, res, next) => {
  try {
    await adminWithdraw(req.body.user_id, req.body.amount, req.user.id, req.body.note);
    ok(res, await getBuyingPower(req.body.user_id));
  } catch (e) {
    next(e);
  }
});

router.get('/ledger/:userId', ...staff, async (req, res, next) => {
  try {
    ok(res, {
      ...(await getBuyingPower(Number(req.params.userId))),
      entries: await listEntries(Number(req.params.userId)),
    });
  } catch (e) {
    next(e);
  }
});

// —— 现货挂单 ——
router.get('/spot/book', async (req, res, next) => {
  try {
    const sku_id = Number(req.query.sku_id);
    if (!Number.isFinite(sku_id) || sku_id <= 0) throw new AppError('请指定 sku_id');
    const region = req.query.region || 'shanghai';
    const book = await getOrderBook(sku_id, region);
    const qty = Number(req.query.qty || 0);
    const impact =
      qty > 0
        ? {
            buy: estimateImpact(book.asks, qty),
            sell: estimateImpact(book.bids, qty),
          }
        : null;
    ok(res, { ...book, impact });
  } catch (e) {
    next(e);
  }
});

router.post('/spot/orders', ...portal, async (req, res, next) => {
  try {
    ok(res, await placeSpotOrder(req.user.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.get('/spot/orders/mine', ...portal, async (req, res, next) => {
  try {
    ok(
      res,
      await SpotBookOrder.findAll({
        where: { user_id: req.user.id },
        order: [['id', 'DESC']],
        limit: 100,
        include: [{ association: 'sku', attributes: ['id', 'name', 'unit'] }],
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.post('/spot/orders/:id/cancel', ...portal, async (req, res, next) => {
  try {
    ok(res, await cancelSpotOrder(req.user.id, Number(req.params.id)));
  } catch (e) {
    next(e);
  }
});

// —— 预售自助 ——
router.get('/presale/offers', ...portal, async (_req, res, next) => {
  try {
    ok(res, await listPresaleOffers());
  } catch (e) {
    next(e);
  }
});

router.post('/presale/open', ...portal, async (req, res, next) => {
  try {
    if (!['customer', 'admin', 'broker'].includes(req.user.role)) {
      throw new AppError('仅客户可自助买入预售', 403);
    }
    ok(res, await selfOpenForward(req.user.id, req.body), '已提交预售，请双方确认');
  } catch (e) {
    next(e);
  }
});

// —— 权益 ——
router.get('/rights', ...staff, async (req, res, next) => {
  try {
    ok(res, await listRights(req.query));
  } catch (e) {
    next(e);
  }
});

router.get('/rights/mine', ...portal, async (req, res, next) => {
  try {
    ok(res, await listRights({ userId: req.user.id }));
  } catch (e) {
    next(e);
  }
});

router.post('/rights', ...staff, async (req, res, next) => {
  try {
    const row = await createRight(req.body, req.user.id);
    ok(res, await presentRight(row));
  } catch (e) {
    next(e);
  }
});

router.post('/rights/self-open', ...portal, async (req, res, next) => {
  try {
    if (!['customer', 'admin', 'broker'].includes(req.user.role)) {
      throw new AppError('仅客户可自助买入权益', 403);
    }
    const row = await selfOpenRight(req.user.id, req.body);
    ok(res, await presentRight(row), '已提交权益，请确认后由运营收权利金');
  } catch (e) {
    next(e);
  }
});

router.post('/rights/premium-ref', ...portal, async (req, res, next) => {
  try {
    const params = await getPlatformParams();
    const { kind, strike, qty, sku_id, region, days, vol } = req.body;
    let spot = Number(req.body.spot);
    if (!(spot > 0) && sku_id && region) {
      const idx = await PriceIndex.findOne({
        where: { sku_id, region, status: 'active' },
      });
      if (idx) {
        const print = await getLatestPublished(idx.id);
        if (print) spot = Number(print.settle_price);
      }
    }
    ok(
      res,
      refPremium({
        spot: spot || Number(strike),
        strike: Number(strike),
        kind: kind || 'call',
        days: days || params.right_days,
        vol: vol || params.vol_for_premium,
        qty: qty || 1,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/rights/put-pool', ...staff, async (_req, res, next) => {
  try {
    ok(res, await putPoolStats());
  } catch (e) {
    next(e);
  }
});

router.post('/rights/:id/confirm', ...portal, async (req, res, next) => {
  try {
    ok(res, await presentRight(await confirmRight(Number(req.params.id), req.user.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/rights/:id/confirm-fee', ...staff, async (req, res, next) => {
  try {
    ok(res, await confirmRightFee(Number(req.params.id), req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/rights/:id/exercise', ...portal, async (req, res, next) => {
  try {
    ok(res, await exerciseRight(Number(req.params.id), req.user.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.post('/forwards/:id/delivery-intent', ...portal, async (req, res, next) => {
  try {
    ok(res, await setDeliveryIntent(Number(req.params.id), req.user.id, req.body.intent));
  } catch (e) {
    next(e);
  }
});

// —— 伙伴产能 ——
router.get('/partner-capacities', ...staff, async (_req, res, next) => {
  try {
    ok(
      res,
      await PartnerCapacity.findAll({
        include: [
          { association: 'supplier', attributes: ['id', 'name', 'display_name'] },
          { association: 'sku', attributes: ['id', 'name'] },
        ],
        order: [['id', 'ASC']],
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.post('/partner-capacities', ...staff, async (req, res, next) => {
  try {
    const {
      supplier_id,
      sku_id,
      region,
      spot_qty,
      forward_qty,
      rights_qty,
      quote_bid,
      quote_ask,
    } = req.body;
    const [row] = await PartnerCapacity.findOrCreate({
      where: { supplier_id, sku_id, region },
      defaults: {
        supplier_id,
        sku_id,
        region,
        spot_qty: spot_qty || 0,
        forward_qty: forward_qty || 0,
        rights_qty: rights_qty || 0,
        quote_bid: quote_bid ?? null,
        quote_ask: quote_ask ?? null,
      },
    });
    if (spot_qty != null) row.spot_qty = spot_qty;
    if (forward_qty != null) row.forward_qty = forward_qty;
    if (rights_qty != null) row.rights_qty = rights_qty;
    if (quote_bid !== undefined) row.quote_bid = quote_bid;
    if (quote_ask !== undefined) row.quote_ask = quote_ask;
    await row.save();
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

router.get('/partner/capacities/mine', ...partner, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.id);
    if (!u?.supplier_id && req.user.role !== 'admin') throw new AppError('未绑定供应商', 400);
    const where = req.user.role === 'admin' && req.query.supplier_id
      ? { supplier_id: req.query.supplier_id }
      : { supplier_id: u.supplier_id };
    ok(
      res,
      await PartnerCapacity.findAll({
        where,
        include: [{ association: 'sku', attributes: ['id', 'name'] }],
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.put('/partner/capacities/:id', ...partner, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.id);
    if (!u?.supplier_id) throw new AppError('伙伴账号未绑定供应商', 403);
    const row = await PartnerCapacity.findByPk(req.params.id);
    if (!row || Number(row.supplier_id) !== Number(u.supplier_id)) {
      throw new AppError('产能记录不存在或无权修改', 404);
    }
    for (const f of ['quote_bid', 'quote_ask']) {
      if (req.body[f] !== undefined) row[f] = req.body[f];
    }
    // 产能余量仅运营可改，防止伙伴自抬额度绕过 assertCapacity
    if (req.body.spot_qty != null || req.body.forward_qty != null || req.body.rights_qty != null) {
      throw new AppError('产能余量请联系运营调整，伙伴仅可维护双边报价', 403);
    }
    await row.save();
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

router.post('/partner/channel-deals', ...partner, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.id);
    if (!u?.supplier_id) throw new AppError('伙伴账号未绑定供应商', 403);
    // 伙伴上报默认进入「意向」，须运营 confirm 后才计入指数
    ok(
      res,
      await createChannelDeal(
        {
          ...req.body,
          source: 'partner',
          supplier_id: u.supplier_id,
          deal_status: 'intent',
          trust_tag: 'partner_pending',
        },
        req.user.id,
      ),
    );
  } catch (e) {
    next(e);
  }
});

// —— CRM ——
router.get('/crm/leads', ...staff, async (_req, res, next) => {
  try {
    ok(
      res,
      await CrmLead.findAll({
        include: [
          { association: 'owner', attributes: ['id', 'name'] },
          { association: 'user', attributes: ['id', 'name', 'company_name'] },
          { association: 'notes' },
        ],
        order: [['id', 'DESC']],
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.post('/crm/leads', ...staff, async (req, res, next) => {
  try {
    const body = {};
    for (const f of [
      'company_name',
      'contact_name',
      'phone',
      'source',
      'intent_sku',
      'intent_region',
      'intent_qty',
      'stage',
      'note',
      'user_id',
      'owner_id',
    ]) {
      if (req.body[f] !== undefined) body[f] = req.body[f];
    }
    body.owner_id = body.owner_id || req.user.id;
    ok(res, await CrmLead.create(body));
  } catch (e) {
    next(e);
  }
});

router.post('/crm/leads/:id/notes', ...staff, async (req, res, next) => {
  try {
    ok(
      res,
      await CrmNote.create({
        lead_id: Number(req.params.id),
        author_id: req.user.id,
        content: req.body.content,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.put('/crm/leads/:id', ...staff, async (req, res, next) => {
  try {
    const row = await CrmLead.findByPk(req.params.id);
    if (!row) throw new AppError('不存在', 404);
    for (const f of [
      'stage',
      'source',
      'intent_sku',
      'intent_region',
      'intent_qty',
      'note',
      'company_name',
      'contact_name',
      'phone',
      'user_id',
      'owner_id',
    ]) {
      if (req.body[f] !== undefined) row[f] = req.body[f];
    }
    await row.save();
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

// —— 控制台聚合 ——
router.get('/console/me', ...portal, async (req, res, next) => {
  try {
    const { listForwardsForUser } = await import('../services/forward-settle.js');
    const bal = await getLedgerBreakdown(req.user.id);
    const rights = await listRights({ userId: req.user.id });
    const forwards = await listForwardsForUser(req.user.id);
    const bills = await listBillsForUser(req.user.id);
    const spotOrders = await SpotBookOrder.findAll({
      where: { user_id: req.user.id, status: { [Op.in]: ['open', 'partial'] } },
      limit: 20,
    });
    const openFwdMtm = forwards
      .filter((f) => f.status === 'open' && f.mtm)
      .reduce((s, f) => s + Number(f.mtm.signed_amount || 0), 0);
    const underMine = (await listUnderMargined()).filter(
      (u) => Number(u.buyer_id) === Number(req.user.id),
    );
    ok(res, {
      ledger: bal,
      rights,
      forwards,
      bills: bills.slice(0, 20),
      mtm_statements: (
        await import('../services/mtm-statements.js').then((m) =>
          m.listMtmStatements(req.user.id, { limit: 30 }),
        )
      ),
      spot_open: spotOrders,
      pnl: {
        forward_mtm: Math.round(openFwdMtm * 100) / 100,
        realized_hint: '见结算账单 cashflow',
      },
      todos: [
        ...underMine.map((u) => ({
          type: 'margin_call',
          id: u.contract_id,
          shortfall: u.shortfall,
          label: `预售#${u.contract_id} 需追保 ${u.shortfall}`,
          href: '/forwards?tab=open',
        })),
        ...rights
          .filter((r) => r.status === 'pending_confirm' && !r.buyer_confirmed_at)
          .map((r) => ({
            type: 'right_confirm',
            id: r.id,
            label: `权益#${r.id} 待确认`,
            href: '/rights',
          })),
        ...rights
          .filter((r) => {
            if (r.status !== 'open') return false;
            const today = todayShanghai();
            return r.window_start <= today && r.window_end >= today;
          })
          .map((r) => ({
            type: 'right_exercise',
            id: r.id,
            label: `权益#${r.id} 可行权`,
            href: '/rights',
          })),
        ...forwards
          .filter((f) => f.status === 'pending_confirm')
          .map((f) => ({
            type: 'forward_confirm',
            id: f.id,
            label: `预售#${f.id} 待确认`,
            href: '/forwards?tab=pending',
          })),
        ...forwards
          .filter(
            (f) =>
              f.status === 'open' &&
              f.intent_window_open &&
              (f.delivery_intent === 'unset' || !f.delivery_intent),
          )
          .map((f) => ({
            type: 'delivery_intent',
            id: f.id,
            label: `预售#${f.id} 待交割意愿`,
            href: '/forwards?tab=open',
          })),
        ...bills
          .filter((b) => b.pay_status !== 'done' && b.cashflow === 'pay')
          .map((b) => ({
            type: 'bill_pay',
            id: b.id,
            label: `账单#${b.id} 待收付`,
            href: '/bills',
          })),
        ...spotOrders.map((o) => ({
          type: 'spot_open',
          id: o.id,
          label: `现货挂单#${o.id} ${o.side}`,
          href: '/spot',
        })),
      ],
    });
  } catch (e) {
    next(e);
  }
});

router.get('/ledger/:userId/export', ...staff, async (req, res, next) => {
  try {
    const entries = await listEntries(Number(req.params.userId), 5000);
    const csv = entriesToCsv(entries);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ledger-${req.params.userId}.csv"`);
    res.send('\ufeff' + csv);
  } catch (e) {
    next(e);
  }
});

router.get('/risk/overview', ...staff, async (_req, res, next) => {
  try {
    const pool = await putPoolStats();
    const params = await getPlatformParams();
    const under = await listUnderMargined();
    ok(res, {
      put_pool: pool,
      params,
      under_margin: under,
      limits: {
        customer_limit_notional: params.customer_limit_notional,
        platform_limit_notional: params.platform_limit_notional,
      },
    });
  } catch (e) {
    next(e);
  }
});

// —— 定时任务 / 作业 ——
router.post('/jobs/daily-publish-prep', ...staff, async (req, res, next) => {
  try {
    ok(res, await dailyPublishPrep(req.body.date || todayShanghai(), req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/jobs/margin-monitor', ...staff, async (_req, res, next) => {
  try {
    ok(res, await monitorForwardMargins());
  } catch (e) {
    next(e);
  }
});

router.post('/jobs/mtm-statements', ...staff, async (req, res, next) => {
  try {
    const { generateDailyMtmStatements } = await import('../services/mtm-statements.js');
    ok(res, await generateDailyMtmStatements(req.body.date || todayShanghai()));
  } catch (e) {
    next(e);
  }
});

router.post('/jobs/expire-all', ...staff, async (_req, res, next) => {
  try {
    ok(res, await runExpireAll());
  } catch (e) {
    next(e);
  }
});

router.post('/jobs/daily-run', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    ok(res, await runDailyJobs({ date: req.body.date || todayShanghai(), userId: req.user.id }));
  } catch (e) {
    next(e);
  }
});

router.get('/price-bulletins/:date/export.html', ...staff, async (req, res, next) => {
  try {
    const html = await getBulletinExportHtml(req.params.date);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

// —— 做市双边参考报价 ——
router.get('/maker-quotes', ...staff, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.sku_id) where.sku_id = Number(req.query.sku_id);
    if (req.query.region) where.region = req.query.region;
    if (req.query.date) where.date = req.query.date;
    ok(
      res,
      await MakerQuote.findAll({
        where,
        order: [
          ['date', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: 100,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.post('/maker-quotes', ...staff, async (req, res, next) => {
  try {
    const { sku_id, region, date, bid, ask, note } = req.body;
    if (!sku_id || !(Number(bid) > 0) || !(Number(ask) > 0)) {
      throw new AppError('sku_id、bid、ask 必填且须大于 0');
    }
    if (Number(ask) < Number(bid)) throw new AppError('ask 须 ≥ bid');
    const row = await MakerQuote.create({
      sku_id: Number(sku_id),
      region: region || 'shanghai',
      date: date || todayShanghai(),
      bid: Number(bid),
      ask: Number(ask),
      note: note || null,
      created_by: req.user.id,
    });
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

router.delete('/maker-quotes/:id', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    const row = await MakerQuote.findByPk(req.params.id);
    if (!row) throw new AppError('报价不存在', 404);
    await row.destroy();
    ok(res, { id: Number(req.params.id) });
  } catch (e) {
    next(e);
  }
});

router.get('/national-composite', async (req, res, next) => {
  try {
    ok(res, await getNationalComposite(req.query.date || todayShanghai()));
  } catch (e) {
    next(e);
  }
});

// —— 伙伴入驻 ——
router.post('/partner/applications', async (req, res, next) => {
  try {
    ok(res, await submitPartnerApplication(req.body));
  } catch (e) {
    next(e);
  }
});

router.get('/partner/applications', ...staff, async (req, res, next) => {
  try {
    ok(res, await listPartnerApplications(req.query.status));
  } catch (e) {
    next(e);
  }
});

router.post('/partner/applications/:id/review', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    ok(res, await reviewPartnerApplication(Number(req.params.id), req.user.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.get('/partner/deliveries', ...partner, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.id);
    if (!u?.supplier_id) throw new AppError('伙伴账号未绑定供应商', 403);
    const rows = await listDeliveryOrders({ ...req.query, supplier_id: u.supplier_id });
    ok(res, rows);
  } catch (e) {
    next(e);
  }
});

router.post(
  '/partner/deliveries/:id/voucher',
  ...partner,
  voucherUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('请上传凭证文件');
      const u = await User.findByPk(req.user.id);
      if (!u?.supplier_id) throw new AppError('伙伴账号未绑定供应商', 403);
      const rel = `/uploads/vouchers/${path.basename(req.file.filename)}`;
      ok(
        res,
        await uploadDeliveryVoucher(Number(req.params.id), rel, req.body.note, {
          supplier_id: u.supplier_id,
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

export default router;

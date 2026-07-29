import { Router } from 'express';
import { Op, fn, col } from 'sequelize';
import {
  Sku,
  ReferencePrice,
  Rfq,
  Quote,
  Order,
  OrderLog,
  Supplier,
  User,
  Attachment,
  Announcement,
} from '../models/index.js';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { AppError, ok } from '../utils/errors.js';
import { notifyBrokersNewRfq } from '../services/notify.js';
import { sequelize } from '../config/database.js';
import {
  todayShanghai,
  addDaysShanghai,
  publicSkuWhere,
  isTestSkuName,
  calcChange,
} from '../utils/market.js';

const router = Router();
const portalAuth = [authRequired, requireRoles('customer', 'broker', 'admin')];

function presentRfq(rfq) {
  const j = typeof rfq.toJSON === 'function' ? rfq.toJSON() : { ...rfq };
  if (!j.quote || j.quote.status === 'draft') {
    j.quote = null;
  } else if (j.quote) {
    if (j.quote.expiry_time) {
      const rem = Math.max(0, Math.floor((new Date(j.quote.expiry_time) - Date.now()) / 1000));
      j.quote.remaining_seconds = rem;
    }
    if (j.quote.supplier) {
      j.quote.supplier_display =
        j.quote.supplier.display_name || `供应商 ${j.quote.supplier.id}`;
      delete j.quote.supplier.name;
      delete j.quote.supplier.contact_name;
      delete j.quote.supplier.contact_phone;
      delete j.quote.supplier.wechat;
    }
  }
  return j;
}

async function dealMaps() {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const deals = await Order.findAll({
    attributes: [
      'sku_id',
      [fn('MIN', col('price')), 'min_price'],
      [fn('MAX', col('price')), 'max_price'],
    ],
    where: { status: '已完成', updatedAt: { [Op.gte]: since } },
    group: ['sku_id'],
    raw: true,
  });
  return Object.fromEntries(deals.map((d) => [d.sku_id, d]));
}

async function priceMapsFor(date) {
  const yesterday = addDaysShanghai(date, -1);
  const [todayRows, ydayRows] = await Promise.all([
    ReferencePrice.findAll({ where: { date } }),
    ReferencePrice.findAll({ where: { date: yesterday } }),
  ]);
  return {
    today: Object.fromEntries(todayRows.map((p) => [p.sku_id, p])),
    yesterday: Object.fromEntries(ydayRows.map((p) => [p.sku_id, p])),
  };
}

function filterPublicSkus(skus) {
  return skus.filter((s) => s.is_public !== false && !isTestSkuName(s.name));
}

function presentSkuPrice(s, todayMap, ydayMap, dealMap, date) {
  const p = todayMap[s.id];
  const y = ydayMap[s.id];
  const d = dealMap[s.id];
  const change = calcChange(p?.price_mid, y?.price_mid);
  return {
    sku_id: s.id,
    id: s.id,
    name: s.name,
    type: s.type,
    unit: s.unit,
    spec: s.spec,
    selling_point: s.selling_point,
    delivery_note: s.delivery_note,
    image_url: s.image_url,
    is_hot: !!s.is_hot,
    sort_weight: s.sort_weight || 0,
    price_low: p ? Number(p.price_low) : null,
    price_mid: p ? Number(p.price_mid) : null,
    price_high: p ? Number(p.price_high) : null,
    deal_low: d ? Number(d.min_price) : null,
    deal_high: d ? Number(d.max_price) : null,
    date: p ? p.date : date,
    ...change,
  };
}

router.get('/announcement', async (_req, res, next) => {
  try {
    const now = new Date();
    const row = await Announcement.findOne({
      where: {
        is_active: true,
        [Op.and]: [
          { [Op.or]: [{ start_time: null }, { start_time: { [Op.lte]: now } }] },
          { [Op.or]: [{ end_time: null }, { end_time: { [Op.gte]: now } }] },
        ],
      },
      order: [['id', 'DESC']],
    });
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

router.get('/market-pulse', async (_req, res, next) => {
  try {
    const date = todayShanghai();
    const priced = await ReferencePrice.count({ where: { date } });
    const pending = await Rfq.count({ where: { status: 'pending' } });
    const { DealFeed } = await import('../models/index.js');
    const feedCount = await DealFeed.count({ where: { is_published: true } });
    const latestPrice = await ReferencePrice.findOne({
      where: { date },
      order: [['updatedAt', 'DESC']],
    });
    ok(res, {
      price_as_of: date,
      priced_sku_count: priced,
      published_feed_count: feedCount,
      inquiry_active: pending > 0,
      pulse_text: pending > 0 ? '询价活跃' : feedCount > 0 ? '成交动态更新中' : '行情已更新',
      sla_hint: '通常 2–6 小时反馈 · 正式报价 24 小时有效',
      server_time: new Date().toISOString(),
      last_price_touch: latestPrice?.updatedAt?.toISOString?.() || null,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/deal-feeds', async (_req, res, next) => {
  try {
    const { listPublishedDealFeeds } = await import('../services/deal-feed.js');
    ok(res, await listPublishedDealFeeds(20));
  } catch (e) {
    next(e);
  }
});

router.get('/hot-skus', async (_req, res, next) => {
  try {
    const date = todayShanghai();
    const skus = filterPublicSkus(
      await Sku.findAll({
        where: { ...publicSkuWhere(), is_hot: true },
        order: [
          ['sort_weight', 'DESC'],
          ['id', 'ASC'],
        ],
        limit: 6,
      }),
    );
    const { today, yesterday } = await priceMapsFor(date);
    const deals = await dealMaps();
    ok(
      res,
      skus.map((s) => presentSkuPrice(s, today, yesterday, deals, date)),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/reference-prices', async (_req, res, next) => {
  try {
    const date = todayShanghai();
    const skus = filterPublicSkus(
      await Sku.findAll({
        where: publicSkuWhere(),
        order: [
          ['sort_weight', 'DESC'],
          ['id', 'ASC'],
        ],
      }),
    );
    const { today, yesterday } = await priceMapsFor(date);
    const deals = await dealMaps();
    ok(
      res,
      skus.map((s) => presentSkuPrice(s, today, yesterday, deals, date)),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/skus', async (_req, res, next) => {
  try {
    const list = filterPublicSkus(
      await Sku.findAll({
        where: publicSkuWhere(),
        order: [
          ['sort_weight', 'DESC'],
          ['id', 'ASC'],
        ],
      }),
    );
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

router.get('/skus/:id', async (req, res, next) => {
  try {
    const sku = await Sku.findByPk(req.params.id);
    if (!sku || sku.status !== 'active' || !sku.is_public || isTestSkuName(sku.name)) {
      throw new AppError('SKU 不存在或已下架', 404);
    }
    const date = todayShanghai();
    const { today, yesterday } = await priceMapsFor(date);
    const deals = await dealMaps();
    const base = presentSkuPrice(sku, today, yesterday, deals, date);
    const history = await ReferencePrice.findAll({
      where: { sku_id: sku.id },
      order: [['date', 'DESC']],
      limit: 30,
    });
    ok(res, { ...base, price_history: history });
  } catch (e) {
    next(e);
  }
});

router.post('/rfqs', ...portalAuth, async (req, res, next) => {
  try {
    const { sku_id, quantity, duration, delivery_date, budget_range, note, submit_page } =
      req.body;
    if (!sku_id || !quantity) throw new AppError('请选择 SKU 并填写数量');
    const sku = await Sku.findByPk(sku_id);
    if (!sku || sku.status !== 'active' || !sku.is_public) {
      throw new AppError('SKU 不存在或已下架');
    }

    if (req.body.company_name) {
      req.user.company_name = String(req.body.company_name).trim();
      await req.user.save();
    }
    if (req.body.name) {
      req.user.name = String(req.body.name).trim();
      await req.user.save();
    }

    const sla = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const rfq = await Rfq.create({
      customer_id: req.user.id,
      sku_id,
      quantity,
      duration: duration || null,
      delivery_date: delivery_date || null,
      budget_range: budget_range || null,
      note: note || null,
      status: 'pending',
      submit_page: submit_page || null,
      sla_deadline: sla,
    });

    const brokers = await User.findAll({
      where: { role: { [Op.in]: ['broker', 'admin'] } },
    });
    await notifyBrokersNewRfq({
      brokers,
      rfqId: rfq.id,
      company: req.user.company_name,
    });

    ok(res, presentRfq(rfq), '已提交，Broker 将在 2-6 小时内联系您');
  } catch (e) {
    next(e);
  }
});

router.get('/rfqs', ...portalAuth, async (req, res, next) => {
  try {
    const list = await Rfq.findAll({
      where: { customer_id: req.user.id },
      include: [
        { model: Sku, as: 'sku' },
        {
          model: Quote,
          as: 'quote',
          include: [{ model: Supplier, as: 'supplier', attributes: ['id', 'display_name', 'name'] }],
        },
      ],
      order: [['id', 'DESC']],
    });
    ok(res, list.map(presentRfq));
  } catch (e) {
    next(e);
  }
});

router.get('/rfqs/:id', ...portalAuth, async (req, res, next) => {
  try {
    const rfq = await Rfq.findOne({
      where: { id: req.params.id, customer_id: req.user.id },
      include: [
        { model: Sku, as: 'sku' },
        {
          model: Quote,
          as: 'quote',
          include: [{ model: Supplier, as: 'supplier', attributes: ['id', 'display_name'] }],
        },
      ],
    });
    if (!rfq) throw new AppError('询价不存在', 404);
    ok(res, presentRfq(rfq));
  } catch (e) {
    next(e);
  }
});

async function respondQuote(req, res, next, action) {
  const t = await sequelize.transaction();
  try {
    const quote = await Quote.findByPk(req.params.id, {
      include: [{ model: Rfq, as: 'rfq' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!quote || quote.rfq.customer_id !== req.user.id) {
      throw new AppError('报价不存在', 404);
    }
    if (quote.status !== 'pending') throw new AppError('报价状态不可操作');
    if (quote.expiry_time && new Date(quote.expiry_time) < new Date()) {
      throw new AppError('报价已过期');
    }

    if (action === 'confirm') {
      quote.status = 'confirmed';
      await quote.save({ transaction: t });
      quote.rfq.status = 'confirmed';
      await quote.rfq.save({ transaction: t });

      const order = await Order.create(
        {
          quote_id: quote.id,
          customer_id: quote.rfq.customer_id,
          supplier_id: quote.supplier_id,
          broker_id: quote.broker_id,
          sku_id: quote.rfq.sku_id,
          price: quote.price,
          status: '待签约',
        },
        { transaction: t },
      );
      await OrderLog.create(
        {
          order_id: order.id,
          from_status: null,
          to_status: '待签约',
          note: '客户确认报价，订单生成',
          operator_id: req.user.id,
          is_customer_visible: true,
        },
        { transaction: t },
      );
      await t.commit();
      ok(res, { quote, order }, '已确认报价，订单已生成');
    } else {
      quote.status = 'rejected';
      await quote.save({ transaction: t });
      quote.rfq.status = 'rejected';
      if (req.body?.reject_reason) {
        quote.rfq.reject_reason = String(req.body.reject_reason).slice(0, 255);
      }
      await quote.rfq.save({ transaction: t });
      await t.commit();
      ok(res, { quote }, '已拒绝报价');
    }
  } catch (e) {
    await t.rollback();
    next(e);
  }
}

router.post('/quotes/:id/confirm', ...portalAuth, (req, res, next) =>
  respondQuote(req, res, next, 'confirm'),
);
router.post('/quotes/:id/reject', ...portalAuth, (req, res, next) =>
  respondQuote(req, res, next, 'reject'),
);

router.get('/quotes/:id', ...portalAuth, async (req, res, next) => {
  try {
    const quote = await Quote.findByPk(req.params.id, {
      include: [
        { model: Rfq, as: 'rfq' },
        { model: Supplier, as: 'supplier', attributes: ['id', 'display_name'] },
      ],
    });
    if (!quote || quote.rfq.customer_id !== req.user.id) {
      throw new AppError('报价不存在', 404);
    }
    if (quote.status === 'draft') throw new AppError('报价不存在', 404);
    const j = quote.toJSON();
    j.supplier_display = j.supplier?.display_name || `供应商 ${j.supplier_id}`;
    delete j.supplier;
    if (j.expiry_time) {
      j.remaining_seconds = Math.max(0, Math.floor((new Date(j.expiry_time) - Date.now()) / 1000));
    }
    ok(res, j);
  } catch (e) {
    next(e);
  }
});

router.get('/orders', ...portalAuth, async (req, res, next) => {
  try {
    const list = await Order.findAll({
      where: { customer_id: req.user.id },
      include: [
        { model: Sku, as: 'sku' },
        { model: Supplier, as: 'supplier', attributes: ['id', 'display_name'] },
      ],
      order: [['id', 'DESC']],
    });
    const data = list.map((o) => {
      const j = o.toJSON();
      j.supplier_display = j.supplier?.display_name || `供应商 ${j.supplier_id}`;
      return j;
    });
    ok(res, data);
  } catch (e) {
    next(e);
  }
});

router.get('/orders/:id', ...portalAuth, async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, customer_id: req.user.id },
      include: [
        { model: Sku, as: 'sku' },
        { model: Supplier, as: 'supplier', attributes: ['id', 'display_name'] },
        { model: Quote, as: 'quote' },
        {
          model: OrderLog,
          as: 'logs',
          where: { is_customer_visible: true },
          required: false,
          include: [{ model: User, as: 'operator', attributes: ['id', 'name'] }],
        },
      ],
    });
    if (!order) throw new AppError('订单不存在', 404);
    const attachments = await Attachment.findAll({
      where: { related_type: 'order', related_id: order.id },
    });
    const j = order.toJSON();
    j.supplier_display = j.supplier?.display_name || `供应商 ${j.supplier_id}`;
    j.attachments = attachments;
    ok(res, j);
  } catch (e) {
    next(e);
  }
});

// —— V4 indices / forwards / bills ——
router.get('/indices', async (_req, res, next) => {
  try {
    const { listIndices, getLatestPublished } = await import('../services/index-price.js');
    const list = await listIndices({ activeOnly: true });
    const out = [];
    for (const idx of list) {
      const j = idx.toJSON();
      const latest = await getLatestPublished(idx.id);
      j.latest_published = latest
        ? { date: latest.date, settle_price: Number(latest.settle_price) }
        : null;
      out.push(j);
    }
    ok(res, out);
  } catch (e) {
    next(e);
  }
});

router.get('/indices/:id/prints', async (req, res, next) => {
  try {
    const { listPrints } = await import('../services/index-price.js');
    const prints = await listPrints(req.params.id, { from: req.query.from, to: req.query.to });
    ok(
      res,
      prints
        .filter((p) => p.status === 'published')
        .map((p) => ({
          date: p.date,
          settle_price: Number(p.settle_price),
          source: p.source,
        })),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/forwards', ...portalAuth, async (req, res, next) => {
  try {
    const { listForwardsForUser } = await import('../services/forward-settle.js');
    ok(res, await listForwardsForUser(req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/forwards/:id/confirm', ...portalAuth, async (req, res, next) => {
  try {
    const { confirmForward } = await import('../services/forward-settle.js');
    ok(res, await confirmForward(req.params.id, req.user.id), '已确认');
  } catch (e) {
    next(e);
  }
});

router.get('/settlement-bills', ...portalAuth, async (req, res, next) => {
  try {
    const { listBillsForUser } = await import('../services/forward-settle.js');
    ok(res, await listBillsForUser(req.user.id));
  } catch (e) {
    next(e);
  }
});

export default router;

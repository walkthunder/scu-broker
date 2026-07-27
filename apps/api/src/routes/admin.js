import { Router } from 'express';
import { Op, fn, col } from 'sequelize';
import {
  User,
  Sku,
  Supplier,
  ReferencePrice,
  Rfq,
  Quote,
  Order,
  OrderLog,
  Payment,
  Attachment,
  Announcement,
} from '../models/index.js';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { upload, publicUploadPath } from '../middleware/upload.js';
import { AppError, ok } from '../utils/errors.js';
import { notifyCustomerQuote } from '../services/notify.js';
import {
  assertOrderTransition,
  ORDER_STATUS_TIMESTAMPS,
} from '../services/order-state.js';

const router = Router();
const staff = [authRequired, requireRoles('broker', 'admin')];

// —— Dashboard ——
router.get('/dashboard', ...staff, async (_req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayRfqs, pendingRfqs, monthOrders, monthSum] = await Promise.all([
      Rfq.count({ where: { created_at: { [Op.gte]: todayStart } } }),
      Rfq.count({ where: { status: 'pending' } }),
      Order.count({
        where: {
          status: { [Op.notIn]: ['已取消'] },
          created_at: { [Op.gte]: monthStart },
        },
      }),
      Order.findOne({
        attributes: [[fn('COALESCE', fn('SUM', col('price')), 0), 'total']],
        where: {
          status: { [Op.in]: ['已完成', '待结算', '待验收', '待交付', '待签约'] },
          created_at: { [Op.gte]: monthStart },
        },
        raw: true,
      }),
    ]);

    const recentPending = await Rfq.findAll({
      where: { status: 'pending' },
      include: [
        { model: Sku, as: 'sku' },
        { model: User, as: 'customer', attributes: ['id', 'name', 'company_name', 'phone'] },
      ],
      order: [['id', 'DESC']],
      limit: 5,
    });

    ok(res, {
      today_rfqs: todayRfqs,
      pending_rfqs: pendingRfqs,
      month_orders: monthOrders,
      month_amount: Number(monthSum?.total || 0),
      recent_pending: recentPending,
    });
  } catch (e) {
    next(e);
  }
});

// —— Brokers list for assign ——
router.get('/brokers', ...staff, async (_req, res, next) => {
  try {
    const list = await User.findAll({
      where: { role: { [Op.in]: ['broker', 'admin'] } },
      attributes: ['id', 'name', 'phone', 'role'],
      order: [['id', 'ASC']],
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

// —— SKU ——
router.get('/skus', ...staff, async (_req, res, next) => {
  try {
    ok(res, await Sku.findAll({ order: [['id', 'ASC']] }));
  } catch (e) {
    next(e);
  }
});

router.post('/skus', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    const {
      name,
      type,
      unit,
      spec,
      status,
      is_public,
      is_hot,
      sort_weight,
      selling_point,
      delivery_note,
      image_url,
    } = req.body;
    if (!name) throw new AppError('名称必填');
    const sku = await Sku.create({
      name,
      type: type || 'gpu',
      unit: unit || '小时',
      spec: spec || null,
      status: status || 'active',
      is_public: is_public !== false,
      is_hot: !!is_hot,
      sort_weight: Number(sort_weight) || 0,
      selling_point: selling_point || null,
      delivery_note: delivery_note || null,
      image_url: image_url || null,
    });
    ok(res, sku);
  } catch (e) {
    next(e);
  }
});

router.put('/skus/:id', ...staff, async (req, res, next) => {
  try {
    const sku = await Sku.findByPk(req.params.id);
    if (!sku) throw new AppError('SKU 不存在', 404);
    const fields = [
      'name',
      'type',
      'unit',
      'spec',
      'status',
      'is_public',
      'is_hot',
      'sort_weight',
      'selling_point',
      'delivery_note',
      'image_url',
    ];
    // 仅 admin 可改名称/类型等核心字段；broker 可改运营字段
    const brokerSafe = [
      'is_public',
      'is_hot',
      'sort_weight',
      'selling_point',
      'delivery_note',
      'image_url',
      'status',
    ];
    for (const f of fields) {
      if (req.body[f] === undefined) continue;
      if (req.user.role !== 'admin' && !brokerSafe.includes(f)) continue;
      sku[f] = req.body[f];
    }
    await sku.save();
    ok(res, sku);
  } catch (e) {
    next(e);
  }
});

// —— Suppliers ——
router.get('/suppliers', ...staff, async (_req, res, next) => {
  try {
    ok(res, await Supplier.findAll({ order: [['id', 'ASC']] }));
  } catch (e) {
    next(e);
  }
});

router.post('/suppliers', ...staff, async (req, res, next) => {
  try {
    const {
      name,
      display_name,
      contact_name,
      contact_phone,
      wechat,
      skus,
      price_style,
      reliability,
      note,
    } = req.body;
    if (!name) throw new AppError('供应商名称必填');
    const s = await Supplier.create({
      name,
      display_name: display_name || null,
      contact_name: contact_name || null,
      contact_phone: contact_phone || null,
      wechat: wechat || null,
      skus: skus || null,
      price_style: price_style || null,
      reliability: reliability || null,
      note: note || null,
    });
    ok(res, s);
  } catch (e) {
    next(e);
  }
});

router.put('/suppliers/:id', ...staff, async (req, res, next) => {
  try {
    const s = await Supplier.findByPk(req.params.id);
    if (!s) throw new AppError('供应商不存在', 404);
    const fields = [
      'name',
      'display_name',
      'contact_name',
      'contact_phone',
      'wechat',
      'skus',
      'price_style',
      'reliability',
      'note',
    ];
    for (const f of fields) {
      if (req.body[f] !== undefined) s[f] = req.body[f];
    }
    await s.save();
    ok(res, s);
  } catch (e) {
    next(e);
  }
});

// —— Reference prices ——
router.get('/reference-prices', ...staff, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.date) where.date = req.query.date;
    if (req.query.sku_id) where.sku_id = req.query.sku_id;
    const list = await ReferencePrice.findAll({
      where,
      include: [{ model: Sku, as: 'sku' }],
      order: [
        ['date', 'DESC'],
        ['sku_id', 'ASC'],
      ],
      limit: 500,
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

router.post('/reference-prices', ...staff, async (req, res, next) => {
  try {
    const { sku_id, date, price_low, price_mid, price_high } = req.body;
    if (!sku_id || !date || price_low == null || price_mid == null || price_high == null) {
      throw new AppError('请填写完整参考价');
    }
    let row = await ReferencePrice.findOne({ where: { sku_id, date } });
    if (row) {
      row.price_low = price_low;
      row.price_mid = price_mid;
      row.price_high = price_high;
      row.created_by = req.user.id;
      await row.save();
    } else {
      row = await ReferencePrice.create({
        sku_id,
        date,
        price_low,
        price_mid,
        price_high,
        source: '人工录入',
        created_by: req.user.id,
      });
    }
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

// —— RFQs ——
router.get('/rfqs', ...staff, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const list = await Rfq.findAll({
      where,
      include: [
        { model: Sku, as: 'sku' },
        { model: User, as: 'customer', attributes: ['id', 'name', 'company_name', 'phone'] },
        { model: User, as: 'broker', attributes: ['id', 'name', 'phone'] },
        {
          model: Quote,
          as: 'quote',
          include: [{ model: Supplier, as: 'supplier' }],
        },
      ],
      order: [['id', 'DESC']],
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

router.put('/rfqs/:id/assign', ...staff, async (req, res, next) => {
  try {
    const rfq = await Rfq.findByPk(req.params.id);
    if (!rfq) throw new AppError('询价不存在', 404);
    const broker_id = req.body.broker_id;
    if (!broker_id) throw new AppError('请选择 Broker');
    const broker = await User.findByPk(broker_id);
    if (!broker || !['broker', 'admin'].includes(broker.role)) {
      throw new AppError('无效的 Broker');
    }
    rfq.broker_id = broker_id;
    await rfq.save();
    ok(res, rfq);
  } catch (e) {
    next(e);
  }
});

// —— Quotes ——
router.post('/quotes', ...staff, async (req, res, next) => {
  try {
    const { rfq_id, supplier_id, price, delivery_date, note, customer_view_note } = req.body;
    if (!rfq_id || !supplier_id || price == null) {
      throw new AppError('请填写询价、供应商和成交价');
    }
    const rfq = await Rfq.findByPk(rfq_id);
    if (!rfq) throw new AppError('询价不存在', 404);
    if (['confirmed', 'rejected'].includes(rfq.status)) {
      throw new AppError('询价已结束，无法报价');
    }
    const supplier = await Supplier.findByPk(supplier_id);
    if (!supplier) throw new AppError('供应商不存在');

    let quote = await Quote.findOne({ where: { rfq_id } });
    if (quote && quote.status === 'confirmed') {
      throw new AppError('报价已确认，无法修改');
    }
    const payload = {
      rfq_id,
      supplier_id,
      broker_id: req.user.id,
      price,
      delivery_date: delivery_date || null,
      note: note || null,
      customer_view_note: customer_view_note || null,
      status: 'draft',
      expiry_time: null,
      sent_at: null,
    };
    if (quote) {
      Object.assign(quote, payload);
      await quote.save();
      // 改价后重新变草稿，客户侧暂不可见，需再次发送
      if (rfq.status === 'quoted') {
        rfq.status = 'pending';
        await rfq.save();
      }
    } else {
      quote = await Quote.create(payload);
    }
    if (!rfq.broker_id) {
      rfq.broker_id = req.user.id;
      await rfq.save();
    }
    ok(res, quote);
  } catch (e) {
    next(e);
  }
});

router.put('/quotes/:id/send', ...staff, async (req, res, next) => {
  try {
    const quote = await Quote.findByPk(req.params.id, {
      include: [{ model: Rfq, as: 'rfq', include: [{ model: User, as: 'customer' }] }],
    });
    if (!quote) throw new AppError('报价不存在', 404);
    if (quote.status === 'confirmed') throw new AppError('报价已确认');
    if (quote.status === 'rejected') throw new AppError('报价已拒绝，请重新录入后再发送');
    quote.status = 'pending';
    quote.sent_at = new Date();
    quote.expiry_time = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await quote.save();
    quote.rfq.status = 'quoted';
    await quote.rfq.save();
    await notifyCustomerQuote({
      customer: quote.rfq.customer,
      quoteId: quote.id,
    });
    ok(res, quote, '报价已发送给客户');
  } catch (e) {
    next(e);
  }
});

// —— Orders ——
router.get('/orders', ...staff, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const list = await Order.findAll({
      where,
      include: [
        { model: Sku, as: 'sku' },
        { model: Supplier, as: 'supplier' },
        { model: User, as: 'customer', attributes: ['id', 'name', 'company_name', 'phone'] },
        { model: User, as: 'broker', attributes: ['id', 'name'] },
        { model: OrderLog, as: 'logs', include: [{ model: User, as: 'operator', attributes: ['id', 'name'] }] },
        { model: Payment, as: 'payments' },
      ],
      order: [['id', 'DESC']],
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

router.put('/orders/:id/status', ...staff, async (req, res, next) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) throw new AppError('订单不存在', 404);
    const { status, note, penalty_amount, penalty_note, is_customer_visible } = req.body;
    if (!status) throw new AppError('请指定目标状态');
    assertOrderTransition(order.status, status);
    const from = order.status;
    order.status = status;
    const tsField = ORDER_STATUS_TIMESTAMPS[status];
    if (tsField) order[tsField] = new Date();
    if (status === '已赔付') {
      if (penalty_amount != null) order.penalty_amount = penalty_amount;
      if (penalty_note) order.penalty_note = penalty_note;
    }
    await order.save();
    await OrderLog.create({
      order_id: order.id,
      from_status: from,
      to_status: status,
      note: note || null,
      operator_id: req.user.id,
      is_customer_visible: !!is_customer_visible,
    });
    if (status === '已完成') {
      const { ensureDealFeedDraft } = await import('../services/deal-feed.js');
      await ensureDealFeedDraft(order.id);
    }
    ok(res, order);
  } catch (e) {
    next(e);
  }
});

router.post(
  '/orders/:id/attachments',
  ...staff,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const order = await Order.findByPk(req.params.id);
      if (!order) throw new AppError('订单不存在', 404);
      if (!req.file) throw new AppError('请上传文件');
      const att = await Attachment.create({
        related_type: 'order',
        related_id: order.id,
        file_name: req.file.originalname,
        file_path: publicUploadPath(req.file.filename),
        uploaded_by: req.user.id,
      });
      ok(res, att);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/quotes/:id/attachments',
  ...staff,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const quote = await Quote.findByPk(req.params.id);
      if (!quote) throw new AppError('报价不存在', 404);
      if (!req.file) throw new AppError('请上传文件');
      const att = await Attachment.create({
        related_type: 'quote',
        related_id: quote.id,
        file_name: req.file.originalname,
        file_path: publicUploadPath(req.file.filename),
        uploaded_by: req.user.id,
      });
      ok(res, att);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/attachments', ...staff, async (req, res, next) => {
  try {
    const { related_type, related_id } = req.query;
    if (!related_type || !related_id) throw new AppError('缺少关联参数');
    const list = await Attachment.findAll({
      where: { related_type, related_id },
      order: [['id', 'DESC']],
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

// —— Payments ——
router.get('/payments', ...staff, async (_req, res, next) => {
  try {
    const orders = await Order.findAll({
      include: [
        { model: Payment, as: 'payments' },
        { model: User, as: 'customer', attributes: ['id', 'name', 'company_name'] },
        { model: Supplier, as: 'supplier' },
      ],
      order: [['id', 'DESC']],
    });
    const rows = orders.map((o) => {
      const payments = o.payments || [];
      const received = payments
        .filter((p) => p.type === '客户付款' && p.status === '已确认')
        .reduce((s, p) => s + Number(p.amount), 0);
      const paid = payments
        .filter((p) => p.type === '供应商放款' && p.status === '已确认')
        .reduce((s, p) => s + Number(p.amount), 0);
      const penalty = payments
        .filter((p) => p.type === '赔付' && p.status === '已确认')
        .reduce((s, p) => s + Number(p.amount), 0);
      return {
        order_id: o.id,
        customer: o.customer,
        supplier: o.supplier,
        receivable: Number(o.price),
        payable: Number(o.price),
        received,
        paid,
        penalty,
        order_status: o.status,
        payments,
      };
    });
    ok(res, rows);
  } catch (e) {
    next(e);
  }
});

router.post('/payments', ...staff, async (req, res, next) => {
  try {
    const { order_id, type, amount, method, note } = req.body;
    if (!order_id || !type || amount == null) throw new AppError('请填写完整支付信息');
    if (!['客户付款', '供应商放款', '赔付'].includes(type)) {
      throw new AppError('支付类型无效');
    }
    const order = await Order.findByPk(order_id);
    if (!order) throw new AppError('订单不存在', 404);
    const payment = await Payment.create({
      order_id,
      type,
      amount,
      method: method || null,
      status: '已确认',
      confirmed_by: req.user.id,
      note: note || null,
    });
    if (type === '赔付') {
      order.penalty_amount = Number(order.penalty_amount || 0) + Number(amount);
      if (note) order.penalty_note = note;
      await order.save();
    }
    ok(res, payment);
  } catch (e) {
    next(e);
  }
});

// —— Announcements ——
router.get('/announcements', ...staff, async (_req, res, next) => {
  try {
    ok(res, await Announcement.findAll({ order: [['id', 'DESC']] }));
  } catch (e) {
    next(e);
  }
});

router.post('/announcements', ...staff, async (req, res, next) => {
  try {
    const {
      title,
      content,
      position,
      bg_color,
      text_color,
      is_active,
      start_time,
      end_time,
    } = req.body;
    if (!title) throw new AppError('标题必填');
    const row = await Announcement.create({
      title,
      content: content || null,
      position: position || 'top',
      bg_color: bg_color || '#1e293b',
      text_color: text_color || '#f8fafc',
      is_active: !!is_active,
      start_time: start_time || null,
      end_time: end_time || null,
      created_by: req.user.id,
    });
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

router.put('/announcements/:id', ...staff, async (req, res, next) => {
  try {
    const row = await Announcement.findByPk(req.params.id);
    if (!row) throw new AppError('通告不存在', 404);
    const fields = [
      'title',
      'content',
      'position',
      'bg_color',
      'text_color',
      'is_active',
      'start_time',
      'end_time',
    ];
    for (const f of fields) {
      if (req.body[f] !== undefined) row[f] = req.body[f];
    }
    await row.save();
    ok(res, row);
  } catch (e) {
    next(e);
  }
});

router.delete('/announcements/:id', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    const row = await Announcement.findByPk(req.params.id);
    if (!row) throw new AppError('通告不存在', 404);
    await row.destroy();
    ok(res, true);
  } catch (e) {
    next(e);
  }
});

// —— Deal feeds ——
router.get('/deal-feeds', ...staff, async (req, res, next) => {
  try {
    const { DealFeed } = await import('../models/index.js');
    const where = {};
    if (req.query.published === 'true') where.is_published = true;
    if (req.query.published === 'false') where.is_published = false;
    ok(res, await DealFeed.findAll({ where, order: [['id', 'DESC']] }));
  } catch (e) {
    next(e);
  }
});

router.post('/deal-feeds/:id/publish', ...staff, async (req, res, next) => {
  try {
    const { DealFeed } = await import('../models/index.js');
    const row = await DealFeed.findByPk(req.params.id);
    if (!row) throw new AppError('动态不存在', 404);
    if (req.body.region) row.region = String(req.body.region).slice(0, 50);
    if (req.body.deal_type) row.deal_type = String(req.body.deal_type).slice(0, 50);
    if (req.body.sku_name) row.sku_name = String(req.body.sku_name).slice(0, 100);
    row.is_published = true;
    row.published_by = req.user.id;
    row.published_at = new Date();
    await row.save();
    ok(res, row, '已发布到前台');
  } catch (e) {
    next(e);
  }
});

router.delete('/deal-feeds/:id', ...staff, async (req, res, next) => {
  try {
    const { DealFeed } = await import('../models/index.js');
    const row = await DealFeed.findByPk(req.params.id);
    if (!row) throw new AppError('动态不存在', 404);
    await row.destroy();
    ok(res, true);
  } catch (e) {
    next(e);
  }
});

router.post('/jobs/expire-quotes', ...staff, requireRoles('admin'), async (_req, res, next) => {
  try {
    const { expirePendingQuotes } = await import('../services/deal-feed.js');
    const n = await expirePendingQuotes();
    ok(res, { expired: n });
  } catch (e) {
    next(e);
  }
});

export default router;

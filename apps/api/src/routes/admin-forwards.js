import { Router } from 'express';
import { User } from '../models/index.js';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { ok } from '../utils/errors.js';
import { todayShanghai } from '../utils/market.js';
import {
  listIndicesWithLatest,
  createIndex,
  updateIndex,
  listPrints,
  generatePrintFromMid,
  upsertManualPrint,
  publishPrint,
  unpublishPrint,
} from '../services/index-price.js';
import {
  listForwardsAdmin,
  presentForward,
  createForward,
  settleBatch,
  expirePendingConfirms,
  proxyConfirm,
  cancelForward,
  listBillsAdmin,
  confirmBillPay,
} from '../services/forward-settle.js';
import {
  listChannels,
  createChannel,
  updateChannel,
  listWhitelists,
  upsertWhitelist,
  listDeliveryOrders,
  approveDelivery,
  rejectDelivery,
  completeDelivery,
  startDelivery,
  reconcileDelivery,
  defaultDelivery,
  disputeDelivery,
} from '../services/delivery.js';

const router = Router();
const staff = [authRequired, requireRoles('broker', 'admin')];

// —— Price indices ——
router.get('/indices', ...staff, async (_req, res, next) => {
  try {
    ok(res, await listIndicesWithLatest({ activeOnly: false }));
  } catch (e) {
    next(e);
  }
});

router.post('/indices', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    ok(res, await createIndex(req.body));
  } catch (e) {
    next(e);
  }
});

router.put('/indices/:id', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    ok(res, await updateIndex(req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.get('/indices/:id/prints', ...staff, async (req, res, next) => {
  try {
    ok(res, await listPrints(req.params.id, { from: req.query.from, to: req.query.to }));
  } catch (e) {
    next(e);
  }
});

router.post('/indices/:id/prints', ...staff, async (req, res, next) => {
  try {
    const date = req.body.date || todayShanghai();
    let print;
    if (req.body.settle_price != null) {
      print = await upsertManualPrint(req.params.id, date, req.body.settle_price);
    } else {
      print = await generatePrintFromMid(req.params.id, date);
    }
    ok(res, print);
  } catch (e) {
    next(e);
  }
});

router.post('/indices/:id/prints/:date/publish', ...staff, async (req, res, next) => {
  try {
    ok(res, await publishPrint(req.params.id, req.params.date), '已发布');
  } catch (e) {
    next(e);
  }
});

router.post('/indices/:id/prints/:date/unpublish', ...staff, async (req, res, next) => {
  try {
    ok(res, await unpublishPrint(req.params.id, req.params.date), '已撤销发布');
  } catch (e) {
    next(e);
  }
});

// —— Forwards ——
router.get('/forwards', ...staff, async (req, res, next) => {
  try {
    const rows = await listForwardsAdmin(req.query);
    ok(res, await Promise.all(rows.map((r) => presentForward(r))));
  } catch (e) {
    next(e);
  }
});

router.post('/forwards', ...staff, async (req, res, next) => {
  try {
    ok(res, await createForward(req.body, req.user.id), '已开仓，待双方确认');
  } catch (e) {
    next(e);
  }
});

router.post('/forwards/settle-batch', ...staff, async (req, res, next) => {
  try {
    ok(res, await settleBatch({ asOf: req.body?.asOf }));
  } catch (e) {
    next(e);
  }
});

router.post('/forwards/expire-confirms', ...staff, async (req, res, next) => {
  try {
    const asOf = req.body?.asOf ? new Date(req.body.asOf) : new Date();
    ok(res, { cancelled: await expirePendingConfirms(asOf) });
  } catch (e) {
    next(e);
  }
});

router.post('/forwards/:id/proxy-confirm', ...staff, async (req, res, next) => {
  try {
    ok(res, await proxyConfirm(req.params.id, req.body, req.user.id), '代理确认已记录');
  } catch (e) {
    next(e);
  }
});

router.post('/forwards/:id/cancel', ...staff, async (req, res, next) => {
  try {
    ok(res, await cancelForward(req.params.id, req.body?.reason));
  } catch (e) {
    next(e);
  }
});

router.get('/settlement-bills', ...staff, async (_req, res, next) => {
  try {
    ok(res, await listBillsAdmin());
  } catch (e) {
    next(e);
  }
});

router.post('/settlement-bills/:id/confirm-pay', ...staff, async (req, res, next) => {
  try {
    ok(res, await confirmBillPay(req.params.id, req.user.id), '已确认收付');
  } catch (e) {
    next(e);
  }
});

router.get('/customers', ...staff, async (_req, res, next) => {
  try {
    const list = await User.findAll({
      where: { role: 'customer' },
      attributes: ['id', 'name', 'phone', 'email', 'company_name', 'role'],
      order: [['id', 'ASC']],
      limit: 500,
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

// —— Delivery ——
router.get('/delivery-channels', ...staff, async (_req, res, next) => {
  try {
    ok(res, await listChannels());
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-channels', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    ok(res, await createChannel(req.body));
  } catch (e) {
    next(e);
  }
});

router.put('/delivery-channels/:id', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    ok(res, await updateChannel(req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.get('/delivery-whitelists', ...staff, async (_req, res, next) => {
  try {
    ok(res, await listWhitelists());
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-whitelists', ...staff, async (req, res, next) => {
  try {
    ok(res, await upsertWhitelist(req.body, req.user.id), '白名单已更新');
  } catch (e) {
    next(e);
  }
});

router.get('/delivery-orders', ...staff, async (req, res, next) => {
  try {
    ok(res, await listDeliveryOrders(req.query));
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-orders/:id/approve', ...staff, async (req, res, next) => {
  try {
    ok(res, await approveDelivery(req.params.id, req.user.id), '已批准');
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-orders/:id/reject', ...staff, async (req, res, next) => {
  try {
    ok(res, await rejectDelivery(req.params.id, req.user.id, req.body?.reason), '已驳回');
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-orders/:id/complete', ...staff, async (req, res, next) => {
  try {
    ok(res, await completeDelivery(req.params.id, req.user.id), '交割完成');
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-orders/:id/start', ...staff, async (req, res, next) => {
  try {
    ok(res, await startDelivery(Number(req.params.id), req.user.id), '已进入交割中');
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-orders/:id/reconcile', ...staff, async (req, res, next) => {
  try {
    ok(res, await reconcileDelivery(Number(req.params.id), req.user.id, req.body), '已对账');
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-orders/:id/default', ...staff, requireRoles('admin'), async (req, res, next) => {
  try {
    ok(res, await defaultDelivery(Number(req.params.id), req.user.id, req.body), '已违约处理');
  } catch (e) {
    next(e);
  }
});

router.post('/delivery-orders/:id/dispute', ...staff, async (req, res, next) => {
  try {
    ok(res, await disputeDelivery(Number(req.params.id), req.user.id, req.body), '已标记争议');
  } catch (e) {
    next(e);
  }
});

export default router;

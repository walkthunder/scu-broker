import { Router } from 'express';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { ok } from '../utils/errors.js';
import {
  listIndicesWithLatest,
  listPublishedPrints,
} from '../services/index-price.js';
import {
  listForwardsForUser,
  confirmForward,
  listBillsForUser,
} from '../services/forward-settle.js';
import {
  listChannels,
  isUserWhitelisted,
  requestDelivery,
} from '../services/delivery.js';

const router = Router();
const portalAuth = [authRequired, requireRoles('customer', 'broker', 'admin')];

router.get('/indices', async (_req, res, next) => {
  try {
    ok(res, await listIndicesWithLatest({ activeOnly: true }));
  } catch (e) {
    next(e);
  }
});

router.get('/indices/:id/prints', async (req, res, next) => {
  try {
    ok(
      res,
      await listPublishedPrints(req.params.id, { from: req.query.from, to: req.query.to }),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/forwards', ...portalAuth, async (req, res, next) => {
  try {
    ok(res, await listForwardsForUser(req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/forwards/:id/confirm', ...portalAuth, async (req, res, next) => {
  try {
    ok(res, await confirmForward(req.params.id, req.user.id), '已确认');
  } catch (e) {
    next(e);
  }
});

router.get('/settlement-bills', ...portalAuth, async (req, res, next) => {
  try {
    ok(res, await listBillsForUser(req.user.id));
  } catch (e) {
    next(e);
  }
});

router.get('/delivery-channels', ...portalAuth, async (_req, res, next) => {
  try {
    ok(res, await listChannels({ activeOnly: true }));
  } catch (e) {
    next(e);
  }
});

router.get('/delivery-whitelist/me', ...portalAuth, async (req, res, next) => {
  try {
    ok(res, { whitelisted: await isUserWhitelisted(req.user.id) });
  } catch (e) {
    next(e);
  }
});

router.post('/forwards/:id/delivery-request', ...portalAuth, async (req, res, next) => {
  try {
    const row = await requestDelivery(req.params.id, req.user.id, req.body);
    ok(res, row, '交割申请已提交');
  } catch (e) {
    next(e);
  }
});

export default router;

#!/usr/bin/env node
/**
 * V4 沙盘：演示 1.5X 涨价与 0.7X 跌价现金结算（需 API 已启动且已 seed）
 *
 *   node scripts/sandbox-forward.js
 */
import { todayShanghai, addDaysShanghai } from '../src/utils/market.js';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 0) {
    throw new Error(`${method} ${path}: ${json.message || res.status}`);
  }
  return json.data;
}

async function customerLogin(email, password = 'Pass1234!') {
  return api('/customer/login', {
    method: 'POST',
    body: { email, password },
  });
}

async function ensurePublished(token, indexId, settlePrice, preferredDate) {
  for (let i = 0; i < 40; i++) {
    const date = addDaysShanghai(preferredDate, -i);
    try {
      // 已发布未入账则可先撤销再覆写；已用于结算则换日
      try {
        await api(`/admin/indices/${indexId}/prints/${date}/unpublish`, {
          method: 'POST',
          token,
        });
      } catch {
        /* 无发布或已锁定：继续尝试写入 */
      }
      await api(`/admin/indices/${indexId}/prints`, {
        method: 'POST',
        token,
        body: { date, settle_price: settlePrice },
      });
      await api(`/admin/indices/${indexId}/prints/${date}/publish`, {
        method: 'POST',
        token,
      });
      return date;
    } catch (e) {
      const msg = String(e.message || '');
      if (
        msg.includes('已用于结算') ||
        msg.includes('PRINT_LOCKED') ||
        msg.includes('请先撤销') ||
        msg.includes('禁止改价')
      ) {
        continue;
      }
      throw e;
    }
  }
  throw new Error('无法找到可写入的结算价日期');
}

async function runStory({ label, X, S, qty, expiryOffset }) {
  console.log(`\n=== ${label} ===`);
  const admin = await api('/admin/login', {
    method: 'POST',
    body: { phone: '13800000000', password: 'admin123' },
  });
  const buyer = await customerLogin('buyer@comprix.local');
  const seller = await customerLogin('seller@comprix.local');
  const indices = await api('/admin/indices', { token: admin.token });
  const idx = indices.find((x) => x.code === 'H100-M') || indices[0];
  const preferred = addDaysShanghai(todayShanghai(), expiryOffset);
  const expiry = await ensurePublished(admin.token, idx.id, S, preferred);

  const contract = await api('/admin/forwards', {
    method: 'POST',
    token: admin.token,
    body: {
      index_id: idx.id,
      buyer_id: buyer.user.id,
      seller_id: seller.user.id,
      qty,
      strike_price: X,
      expiry_date: expiry,
    },
  });
  await api(`/customer/forwards/${contract.id}/confirm`, {
    method: 'POST',
    token: buyer.token,
  });
  await api(`/customer/forwards/${contract.id}/confirm`, {
    method: 'POST',
    token: seller.token,
  });
  const results = await api('/admin/forwards/settle-batch', {
    method: 'POST',
    token: admin.token,
    body: { asOf: todayShanghai() },
  });
  const hit = results.find((r) => r.contract_id === contract.id);
  console.log({ X, S, qty, expiry, result: hit });
}

async function main() {
  await runStory({
    label: '涨价 S=1.5X',
    X: 100,
    S: 150,
    qty: 2,
    expiryOffset: -60,
  });
  await runStory({
    label: '跌价 S=0.7X',
    X: 100,
    S: 70,
    qty: 1,
    expiryOffset: -80,
  });
  console.log('\nSandbox done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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

async function customerLogin(phone) {
  await api('/customer/otp', { method: 'POST', body: { phone } });
  return api('/customer/login', {
    method: 'POST',
    body: { phone, code: process.env.DEV_OTP || '123456' },
  });
}

async function runStory({ label, X, S, qty, expiryOffset }) {
  console.log(`\n=== ${label} ===`);
  const admin = await api('/admin/login', {
    method: 'POST',
    body: { phone: '13800000000', password: 'admin123' },
  });
  const buyer = await customerLogin('13900001001');
  const seller = await customerLogin('13900001002');
  const indices = await api('/admin/indices', { token: admin.token });
  const idx = indices.find((x) => x.code === 'H100-M') || indices[0];
  const expiry = addDaysShanghai(todayShanghai(), expiryOffset);
  await api(`/admin/indices/${idx.id}/prints`, {
    method: 'POST',
    token: admin.token,
    body: { date: expiry, settle_price: S },
  });
  await api(`/admin/indices/${idx.id}/prints/${expiry}/publish`, {
    method: 'POST',
    token: admin.token,
  });

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
  console.log({ X, S, qty, result: hit });
}

async function main() {
  await runStory({
    label: '涨价 S=1.5X',
    X: 100,
    S: 150,
    qty: 2,
    expiryOffset: 0,
  });
  await runStory({
    label: '跌价 S=0.7X',
    X: 100,
    S: 70,
    qty: 1,
    expiryOffset: -1,
  });
  console.log('\nSandbox done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

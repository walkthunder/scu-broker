const BASE = 'http://127.0.0.1:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {}),
    },
    body:
      opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { message: text };
  }
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK:', msg);
}

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    console.error(e.message);
    results.push({ name, ok: false, err: e.message });
  }
}

await test('health', async () => {
  const r = await req('/health');
  assert(r.json.code === 0, 'health ok');
});

await test('customer otp+login new phone', async () => {
  const phone = '13988887777';
  const otp = await req('/customer/otp', { method: 'POST', body: { phone } });
  assert(otp.json.code === 0, 'otp sent');
  const code = otp.json.data.dev_otp || '123456';
  const login = await req('/customer/login', {
    method: 'POST',
    body: { phone, code, name: '客户甲', company_name: '甲公司' },
  });
  assert(login.json.code === 0, 'customer login');
  assert(login.json.data.token, 'has token');
  globalThis.ctoken = login.json.data.token;
  globalThis.cphone = phone;
});

await test('broker phone can customer-login', async () => {
  const phone = '13800000002';
  const otp = await req('/customer/otp', { method: 'POST', body: { phone } });
  const code = otp.json.data.dev_otp || '123456';
  const login = await req('/customer/login', {
    method: 'POST',
    body: { phone, code, name: 'Broker客测', company_name: '测试' },
  });
  assert(login.status === 200 && login.json.code === 0, 'broker phone allowed on customer portal');
  assert(login.json.data.user.role === 'broker', 'keeps broker role');
  globalThis.brokerCustomerToken = login.json.data.token;
});

await test('reference prices + skus', async () => {
  const prices = await req('/customer/reference-prices');
  assert(prices.json.code === 0 && prices.json.data.length > 0, 'prices');
  const skus = await req('/customer/skus');
  assert(skus.json.code === 0 && skus.json.data.length > 0, 'skus');
  globalThis.skuId = skus.json.data[0].id;
});

await test('broker can submit rfq via portal', async () => {
  const rfq = await req('/customer/rfqs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.brokerCustomerToken}` },
    body: { sku_id: globalThis.skuId, quantity: 1, duration: '自测' },
  });
  assert(rfq.json.code === 0, 'broker can submit rfq via customer portal');
});

await test('rfq create list detail', async () => {
  const create = await req('/customer/rfqs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
    body: {
      sku_id: globalThis.skuId,
      quantity: 4,
      duration: '30天',
      delivery_date: '2026-08-20',
      budget_range: '5-8万',
      note: '完整测试',
    },
  });
  assert(create.json.code === 0, 'create rfq');
  globalThis.rfqId = create.json.data.id;
  const list = await req('/customer/rfqs', {
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(list.json.data.some((r) => r.id === globalThis.rfqId), 'list contains rfq');
  const detail = await req(`/customer/rfqs/${globalThis.rfqId}`, {
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(detail.json.data.status === 'pending', 'rfq pending');
});

const admin = await req('/admin/login', {
  method: 'POST',
  body: { phone: '13800000000', password: 'admin123' },
});
assert(admin.json.code === 0, 'admin login');
globalThis.atoken = admin.json.data.token;

await test('admin assign + quote draft + send', async () => {
  const brokers = await req('/admin/brokers', {
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  assert(brokers.json.data.length > 0, 'brokers list');
  const brokerId = brokers.json.data.find((b) => b.role === 'broker')?.id || brokers.json.data[0].id;
  const assign = await req(`/admin/rfqs/${globalThis.rfqId}/assign`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
    body: { broker_id: brokerId },
  });
  assert(assign.json.code === 0, 'assign broker');

  const suppliers = await req('/admin/suppliers', {
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  const sid = suppliers.json.data[0].id;

  const quote = await req('/admin/quotes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
    body: {
      rfq_id: globalThis.rfqId,
      supplier_id: sid,
      price: 68000,
      delivery_date: '2026-08-22',
      note: '谈妥',
    },
  });
  assert(quote.json.code === 0, 'create quote');
  assert(quote.json.data.status === 'draft', 'quote draft');
  globalThis.quoteId = quote.json.data.id;

  // customer should NOT see confirm before send
  const before = await req(`/customer/rfqs/${globalThis.rfqId}`, {
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  const qBefore = before.json.data.quote;
  console.log('quote status before send:', qBefore?.status);

  const send = await req(`/admin/quotes/${globalThis.quoteId}/send`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  assert(send.json.code === 0, 'send quote');
  assert(send.json.data.status === 'pending', 'quote pending after send');
});

await test('draft quote hidden from customer', async () => {
  const create = await req('/customer/rfqs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
    body: { sku_id: globalThis.skuId, quantity: 3 },
  });
  const rfqId = create.json.data.id;
  const suppliers = await req('/admin/suppliers', {
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  await req('/admin/quotes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
    body: { rfq_id: rfqId, supplier_id: suppliers.json.data[0].id, price: 555 },
  });
  const detail = await req(`/customer/rfqs/${rfqId}`, {
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(detail.json.data.quote == null, 'draft quote not visible');
  assert(detail.json.data.status === 'pending', 'rfq still pending');
});

await test('customer confirm quote -> order', async () => {
  const detail = await req(`/customer/rfqs/${globalThis.rfqId}`, {
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(detail.json.data.status === 'quoted', 'rfq quoted');
  assert(detail.json.data.quote?.status === 'pending', 'quote pending for customer');

  const confirm = await req(`/customer/quotes/${globalThis.quoteId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(confirm.json.code === 0, 'confirm');
  assert(confirm.json.data.order?.id, 'order created');
  globalThis.orderId = confirm.json.data.order.id;
  assert(confirm.json.data.order.status === '待签约', 'order 待签约');
});

await test('order status machine', async () => {
  for (const st of ['待交付', '待验收', '待结算', '已完成']) {
    const r = await req(`/admin/orders/${globalThis.orderId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${globalThis.atoken}` },
      body: { status: st, note: `to ${st}` },
    });
    assert(r.json.code === 0 && r.json.data.status === st, `status -> ${st}`);
  }
  // illegal skip
  const bad = await req(`/admin/orders/${globalThis.orderId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
    body: { status: '待签约' },
  });
  assert(bad.json.code !== 0, 'illegal transition rejected');
});

await test('customer orders', async () => {
  const list = await req('/customer/orders', {
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(list.json.data.some((o) => o.id === globalThis.orderId), 'order in list');
  const d = await req(`/customer/orders/${globalThis.orderId}`, {
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(d.json.data.status === '已完成', 'order detail');
  assert(d.json.data.supplier_display, 'supplier masked');
});

await test('payments + dashboard', async () => {
  const pay = await req('/admin/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
    body: {
      order_id: globalThis.orderId,
      type: '客户付款',
      amount: 68000,
      method: '对公',
    },
  });
  assert(pay.json.code === 0, 'payment');
  const rows = await req('/admin/payments', {
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  const row = rows.json.data.find((r) => r.order_id === globalThis.orderId);
  assert(row?.received === 68000, 'received recorded');
  const dash = await req('/admin/dashboard', {
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  assert(dash.json.data.today_rfqs >= 1, 'dashboard');
});

await test('reject quote path', async () => {
  // new rfq then quote then reject
  const create = await req('/customer/rfqs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
    body: { sku_id: globalThis.skuId, quantity: 1, duration: '1周' },
  });
  const rfqId = create.json.data.id;
  const suppliers = await req('/admin/suppliers', {
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  const quote = await req('/admin/quotes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
    body: { rfq_id: rfqId, supplier_id: suppliers.json.data[0].id, price: 1000 },
  });
  await req(`/admin/quotes/${quote.json.data.id}/send`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  const rej = await req(`/customer/quotes/${quote.json.data.id}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(rej.json.code === 0, 'reject quote');
  const detail = await req(`/customer/rfqs/${rfqId}`, {
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(detail.json.data.status === 'rejected', 'rfq rejected');
});

await test('confirm draft quote should fail', async () => {
  const create = await req('/customer/rfqs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
    body: { sku_id: globalThis.skuId, quantity: 2 },
  });
  const suppliers = await req('/admin/suppliers', {
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
  });
  const quote = await req('/admin/quotes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.atoken}` },
    body: { rfq_id: create.json.data.id, supplier_id: suppliers.json.data[0].id, price: 999 },
  });
  const confirm = await req(`/customer/quotes/${quote.json.data.id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalThis.ctoken}` },
  });
  assert(confirm.json.code !== 0, 'cannot confirm draft');
});

await test('unauth customer rfqs', async () => {
  const r = await req('/customer/rfqs');
  assert(r.status === 401, '401 without token');
});

console.log('\n=== SUMMARY ===');
for (const r of results) {
  console.log(r.ok ? 'PASS' : 'FAIL', r.name, r.err || r.observed || '');
}
const failed = results.filter((r) => !r.ok && !r.observed);
process.exit(failed.length ? 1 : 0);

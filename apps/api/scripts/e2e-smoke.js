const BASE = 'http://127.0.0.1:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.code !== 0) throw new Error(`${path}: ${json.message || res.status}`);
  return json;
}

const otp = await req('/customer/otp', { method: 'POST', body: { phone: '13911112222' } });
const code = otp.data.dev_otp || '123456';
const login = await req('/customer/login', {
  method: 'POST',
  body: { phone: '13911112222', code, name: '测试客户', company_name: '测试公司' },
});
const ctoken = login.data.token;

const rfq = await req('/customer/rfqs', {
  method: 'POST',
  headers: { Authorization: `Bearer ${ctoken}` },
  body: { sku_id: 1, quantity: 8, duration: '1个月', delivery_date: '2026-08-01', note: 'e2e' },
});
console.log('rfq', rfq.data.id);

const admin = await req('/admin/login', {
  method: 'POST',
  body: { phone: '13800000000', password: 'admin123' },
});
const atoken = admin.data.token;

const quote = await req('/admin/quotes', {
  method: 'POST',
  headers: { Authorization: `Bearer ${atoken}` },
  body: { rfq_id: rfq.data.id, supplier_id: 1, price: 120000, delivery_date: '2026-08-05' },
});
await req(`/admin/quotes/${quote.data.id}/send`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${atoken}` },
});

const confirm = await req(`/customer/quotes/${quote.data.id}/confirm`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ctoken}` },
});
const oid = confirm.data.order.id;
console.log('order', oid);

await req(`/admin/orders/${oid}/status`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${atoken}` },
  body: { status: '待交付', note: '合同已签' },
});
await req('/admin/payments', {
  method: 'POST',
  headers: { Authorization: `Bearer ${atoken}` },
  body: { order_id: oid, type: '客户付款', amount: 120000, method: '对公' },
});
const dash = await req('/admin/dashboard', {
  headers: { Authorization: `Bearer ${atoken}` },
});
console.log('dashboard', dash.data);
console.log('E2E_OK');

import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertEq } from '../lib/assert.js';
import { customerLogin, adminLogin, auth } from '../lib/auth.js';

async function orderReady() {
  const { token: ctoken } = await customerLogin(`131${String(Date.now()).slice(-8)}`, {
    company_name: '财务公司',
  });
  const skus = await req('/customer/skus');
  const rfq = await req('/customer/rfqs', {
    method: 'POST',
    headers: auth(ctoken),
    body: { sku_id: skus.json.data[0].id, quantity: 1 },
  });
  const { token: atoken } = await adminLogin();
  const suppliers = await req('/admin/suppliers', { headers: auth(atoken) });
  const quote = await req('/admin/quotes', {
    method: 'POST',
    headers: auth(atoken),
    body: { rfq_id: rfq.json.data.id, supplier_id: suppliers.json.data[0].id, price: 55555 },
  });
  await req(`/admin/quotes/${quote.json.data.id}/send`, {
    method: 'PUT',
    headers: auth(atoken),
  });
  const confirm = await req(`/customer/quotes/${quote.json.data.id}/confirm`, {
    method: 'POST',
    headers: auth(ctoken),
  });
  return { atoken, orderId: confirm.json.data.order.id, price: 55555 };
}

describe('财务', ({ it }) => {
  it('财务列表默认应收=应付=成交价', ['R-P1-6', 'R-GAP-FINANCE', 'R-ACCEPT-4'], async () => {
    const ctx = await orderReady();
    const rows = await req('/admin/payments', { headers: auth(ctx.atoken) });
    assertOk(rows);
    const row = rows.json.data.find((r) => r.order_id === ctx.orderId);
    assert(row, 'row exists');
    assertEq(Number(row.receivable), ctx.price);
    assertEq(Number(row.payable), ctx.price);
    assertEq(Number(row.received), 0);
    assertEq(Number(row.paid), 0);
  });

  it('可标记客户付款 / 供应商放款 / 赔付', ['R-P1-6', 'R-ACCEPT-4'], async () => {
    const ctx = await orderReady();
    const payIn = await req('/admin/payments', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { order_id: ctx.orderId, type: '客户付款', amount: ctx.price, method: '对公' },
    });
    assertOk(payIn);

    const payOut = await req('/admin/payments', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { order_id: ctx.orderId, type: '供应商放款', amount: ctx.price, method: '对公' },
    });
    assertOk(payOut);

    const penalty = await req('/admin/payments', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { order_id: ctx.orderId, type: '赔付', amount: 1000, method: '对公', note: '延迟' },
    });
    assertOk(penalty);

    const rows = await req('/admin/payments', { headers: auth(ctx.atoken) });
    const row = rows.json.data.find((r) => r.order_id === ctx.orderId);
    assertEq(Number(row.received), ctx.price);
    assertEq(Number(row.paid), ctx.price);
    assertEq(Number(row.penalty), 1000);
  });
});

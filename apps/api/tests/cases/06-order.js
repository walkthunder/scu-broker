import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail, assertEq } from '../lib/assert.js';
import { customerLogin, ensureCustomer, adminLogin, auth } from '../lib/auth.js';

async function confirmedOrder() {
  const email = `u${Date.now()}@test.local`;
  const { token: ctoken } = await ensureCustomer(email, 'Pass1234!', { company_name: '订单公司' });
  const skus = await req('/customer/skus');
  const rfq = await req('/customer/rfqs', {
    method: 'POST',
    headers: auth(ctoken),
    body: { sku_id: skus.json.data[0].id, quantity: 2 },
  });
  const { token: atoken } = await adminLogin();
  const suppliers = await req('/admin/suppliers', { headers: auth(atoken) });
  const quote = await req('/admin/quotes', {
    method: 'POST',
    headers: auth(atoken),
    body: { rfq_id: rfq.json.data.id, supplier_id: suppliers.json.data[0].id, price: 7777 },
  });
  await req(`/admin/quotes/${quote.json.data.id}/send`, {
    method: 'PUT',
    headers: auth(atoken),
  });
  const confirm = await req(`/customer/quotes/${quote.json.data.id}/confirm`, {
    method: 'POST',
    headers: auth(ctoken),
  });
  assertOk(confirm);
  return { ctoken, atoken, orderId: confirm.json.data.order.id, price: 7777 };
}

describe('订单状态机', ({ it }) => {
  it('确认后有初始日志 待签约', ['R-P0-5', 'R-ACCEPT-3'], async () => {
    const ctx = await confirmedOrder();
    const list = await req('/admin/orders', { headers: auth(ctx.atoken) });
    assertOk(list);
    const order = list.json.data.find((o) => o.id === ctx.orderId);
    assert(order, 'order found');
    assertEq(order.status, '待签约');
    assert(Array.isArray(order.logs) && order.logs.length >= 1, 'has initial log');
    assert(
      order.logs.some((l) => l.to_status === '待签约'),
      'log to 待签约',
    );
  });

  it('主路径五态推进 + 每步写日志', ['R-P0-5', 'R-ACCEPT-3'], async () => {
    const ctx = await confirmedOrder();
    const flow = ['待交付', '待验收', '待结算', '已完成'];
    for (const st of flow) {
      const r = await req(`/admin/orders/${ctx.orderId}/status`, {
        method: 'PUT',
        headers: auth(ctx.atoken),
        body: { status: st, note: `推进到${st}` },
      });
      assertOk(r);
      assertEq(r.json.data.status, st);
    }
    const list = await req('/admin/orders', { headers: auth(ctx.atoken) });
    const order = list.json.data.find((o) => o.id === ctx.orderId);
    assert(order.logs.length >= 5, `logs >=5 got ${order.logs.length}`);
  });

  it('禁止跳跃 / 回退主路径', ['R-P0-5'], async () => {
    const ctx = await confirmedOrder();
    const skip = await req(`/admin/orders/${ctx.orderId}/status`, {
      method: 'PUT',
      headers: auth(ctx.atoken),
      body: { status: '待验收' },
    });
    assertFail(skip);

    await req(`/admin/orders/${ctx.orderId}/status`, {
      method: 'PUT',
      headers: auth(ctx.atoken),
      body: { status: '待交付' },
    });
    const back = await req(`/admin/orders/${ctx.orderId}/status`, {
      method: 'PUT',
      headers: auth(ctx.atoken),
      body: { status: '待签约' },
    });
    assertFail(back);
  });

  it('可取消订单', ['R-P0-5'], async () => {
    const ctx = await confirmedOrder();
    const r = await req(`/admin/orders/${ctx.orderId}/status`, {
      method: 'PUT',
      headers: auth(ctx.atoken),
      body: { status: '已取消', note: '客户不做了' },
    });
    assertOk(r);
    assertEq(r.json.data.status, '已取消');
  });

  it('客户可读自己订单且供应商脱敏', ['R-P0-5', 'R-GAP-MASK', 'R-ACCEPT-3'], async () => {
    const ctx = await confirmedOrder();
    const list = await req('/customer/orders', { headers: auth(ctx.ctoken) });
    assertOk(list);
    assert(list.json.data.some((o) => o.id === ctx.orderId), 'in list');
    const detail = await req(`/customer/orders/${ctx.orderId}`, { headers: auth(ctx.ctoken) });
    assertOk(detail);
    assert(!!detail.json.data.supplier_display, 'masked');
    assert(!detail.json.data.supplier?.name, 'no real name');
  });
});

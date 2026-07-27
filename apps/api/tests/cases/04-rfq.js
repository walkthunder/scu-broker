import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail, assertEq } from '../lib/assert.js';
import { customerLogin, adminLogin, auth } from '../lib/auth.js';

async function pickSku() {
  const skus = await req('/customer/skus');
  assertOk(skus);
  return skus.json.data[0].id;
}

describe('询价 RFQ', ({ it }) => {
  it('未登录不可提交/查看询价', ['R-P0-3', 'R-GAP-MINE'], async () => {
    const create = await req('/customer/rfqs', {
      method: 'POST',
      body: { sku_id: 1, quantity: 1 },
    });
    assert(create.status === 401 || create.json?.code !== 0, 'create auth');
    const list = await req('/customer/rfqs');
    assert(list.status === 401 || list.json?.code !== 0, 'list auth');
  });

  it('客户提交询价 → pending', ['R-P0-3', 'R-ACCEPT-1'], async () => {
    const phone = `136${String(Date.now()).slice(-8)}`;
    const { token } = await customerLogin(phone, { name: '询价客', company_name: '询价公司' });
    const skuId = await pickSku();
    const created = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(token),
      body: {
        sku_id: skuId,
        quantity: 8,
        duration: '1个月',
        delivery_date: '2026-09-01',
        budget_range: '10万',
        note: '功能测试询价',
        name: '询价客',
        company_name: '询价公司',
      },
    });
    assertOk(created);
    assertEq(created.json.data.status, 'pending');

    const list = await req('/customer/rfqs', { headers: auth(token) });
    assertOk(list);
    assert(list.json.data.some((r) => r.id === created.json.data.id), 'in my list');
  });

  it('客户只能看自己的询价', ['R-GAP-MINE'], async () => {
    const a = await customerLogin(`136${String(Date.now()).slice(-8)}`);
    const b = await customerLogin(`135${String(Date.now()).slice(-8)}`);
    const skuId = await pickSku();
    const created = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(a.token),
      body: { sku_id: skuId, quantity: 2 },
    });
    assertOk(created);
    const peek = await req(`/customer/rfqs/${created.json.data.id}`, {
      headers: auth(b.token),
    });
    assertFail(peek);
    assert(peek.status === 404 || peek.json?.code !== 0, 'isolation');
  });

  it('后台可列表筛选与分配 Broker', ['R-P0-3', 'R-ACCEPT-2'], async () => {
    const { token: ctoken } = await customerLogin(`134${String(Date.now()).slice(-8)}`, {
      company_name: '待分配公司',
    });
    const skuId = await pickSku();
    const created = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(ctoken),
      body: { sku_id: skuId, quantity: 4, note: '待分配' },
    });
    assertOk(created);
    const rfqId = created.json.data.id;

    const { token: atoken } = await adminLogin();
    const pending = await req('/admin/rfqs?status=pending', { headers: auth(atoken) });
    assertOk(pending);
    assert(pending.json.data.some((r) => r.id === rfqId), 'in pending');

    const brokers = await req('/admin/brokers', { headers: auth(atoken) });
    assertOk(brokers);
    const broker = brokers.json.data.find((b) => b.role === 'broker') || brokers.json.data[0];

    const assigned = await req(`/admin/rfqs/${rfqId}/assign`, {
      method: 'PUT',
      headers: auth(atoken),
      body: { broker_id: broker.id },
    });
    assertOk(assigned);
    assertEq(assigned.json.data.broker_id, broker.id);
  });
});

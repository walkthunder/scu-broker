import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail, assertEq } from '../lib/assert.js';
import { customerLogin, adminLogin, auth } from '../lib/auth.js';

async function prepareRfq() {
  const phone = `133${String(Date.now()).slice(-8)}`;
  const { token: ctoken, user } = await customerLogin(phone, {
    name: '报价客户',
    company_name: '报价公司',
  });
  const skus = await req('/customer/skus');
  const skuId = skus.json.data[0].id;
  const rfq = await req('/customer/rfqs', {
    method: 'POST',
    headers: auth(ctoken),
    body: { sku_id: skuId, quantity: 5, duration: '2周' },
  });
  assertOk(rfq);
  const { token: atoken } = await adminLogin();
  const suppliers = await req('/admin/suppliers', { headers: auth(atoken) });
  assertOk(suppliers);
  return {
    ctoken,
    atoken,
    customer: user,
    rfqId: rfq.json.data.id,
    supplierId: suppliers.json.data[0].id,
  };
}

describe('报价 Quote', ({ it }) => {
  it('录入草稿对客户不可见', ['R-P0-4', 'R-GAP-DRAFT'], async () => {
    const ctx = await prepareRfq();
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: {
        rfq_id: ctx.rfqId,
        supplier_id: ctx.supplierId,
        price: 50000,
        delivery_date: '2026-09-10',
        note: '草稿',
      },
    });
    assertOk(draft);
    assertEq(draft.json.data.status, 'draft');

    const detail = await req(`/customer/rfqs/${ctx.rfqId}`, { headers: auth(ctx.ctoken) });
    assertOk(detail);
    assert(detail.json.data.quote == null, 'draft hidden');
    assertEq(detail.json.data.status, 'pending');
  });

  it('发送后客户可见且可确认 → 生成订单', ['R-P0-4', 'R-ACCEPT-2', 'R-ACCEPT-3'], async () => {
    const ctx = await prepareRfq();
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: ctx.rfqId, supplier_id: ctx.supplierId, price: 88000 },
    });
    assertOk(draft);
    const sent = await req(`/admin/quotes/${draft.json.data.id}/send`, {
      method: 'PUT',
      headers: auth(ctx.atoken),
    });
    assertOk(sent);
    assertEq(sent.json.data.status, 'pending');
    assert(!!sent.json.data.expiry_time, 'has expiry');

    const detail = await req(`/customer/rfqs/${ctx.rfqId}`, { headers: auth(ctx.ctoken) });
    assertOk(detail);
    assertEq(detail.json.data.status, 'quoted');
    assertEq(detail.json.data.quote.status, 'pending');
    assert(!!detail.json.data.quote.supplier_display, 'masked supplier');
    assert(!detail.json.data.quote.supplier?.name, 'no real supplier name');

    const confirm = await req(`/customer/quotes/${draft.json.data.id}/confirm`, {
      method: 'POST',
      headers: auth(ctx.ctoken),
    });
    assertOk(confirm);
    assert(!!confirm.json.data.order?.id, 'order created');
    assertEq(confirm.json.data.order.status, '待签约');
  });

  it('客户可拒绝报价', ['R-P0-4', 'R-ACCEPT-2'], async () => {
    const ctx = await prepareRfq();
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: ctx.rfqId, supplier_id: ctx.supplierId, price: 1200 },
    });
    await req(`/admin/quotes/${draft.json.data.id}/send`, {
      method: 'PUT',
      headers: auth(ctx.atoken),
    });
    const rej = await req(`/customer/quotes/${draft.json.data.id}/reject`, {
      method: 'POST',
      headers: auth(ctx.ctoken),
    });
    assertOk(rej);
    const detail = await req(`/customer/rfqs/${ctx.rfqId}`, { headers: auth(ctx.ctoken) });
    assertEq(detail.json.data.status, 'rejected');
  });

  it('不能确认草稿报价', ['R-GAP-DRAFT'], async () => {
    const ctx = await prepareRfq();
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: ctx.rfqId, supplier_id: ctx.supplierId, price: 100 },
    });
    const confirm = await req(`/customer/quotes/${draft.json.data.id}/confirm`, {
      method: 'POST',
      headers: auth(ctx.ctoken),
    });
    assertFail(confirm);
  });

  it('一 RFQ 一报价：再次录入覆盖同一条', ['R-GAP-ONE-QUOTE'], async () => {
    const ctx = await prepareRfq();
    const q1 = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: ctx.rfqId, supplier_id: ctx.supplierId, price: 1000 },
    });
    const q2 = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: ctx.rfqId, supplier_id: ctx.supplierId, price: 2000 },
    });
    assertOk(q1);
    assertOk(q2);
    assertEq(q1.json.data.id, q2.json.data.id, 'same quote id');
    assertEq(Number(q2.json.data.price), 2000);
  });

  it('过期报价不可确认', ['R-GAP-EXPIRY'], async () => {
    const ctx = await prepareRfq();
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: ctx.rfqId, supplier_id: ctx.supplierId, price: 3000 },
    });
    await req(`/admin/quotes/${draft.json.data.id}/send`, {
      method: 'PUT',
      headers: auth(ctx.atoken),
    });

    // 直接改库：用 API 无法设过去时间，通过 sequelize script inline
    const { Quote } = await import('../../src/models/index.js');
    const q = await Quote.findByPk(draft.json.data.id);
    q.expiry_time = new Date(Date.now() - 60_000);
    await q.save();

    const confirm = await req(`/customer/quotes/${draft.json.data.id}/confirm`, {
      method: 'POST',
      headers: auth(ctx.ctoken),
    });
    assertFail(confirm);
    assert(
      String(confirm.json?.message || '').includes('过期'),
      `expect expiry message, got ${confirm.json?.message}`,
    );
  });

  it('发送后改价变草稿，需重发；RFQ 退回 pending', ['R-GAP-DRAFT', 'R-GAP-ONE-QUOTE'], async () => {
    const ctx = await prepareRfq();
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: ctx.rfqId, supplier_id: ctx.supplierId, price: 4000 },
    });
    await req(`/admin/quotes/${draft.json.data.id}/send`, {
      method: 'PUT',
      headers: auth(ctx.atoken),
    });
    const edited = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: ctx.rfqId, supplier_id: ctx.supplierId, price: 4500 },
    });
    assertOk(edited);
    assertEq(edited.json.data.status, 'draft');

    const adminRfq = await req('/admin/rfqs', { headers: auth(ctx.atoken) });
    const row = adminRfq.json.data.find((r) => r.id === ctx.rfqId);
    assertEq(row.status, 'pending');

    const customer = await req(`/customer/rfqs/${ctx.rfqId}`, { headers: auth(ctx.ctoken) });
    assert(customer.json.data.quote == null, 'hidden after edit');
  });
});

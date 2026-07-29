import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail, assertEq } from '../lib/assert.js';
import { customerLogin, ensureCustomer, adminLogin, auth, brokerLogin } from '../lib/auth.js';
import { forceQuoteExpiry } from '../lib/db.js';

async function flowToCompleted() {
  const email = `u${Date.now()}@test.local`;
  const { token: ctoken } = await ensureCustomer(email, 'Pass1234!', { company_name: '成交动态公司' });
  const skus = await req('/customer/skus');
  const rfq = await req('/customer/rfqs', {
    method: 'POST',
    headers: auth(ctoken),
    body: {
      sku_id: skus.json.data[0].id,
      quantity: 1,
      submit_page: '/rfq',
      note: 'deal feed flow',
    },
  });
  assertOk(rfq);
  const { token: atoken } = await adminLogin();
  const suppliers = await req('/admin/suppliers', { headers: auth(atoken) });
  const quote = await req('/admin/quotes', {
    method: 'POST',
    headers: auth(atoken),
    body: {
      rfq_id: rfq.json.data.id,
      supplier_id: suppliers.json.data[0].id,
      price: 12345,
      customer_view_note: '交期可谈，正式合同以邮件为准',
    },
  });
  assertOk(quote);
  await req(`/admin/quotes/${quote.json.data.id}/send`, {
    method: 'PUT',
    headers: auth(atoken),
  });
  const confirm = await req(`/customer/quotes/${quote.json.data.id}/confirm`, {
    method: 'POST',
    headers: auth(ctoken),
  });
  assertOk(confirm);
  const orderId = confirm.json.data.order.id;
  for (const st of ['待交付', '待验收', '待结算', '已完成']) {
    const r = await req(`/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: auth(atoken),
      body: {
        status: st,
        note: st === '已完成' ? '验收通过，可对外脱敏展示' : `→${st}`,
        is_customer_visible: st === '已完成',
      },
    });
    assertOk(r);
  }
  return { ctoken, atoken, orderId, quoteId: quote.json.data.id, rfqId: rfq.json.data.id };
}

describe('V3 运营 / 询价报价增强', ({ it }) => {
  it('RFQ 记录 submit_page 与 sla_deadline', ['V3-A-RFQ'], async () => {
    const { token } = await ensureCustomer(`u${Date.now()}@test.local`, 'Pass1234!', {
      company_name: 'SLA公司',
    });
    const skus = await req('/customer/skus');
    const created = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(token),
      body: {
        sku_id: skus.json.data[0].id,
        quantity: 3,
        submit_page: '/sku/1',
      },
    });
    assertOk(created);
    assertEq(created.json.data.submit_page, '/sku/1');
    assert(!!created.json.data.sla_deadline, 'sla_deadline set');
  });

  it('报价含 customer_view_note 与 remaining_seconds', ['V3-A-QUOTE'], async () => {
    const email = `u${Date.now()}@test.local`;
    const { token: ctoken } = await ensureCustomer(email, 'Pass1234!', { company_name: '留言公司' });
    const skus = await req('/customer/skus');
    const rfq = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(ctoken),
      body: { sku_id: skus.json.data[0].id, quantity: 2 },
    });
    const { token: atoken } = await adminLogin();
    const suppliers = await req('/admin/suppliers', { headers: auth(atoken) });
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(atoken),
      body: {
        rfq_id: rfq.json.data.id,
        supplier_id: suppliers.json.data[0].id,
        price: 9900,
        customer_view_note: '客户可见备注ABC',
      },
    });
    assertOk(draft);
    assertEq(draft.json.data.customer_view_note, '客户可见备注ABC');
    await req(`/admin/quotes/${draft.json.data.id}/send`, {
      method: 'PUT',
      headers: auth(atoken),
    });

    const detail = await req(`/customer/rfqs/${rfq.json.data.id}`, { headers: auth(ctoken) });
    assertOk(detail);
    assertEq(detail.json.data.quote.customer_view_note, '客户可见备注ABC');
    assert(typeof detail.json.data.quote.remaining_seconds === 'number', 'remaining on rfq');
    assert(detail.json.data.quote.remaining_seconds > 0, 'remaining > 0');

    const q = await req(`/customer/quotes/${draft.json.data.id}`, { headers: auth(ctoken) });
    assertOk(q);
    assert(typeof q.json.data.remaining_seconds === 'number', 'remaining on quote');
    assert(!!q.json.data.supplier_display, 'masked');
    assert(!q.json.data.supplier, 'no supplier object');
  });

  it('客户拒绝可写 reject_reason', ['V3-A-QUOTE'], async () => {
    const email = `u${Date.now()}@test.local`;
    const { token: ctoken } = await ensureCustomer(email, 'Pass1234!', { company_name: '拒绝公司' });
    const skus = await req('/customer/skus');
    const rfq = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(ctoken),
      body: { sku_id: skus.json.data[0].id, quantity: 1 },
    });
    const { token: atoken } = await adminLogin();
    const suppliers = await req('/admin/suppliers', { headers: auth(atoken) });
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(atoken),
      body: {
        rfq_id: rfq.json.data.id,
        supplier_id: suppliers.json.data[0].id,
        price: 1111,
      },
    });
    await req(`/admin/quotes/${draft.json.data.id}/send`, {
      method: 'PUT',
      headers: auth(atoken),
    });
    const rej = await req(`/customer/quotes/${draft.json.data.id}/reject`, {
      method: 'POST',
      headers: auth(ctoken),
      body: { reject_reason: '价格偏高' },
    });
    assertOk(rej);

    const { token: admin } = await adminLogin();
    const adminRfq = await req(`/admin/rfqs?status=rejected`, { headers: auth(admin) });
    assertOk(adminRfq);
    const row = adminRfq.json.data.find((r) => r.id === rfq.json.data.id);
    assert(row, 'rejected in admin');
    assertEq(row.reject_reason, '价格偏高');
  });

  it('过期任务把 pending 报价标 expired', ['V3-A-EXPIRE'], async () => {
    const email = `u${Date.now()}@test.local`;
    const { token: ctoken } = await ensureCustomer(email, 'Pass1234!', { company_name: '过期公司' });
    const skus = await req('/customer/skus');
    const rfq = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(ctoken),
      body: { sku_id: skus.json.data[0].id, quantity: 1 },
    });
    const { token: atoken } = await adminLogin();
    const suppliers = await req('/admin/suppliers', { headers: auth(atoken) });
    const draft = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(atoken),
      body: {
        rfq_id: rfq.json.data.id,
        supplier_id: suppliers.json.data[0].id,
        price: 2222,
      },
    });
    const sent = await req(`/admin/quotes/${draft.json.data.id}/send`, {
      method: 'PUT',
      headers: auth(atoken),
    });
    assertOk(sent);
    await forceQuoteExpiry(draft.json.data.id);

    const job = await req('/admin/jobs/expire-quotes', {
      method: 'POST',
      headers: auth(atoken),
    });
    assertOk(job);
    assert(job.json.data.expired >= 1, `expired >=1 got ${job.json.data.expired}`);

    const q = await req(`/customer/quotes/${draft.json.data.id}`, { headers: auth(ctoken) });
    assertOk(q);
    assertEq(q.json.data.status, 'expired');
  });

  it('订单完成 → 成交动态草稿 → 发布到前台', ['V3-B-FEED'], async () => {
    const ctx = await flowToCompleted();
    const drafts = await req('/admin/deal-feeds?published=false', {
      headers: auth(ctx.atoken),
    });
    assertOk(drafts);
    const draft = drafts.json.data.find((f) => f.order_id === ctx.orderId);
    assert(draft, 'draft created');
    assertEq(draft.is_published, false);

    const before = await req('/customer/deal-feeds');
    assertOk(before);
    assert(!before.json.data.some((f) => f.id === draft.id), 'draft hidden');

    const pub = await req(`/admin/deal-feeds/${draft.id}/publish`, {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { region: '东部' },
    });
    assertOk(pub);
    assertEq(pub.json.data.is_published, true);

    const after = await req('/customer/deal-feeds');
    assertOk(after);
    const shown = after.json.data.find((f) => f.id === draft.id);
    assert(shown, 'published visible');
    assertEq(shown.region, '东部');
    assert(!!shown.sku_name, 'sku_name');
    assert(!('order_id' in shown), 'no order_id');

    const custOrder = await req(`/customer/orders/${ctx.orderId}`, {
      headers: auth(ctx.ctoken),
    });
    assertOk(custOrder);
    assert(
      (custOrder.json.data.logs || []).some((l) => l.to_status === '已完成' && l.is_customer_visible),
      'customer visible log',
    );
  });

  it('通告 CRUD（admin）+ 前台生效', ['V3-A-OPS'], async () => {
    const { token } = await adminLogin();
    const title = `测试通告-${Date.now()}`;
    const created = await req('/admin/announcements', {
      method: 'POST',
      headers: auth(token),
      body: {
        title,
        content: '功能测试',
        is_active: true,
        position: 'top',
      },
    });
    assertOk(created);
    const id = created.json.data.id;

    const front = await req('/customer/announcement');
    assertOk(front);
    assert(front.json.data?.title === title || front.json.data?.id === id, 'active on front');

    const updated = await req(`/admin/announcements/${id}`, {
      method: 'PUT',
      headers: auth(token),
      body: { is_active: false },
    });
    assertOk(updated);

    const list = await req('/admin/announcements', { headers: auth(token) });
    assertOk(list);
    assert(list.json.data.some((a) => a.id === id), 'in admin list');

    const del = await req(`/admin/announcements/${id}`, {
      method: 'DELETE',
      headers: auth(token),
    });
    assertOk(del);
  });

  it('Broker 可改 SKU 运营字段', ['V3-A-OPS'], async () => {
    const { token: admin } = await adminLogin();
    const skus = await req('/admin/skus', { headers: auth(admin) });
    const target = skus.json.data.find((s) => s.is_public && !/^SKU-T-/i.test(s.name));
    assert(target, 'public sku');

    const { token: broker } = await brokerLogin();
    const point = `卖点-${Date.now()}`;
    const updated = await req(`/admin/skus/${target.id}`, {
      method: 'PUT',
      headers: auth(broker),
      body: {
        is_hot: true,
        sort_weight: 99,
        selling_point: point,
        delivery_note: '现货 3 日',
      },
    });
    assertOk(updated);
    assertEq(updated.json.data.selling_point, point);

    const rename = await req(`/admin/skus/${target.id}`, {
      method: 'PUT',
      headers: auth(broker),
      body: { name: '非法改名' },
    });
    assertOk(rename);
    assert(rename.json.data.name !== '非法改名', 'broker cannot rename');
  });

  it('Broker 不可跑过期任务（仅 admin）', ['V3-A-EXPIRE'], async () => {
    const { token } = await brokerLogin();
    const r = await req('/admin/jobs/expire-quotes', {
      method: 'POST',
      headers: auth(token),
    });
    assert(r.status === 403 || r.json?.code !== 0, 'broker blocked');
  });
});

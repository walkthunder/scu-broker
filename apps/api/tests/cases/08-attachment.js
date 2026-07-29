import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe } from '../lib/runner.js';
import { req, BASE } from '../lib/http.js';
import { assert, assertOk } from '../lib/assert.js';
import { customerLogin, ensureCustomer, adminLogin, auth } from '../lib/auth.js';

async function setupQuoteAndOrder() {
  const { token: ctoken } = await ensureCustomer(`u${Date.now()}@test.local`);
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
    body: { rfq_id: rfq.json.data.id, supplier_id: suppliers.json.data[0].id, price: 9000 },
  });
  await req(`/admin/quotes/${quote.json.data.id}/send`, {
    method: 'PUT',
    headers: auth(atoken),
  });
  const confirm = await req(`/customer/quotes/${quote.json.data.id}/confirm`, {
    method: 'POST',
    headers: auth(ctoken),
  });
  return {
    atoken,
    quoteId: quote.json.data.id,
    orderId: confirm.json.data.order.id,
  };
}

async function upload(urlPath, token, filename, content) {
  const tmp = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tmp, content);
  const fd = new FormData();
  const blob = new Blob([content], { type: 'text/plain' });
  fd.append('file', blob, filename);
  const res = await fetch(`${BASE}${urlPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = await res.json();
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

describe('附件', ({ it }) => {
  it('报价附件可上传并可查询', ['R-P1-7', 'R-ACCEPT-4'], async () => {
    const ctx = await setupQuoteAndOrder();
    // 新开一条仅有报价的链路上传 quote 附件
    const { token: ctoken } = await ensureCustomer(`u${Date.now()}@test.local`);
    const skus = await req('/customer/skus');
    const rfq = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(ctoken),
      body: { sku_id: skus.json.data[0].id, quantity: 1 },
    });
    const suppliers = await req('/admin/suppliers', { headers: auth(ctx.atoken) });
    const quote = await req('/admin/quotes', {
      method: 'POST',
      headers: auth(ctx.atoken),
      body: { rfq_id: rfq.json.data.id, supplier_id: suppliers.json.data[0].id, price: 1 },
    });

    const up = await upload(
      `/admin/quotes/${quote.json.data.id}/attachments`,
      ctx.atoken,
      'negotiate.txt',
      'wechat screenshot mock',
    );
    assert(up.json?.code === 0, `upload quote: ${up.json?.message}`);
    assert(up.json.data.file_path.startsWith('/uploads/'), 'path');

    const list = await req(
      `/admin/attachments?related_type=quote&related_id=${quote.json.data.id}`,
      { headers: auth(ctx.atoken) },
    );
    assertOk(list);
    assert(list.json.data.some((a) => a.id === up.json.data.id), 'listed');
  });

  it('订单附件可上传', ['R-P1-7', 'R-ACCEPT-4'], async () => {
    const ctx = await setupQuoteAndOrder();
    const up = await upload(
      `/admin/orders/${ctx.orderId}/attachments`,
      ctx.atoken,
      'contract.txt',
      'contract scan mock',
    );
    assert(up.json?.code === 0, `upload order: ${up.json?.message}`);
  });
});

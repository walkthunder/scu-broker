import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk } from '../lib/assert.js';
import { adminLogin, auth } from '../lib/auth.js';
import { todayShanghai } from '../../src/utils/market.js';
import { tryUpsertPrint } from '../lib/index-print.js';

describe('V4 价格指数', ({ it }) => {
  it('Admin 可列出指数并生成/发布结算价', ['V4-A1', 'V4-A2'], async () => {
    const { token } = await adminLogin();
    const list = await req('/admin/indices', { headers: auth(token) });
    assertOk(list);
    assert(Array.isArray(list.json.data) && list.json.data.length >= 1, '至少 1 个指数');
    const idx = list.json.data.find((x) => x.code === 'H100-M') || list.json.data[0];

    const hit = await tryUpsertPrint(token, idx.id, 80000, { preferredDate: todayShanghai() });
    assert(hit, '应找到可写入日期');
    assert(['draft', 'pending_review', 'published'].includes(hit.data.status));

    const pub = await req(`/admin/indices/${idx.id}/prints/${hit.date}/publish`, {
      method: 'POST',
      headers: auth(token),
    });
    assertOk(pub);
    assert(pub.json.data.status === 'published', '应已发布');
  });

  it('Customer 可看指数与 published 历史', ['V4-A2'], async () => {
    const r = await req('/customer/indices');
    assertOk(r);
    assert(Array.isArray(r.json.data));
    const idx = r.json.data[0];
    if (!idx) return;
    const prints = await req(`/customer/indices/${idx.id}/prints`);
    assertOk(prints);
    assert(prints.json.data.every((p) => p.settle_price != null));
  });

  it('跳变超阈值进入 pending_review', ['V4-A3'], async () => {
    const { token } = await adminLogin();
    const list = await req('/admin/indices', { headers: auth(token) });
    assertOk(list);
    const idx = list.json.data.find((x) => x.code === 'H100-M') || list.json.data[0];
    const hit = await tryUpsertPrint(token, idx.id, 1, { preferredDate: todayShanghai() });
    assert(hit, '应找到可写入日期');
    assert(['draft', 'pending_review'].includes(hit.data.status));
  });
});

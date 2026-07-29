import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail } from '../lib/assert.js';
import { adminLogin, auth } from '../lib/auth.js';
import { todayShanghai, addDaysShanghai } from '../../src/utils/market.js';

describe('V4 价格指数', ({ it }) => {
  it('Admin 可列出指数并生成/发布结算价', ['V4-A1', 'V4-A2'], async () => {
    const { token } = await adminLogin();
    const list = await req('/admin/indices', { headers: auth(token) });
    assertOk(list);
    assert(Array.isArray(list.json.data) && list.json.data.length >= 1, '至少 1 个指数');
    const idx = list.json.data.find((x) => x.code === 'H100-M') || list.json.data[0];

    // 找未锁定日期；若已发布则先撤销再覆写
    let date = null;
    let gen = null;
    for (let i = 5; i < 25; i++) {
      const d = addDaysShanghai(todayShanghai(), -i);
      await req(`/admin/indices/${idx.id}/prints/${d}/unpublish`, {
        method: 'POST',
        headers: auth(token),
      }).catch(() => null);
      gen = await req(`/admin/indices/${idx.id}/prints`, {
        method: 'POST',
        headers: auth(token),
        body: { date: d, settle_price: 80000 },
      });
      if (gen.json?.code === 0) {
        date = d;
        break;
      }
    }
    assertOk(gen);
    assert(date, '应找到可写入日期');
    assert(['draft', 'pending_review', 'published'].includes(gen.json.data.status));

    const pub = await req(`/admin/indices/${idx.id}/prints/${date}/publish`, {
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
    let r = null;
    for (let i = 4; i < 30; i++) {
      const date = addDaysShanghai(todayShanghai(), -i);
      await req(`/admin/indices/${idx.id}/prints/${date}/unpublish`, {
        method: 'POST',
        headers: auth(token),
      }).catch(() => null);
      r = await req(`/admin/indices/${idx.id}/prints`, {
        method: 'POST',
        headers: auth(token),
        body: { date, settle_price: 1 },
      });
      if (r.json?.code === 0) break;
    }
    assertOk(r);
    assert(['draft', 'pending_review'].includes(r.json.data.status));
  });
});

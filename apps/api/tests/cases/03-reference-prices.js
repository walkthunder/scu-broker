import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail } from '../lib/assert.js';
import { adminLogin, auth } from '../lib/auth.js';

function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

describe('参考价', ({ it }) => {
  it('后台录入/覆盖当日参考价', ['R-P0-2'], async () => {
    const { token } = await adminLogin();
    const skus = await req('/admin/skus', { headers: auth(token) });
    assertOk(skus);
    const skuId = skus.json.data[0].id;
    const date = todayShanghai();

    const saved = await req('/admin/reference-prices', {
      method: 'POST',
      headers: auth(token),
      body: { sku_id: skuId, date, price_low: 10, price_mid: 15, price_high: 20 },
    });
    assertOk(saved);

    const again = await req('/admin/reference-prices', {
      method: 'POST',
      headers: auth(token),
      body: { sku_id: skuId, date, price_low: 11, price_mid: 16, price_high: 21 },
    });
    assertOk(again);
    assert(Number(again.json.data.price_mid) === 16, 'upsert mid');

    const list = await req(`/admin/reference-prices?date=${date}`, { headers: auth(token) });
    assertOk(list);
    assert(list.json.data.some((p) => p.sku_id === skuId), 'listed');
  });

  it('客户前台可读当日参考价（含低中高）', ['R-P0-2', 'R-GAP-DEAL'], async () => {
    const r = await req('/customer/reference-prices');
    assertOk(r);
    assert(r.json.data.length > 0, 'has rows');
    const row = r.json.data[0];
    assert('price_low' in row && 'price_mid' in row && 'price_high' in row, 'price fields');
    assert('deal_low' in row && 'deal_high' in row, 'deal fields');
  });

  it('缺少字段拒绝录入', ['R-P0-2'], async () => {
    const { token } = await adminLogin();
    const r = await req('/admin/reference-prices', {
      method: 'POST',
      headers: auth(token),
      body: { sku_id: 1, date: todayShanghai() },
    });
    assertFail(r);
  });
});

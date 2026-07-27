import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail, assertEq } from '../lib/assert.js';
import { adminLogin, auth } from '../lib/auth.js';

describe('V3 行情大厅 / SKU 市场', ({ it }) => {
  it('通告：有生效通告时可读取', ['V3-A-MARKET'], async () => {
    const r = await req('/customer/announcement');
    assertOk(r);
    // seed 通常有激活通告；若无则为 null
    if (r.json.data) {
      assert(r.json.data.title, 'has title');
      assertEq(r.json.data.is_active, true);
    }
  });

  it('今日脉搏字段完整', ['V3-A-MARKET'], async () => {
    const r = await req('/customer/market-pulse');
    assertOk(r);
    const d = r.json.data;
    assert(typeof d.price_as_of === 'string', 'price_as_of');
    assert(typeof d.priced_sku_count === 'number', 'priced_sku_count');
    assert(typeof d.published_feed_count === 'number', 'published_feed_count');
    assert(typeof d.inquiry_active === 'boolean', 'inquiry_active');
    assert(typeof d.pulse_text === 'string', 'pulse_text');
    assert(typeof d.sla_hint === 'string', 'sla_hint');
    assert(typeof d.server_time === 'string', 'server_time');
  });

  it('热门 SKU：仅 public+hot，无测试命名', ['V3-A-MARKET'], async () => {
    const r = await req('/customer/hot-skus');
    assertOk(r);
    assert(Array.isArray(r.json.data), 'array');
    for (const s of r.json.data) {
      assert(!/^SKU-T-/i.test(s.name || s.sku_name || ''), `no test sku ${s.id}`);
      assert('change_label' in s, 'change_label');
    }
  });

  it('参考价含涨跌字段（无昨日则为 —）', ['V3-A-MARKET'], async () => {
    const r = await req('/customer/reference-prices');
    assertOk(r);
    assert(r.json.data.length > 0, 'has rows');
    const row = r.json.data[0];
    assert('change_pct' in row, 'change_pct');
    assert('change_label' in row, 'change_label');
    assert(!/^SKU-T-/i.test(row.name || ''), 'no test name on front');
  });

  it('完整行情 / SKU 列表不出测试与非公开', ['V3-A-MARKET'], async () => {
    const { token } = await adminLogin();
    const hiddenName = `Hidden-SKU-${Date.now()}`;
    const created = await req('/admin/skus', {
      method: 'POST',
      headers: auth(token),
      body: {
        name: hiddenName,
        type: 'gpu',
        unit: '小时',
        status: 'active',
        is_public: false,
        is_hot: true,
      },
    });
    assertOk(created);
    const id = created.json.data.id;

    const list = await req('/customer/skus');
    assertOk(list);
    assert(!list.json.data.some((s) => s.id === id), 'hidden not listed');
    assert(list.json.data.every((s) => !/^SKU-T-/i.test(s.name)), 'no SKU-T');

    const detail = await req(`/customer/skus/${id}`);
    assertFail(detail);

    const testSku = await req('/admin/skus', {
      method: 'POST',
      headers: auth(token),
      body: {
        name: `SKU-T-${Date.now()}`,
        type: 'gpu',
        unit: '小时',
        status: 'active',
        is_public: true,
      },
    });
    assertOk(testSku);
    const front = await req('/customer/skus');
    assert(!front.json.data.some((s) => s.id === testSku.json.data.id), 'SKU-T filtered');
  });

  it('SKU 详情含卖点/历史价', ['V3-A-MARKET'], async () => {
    const list = await req('/customer/skus');
    assertOk(list);
    const sku = list.json.data[0];
    const r = await req(`/customer/skus/${sku.id}`);
    assertOk(r);
    const d = r.json.data;
    assertEq(d.id, sku.id);
    assert(Array.isArray(d.price_history), 'price_history');
    assert('change_label' in d, 'change_label');
  });

  it('已发布成交动态可对客户可见且不泄密', ['V3-B-FEED'], async () => {
    const r = await req('/customer/deal-feeds');
    assertOk(r);
    assert(Array.isArray(r.json.data), 'array');
    assert(r.json.data.length >= 1, 'seed published feeds');
    assert(
      r.json.data.every((f) => f.region && f.sku_name && f.deal_type),
      'published shape only',
    );
    assert(r.json.data.every((f) => !('order_id' in f)), 'no order_id leak');
    assert(r.json.data.every((f) => !('price' in f)), 'no price leak');
  });
});

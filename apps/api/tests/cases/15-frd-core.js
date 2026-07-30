import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk } from '../lib/assert.js';
import { adminLogin, brokerLogin, customerLogin, auth } from '../lib/auth.js';
import { todayShanghai } from '../../src/utils/market.js';

describe('FRD 全量核心', ({ it }) => {
  it('区域元数据与平台配置', ['FR-CFG'], async () => {
    const regions = await req('/frd/meta/regions');
    assertOk(regions);
    assert(regions.json.data.length === 3, '三区域');
    const { token } = await adminLogin();
    const seed = await req('/frd/platform-config/seed-defaults', {
      method: 'POST',
      headers: auth(token),
    });
    assertOk(seed);
    assert(seed.json.data.presale_basis_pct === -20, '基差-20');
  });

  it('渠道成交 + 引擎 + 双人发布', ['FR-1.1', 'FR-1.2', 'FR-1.4'], async () => {
    const { token: adminTok } = await adminLogin();
    const { token: brokerTok } = await brokerLogin();
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    assertOk(skus);
    const h100 = skus.json.data.find((s) => s.name === 'H100') || skus.json.data[0];
    for (let i = 0; i < 3; i++) {
      const r = await req('/frd/channel-deals', {
        method: 'POST',
        headers: auth(adminTok),
        body: {
          sku_id: h100.id,
          region: 'shanghai',
          qty: 3 + i,
          unit_price: 118000 + i * 500,
          deal_status: 'filled',
        },
      });
      assertOk(r);
    }
    const eng = await req('/frd/index-engine/run', {
      method: 'POST',
      headers: auth(adminTok),
      body: { date: todayShanghai() },
    });
    assertOk(eng);
    const sub = await req('/frd/price-bulletins/submit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { date: todayShanghai() },
    });
    if (sub.ok) {
      assert(sub.json.data.status === 'pending_review');
      const pub = await req(`/frd/price-bulletins/${todayShanghai()}/publish`, {
        method: 'POST',
        headers: auth(brokerTok),
      });
      assertOk(pub);
      assert(pub.json.data.status === 'published');
    } else {
      assert(
        String(sub.json.message || '').includes('已发布'),
        `提交复核失败：${sub.json.message}`,
      );
    }
    const curve = await req(`/frd/curves?sku_id=${h100.id}&region=shanghai&kind=spot`);
    assertOk(curve);
    const week = await req(
      `/frd/curves?sku_id=${h100.id}&region=shanghai&kind=spot&granularity=week`,
    );
    assertOk(week);
    assert(Array.isArray(week.json.data), '周曲线应为数组');
    const csv = await req('/frd/channel-deals/import', {
      method: 'POST',
      headers: auth(adminTok),
      body: {
        csv: `sku_id,region,qty,unit_price,deal_status,note\n${h100.id},shanghai,2,119000,filled,csv-import`,
      },
    });
    assertOk(csv);
    assert(csv.json.data.length >= 1, 'CSV 至少导入 1 条');
    const voided = await req(`/frd/channel-deals/${csv.json.data[0].id}/void`, {
      method: 'POST',
      headers: auth(adminTok),
      body: { reason: 'test-void' },
    });
    assertOk(voided);
    assert(voided.json.data.voided_at, '应标记作废');
  });

  it('账本入账与现货盘口', ['FR-2.1', 'FR-5.1'], async () => {
    const { token: adminTok } = await adminLogin();
    const { token: buyerTok, user: buyer } = await customerLogin('buyer@comprix.local');
    const dep = await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.id, amount: 300000, note: 'test' },
    });
    assertOk(dep);
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    const h100 = skus.json.data.find((s) => s.name === 'H100');
    const book = await req(`/frd/spot/book?sku_id=${h100.id}&region=shanghai&qty=2`);
    assertOk(book);
    assert('bids' in book.json.data && 'asks' in book.json.data);
    const me = await req('/frd/console/me', { headers: auth(buyerTok) });
    assertOk(me);
    assert(me.json.data.ledger?.available >= 0);
  });

  it('认购权益开仓确认收费', ['FR-4.1'], async () => {
    const { token: adminTok } = await adminLogin();
    const { token: buyerTok, user: buyer } = await customerLogin('buyer@comprix.local');
    await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.id, amount: 50000 },
    });
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    const h100 = skus.json.data.find((s) => s.name === 'H100');
    const created = await req('/frd/rights', {
      method: 'POST',
      headers: auth(adminTok),
      body: {
        kind: 'call',
        buyer_id: buyer.id,
        sku_id: h100.id,
        region: 'shanghai',
        qty: 1,
        strike: 120000,
        premium: 4000,
      },
    });
    assertOk(created);
    const conf = await req(`/frd/rights/${created.json.data.id}/confirm`, {
      method: 'POST',
      headers: auth(buyerTok),
    });
    assertOk(conf);
    const fee = await req(`/frd/rights/${created.json.data.id}/confirm-fee`, {
      method: 'POST',
      headers: auth(adminTok),
    });
    assertOk(fee);
    assert(fee.json.data.status === 'open');
    const pool = await req('/frd/rights/put-pool', { headers: auth(adminTok) });
    assertOk(pool);
  });

  it('客户控制台聚合', ['FR-7.1'], async () => {
    const { token } = await customerLogin('buyer@comprix.local');
    const r = await req('/frd/console/me', { headers: auth(token) });
    assertOk(r);
    assert(r.json.data.ledger);
    assert(Array.isArray(r.json.data.rights));
    assert(Array.isArray(r.json.data.mtm_statements), '控制台含盯市结算单');
  });

  it('现货挂单簿与 RFQ 阈值', ['FR-2.1', 'FR-2.2', 'FR-2.3'], async () => {
    const { token: adminTok } = await adminLogin();
    const buyer = await customerLogin('buyer@comprix.local');
    const seller = await customerLogin('seller@comprix.local');
    await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.user.id, amount: 5_000_000 },
    });
    await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: seller.user.id, amount: 5_000_000 },
    });
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    const h100 = skus.json.data.find((s) => s.name === 'H100');
    const sell = await req('/frd/spot/orders', {
      method: 'POST',
      headers: auth(seller.token),
      body: {
        sku_id: h100.id,
        region: 'shanghai',
        side: 'sell',
        order_type: 'limit',
        price: 120000,
        qty: 1,
      },
    });
    assertOk(sell);
    const buy = await req('/frd/spot/orders', {
      method: 'POST',
      headers: auth(buyer.token),
      body: {
        sku_id: h100.id,
        region: 'shanghai',
        side: 'buy',
        order_type: 'limit',
        price: 120000,
        qty: 1,
      },
    });
    assertOk(buy);
    const book = await req(`/frd/spot/book?sku_id=${h100.id}&region=shanghai&qty=2`);
    assertOk(book);
    const big = await req('/frd/spot/orders', {
      method: 'POST',
      headers: auth(buyer.token),
      body: {
        sku_id: h100.id,
        region: 'shanghai',
        side: 'buy',
        order_type: 'limit',
        price: 120000,
        qty: 1000,
      },
    });
    assertOk(big);
    assert(big.json.data?.require_rfq === true, '大额应引导 RFQ');
  });

  it('认沽开仓与资金池', ['FR-4.2'], async () => {
    const { token: adminTok } = await adminLogin();
    const { token: buyerTok, user: buyer } = await customerLogin('buyer@comprix.local');
    await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.id, amount: 200000 },
    });
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    const h100 = skus.json.data.find((s) => s.name === 'H100');
    const created = await req('/frd/rights', {
      method: 'POST',
      headers: auth(adminTok),
      body: {
        kind: 'put',
        buyer_id: buyer.id,
        sku_id: h100.id,
        region: 'shanghai',
        qty: 1,
        strike: 100000,
        premium: 3000,
      },
    });
    assertOk(created);
    await req(`/frd/rights/${created.json.data.id}/confirm`, {
      method: 'POST',
      headers: auth(buyerTok),
    });
    const fee = await req(`/frd/rights/${created.json.data.id}/confirm-fee`, {
      method: 'POST',
      headers: auth(adminTok),
    });
    assertOk(fee);
    assert(fee.json.data.status === 'open');
    const pool = await req('/frd/rights/put-pool', { headers: auth(adminTok) });
    assertOk(pool);
    assert(pool.json.data.pool_balance > 0);
  });

  it('作业：过期清理与盯市入口', ['FR-3.2', 'FR-5.3'], async () => {
    const { token } = await adminLogin();
    const exp = await req('/frd/jobs/expire-all', { method: 'POST', headers: auth(token), body: {} });
    assertOk(exp);
    const m = await req('/frd/jobs/margin-monitor', { method: 'POST', headers: auth(token), body: {} });
    assertOk(m);
    const mtm = await req('/frd/jobs/mtm-statements', {
      method: 'POST',
      headers: auth(token),
      body: {},
    });
    assertOk(mtm);
    const risk = await req('/frd/risk/overview', { headers: auth(token) });
    assertOk(risk);
    assert(risk.json.data.put_pool);
    const { token: buyerTok } = await customerLogin('buyer@comprix.local');
    const mine = await req('/frd/console/me', { headers: auth(buyerTok) });
    assertOk(mine);
    assert(Array.isArray(mine.json.data.mtm_statements));
  });

  it('伙伴入驻申请', ['FR-6.1'], async () => {
    const { token } = await adminLogin();
    const app = await req('/frd/partner/applications', {
      method: 'POST',
      body: {
        company_name: `测试伙伴${Date.now()}`,
        contact_name: '张三',
        phone: `139${String(Date.now()).slice(-8)}`,
        email: `p${Date.now()}@test.local`,
        regions: 'shanghai',
        skus: 'H100',
      },
    });
    assertOk(app);
    const list = await req('/frd/partner/applications', { headers: auth(token) });
    assertOk(list);
    assert(list.json.data.some((a) => a.id === app.json.data.id));
  });
});

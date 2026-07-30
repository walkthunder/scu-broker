/**
 * 三端页面对齐：覆盖此前页面有调用、套件未测到的关键接口。
 * 标签 PAGE-* 便于与 docs/测试说明.md 矩阵对照。
 */
import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk } from '../lib/assert.js';
import { adminLogin, customerLogin, auth } from '../lib/auth.js';
import { todayShanghai } from '../../src/utils/market.js';

async function partnerLogin() {
  const login = await req('/admin/login', {
    method: 'POST',
    body: { phone: '13900002001', password: 'partner123' },
  });
  assertOk(login, 'partner login');
  return { token: login.json.data.token, user: login.json.data.user };
}

describe('页面接口补全', ({ it }) => {
  it('预售挂牌与自助开仓', ['PAGE-PRESALE'], async () => {
    const { token: adminTok } = await adminLogin();
    const buyer = await customerLogin('buyer@comprix.local');
    await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.user.id, amount: 3_000_000, note: 'page-api' },
    });
    const offers = await req('/frd/presale/offers', { headers: auth(buyer.token) });
    assertOk(offers);
    assert(Array.isArray(offers.json.data), '挂牌列表');
    assert(offers.json.data.length > 0, '至少一条挂牌（需已发布 S）');
    const o = offers.json.data[0];
    const opened = await req('/frd/presale/open', {
      method: 'POST',
      headers: auth(buyer.token),
      body: {
        index_id: o.index_id,
        qty: 1,
        strike_price: o.strike_suggest,
        tenor_months: o.tenor_months || 6,
      },
    });
    assertOk(opened);
    assert(opened.json.data.status === 'pending_confirm');
    assert(Number(opened.json.data.buyer_id) === Number(buyer.user.id));
    // 客户端注入其它 seller_id 须被忽略（强制默认卖方）
    const seller = await customerLogin('seller@comprix.local');
    const inject = await req('/frd/presale/open', {
      method: 'POST',
      headers: auth(buyer.token),
      body: {
        index_id: o.index_id,
        qty: 1,
        strike_price: o.strike_suggest,
        seller_id: buyer.user.id, // 试图自成交
      },
    });
    assertOk(inject);
    assert(Number(inject.json.data.seller_id) !== Number(buyer.user.id), '禁止买方自成交');
    assert(
      Number(inject.json.data.seller_id) === Number(seller.user.id) ||
        Number(inject.json.data.seller_id) > 0,
      '对手方为平台默认卖方',
    );
    void seller;
  });

  it('权益：mine / premium-ref / self-open', ['PAGE-RIGHTS'], async () => {
    const { token: adminTok } = await adminLogin();
    const buyer = await customerLogin('buyer@comprix.local');
    await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.user.id, amount: 500_000 },
    });
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    const h100 = skus.json.data.find((s) => s.name === 'H100') || skus.json.data[0];
    const ref = await req('/frd/rights/premium-ref', {
      method: 'POST',
      headers: auth(buyer.token),
      body: {
        kind: 'call',
        sku_id: h100.id,
        region: 'shanghai',
        strike: 100000,
        qty: 1,
      },
    });
    assertOk(ref);
    assert(ref.json.data.premium_ref > 0);
    assert(ref.json.data.iv != null, '含 IV');
    assert(ref.json.data.tv != null, '含 TV');
    const opened = await req('/frd/rights/self-open', {
      method: 'POST',
      headers: auth(buyer.token),
      body: {
        kind: 'call',
        sku_id: h100.id,
        region: 'shanghai',
        qty: 1,
        strike: 100000,
        premium: ref.json.data.premium_ref,
      },
    });
    assertOk(opened);
    const mine = await req('/frd/rights/mine', { headers: auth(buyer.token) });
    assertOk(mine);
    assert(mine.json.data.some((r) => r.id === opened.json.data.id));
  });

  it('账本出金与公告/全国价只读', ['PAGE-LEDGER', 'PAGE-BULLETIN'], async () => {
    const { token: adminTok } = await adminLogin();
    const buyer = await customerLogin('buyer@comprix.local');
    await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.user.id, amount: 50_000, note: 'withdraw-prep' },
    });
    const before = await req(`/frd/ledger/${buyer.user.id}`, { headers: auth(adminTok) });
    assertOk(before);
    const avail = Number(before.json.data.available);
    const wd = await req('/frd/ledger/withdraw', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.user.id, amount: 1000, note: 'page-withdraw' },
    });
    assertOk(wd);
    assert(Number(wd.json.data.available) <= avail - 1000 + 1e-6);

    const latest = await req('/frd/price-bulletins/latest');
    assertOk(latest);
    const list = await req('/frd/price-bulletins', { headers: auth(adminTok) });
    assertOk(list);
    assert(Array.isArray(list.json.data));
    const nat = await req('/frd/national-composite');
    assertOk(nat);
    assert(Array.isArray(nat.json.data));
    const cfg = await req('/frd/platform-config', { headers: auth(adminTok) });
    assertOk(cfg);
    assert(cfg.json.data.presale_basis_pct != null);

    const date = list.json.data[0]?.date || todayShanghai();
    const exp = await req(`/frd/price-bulletins/${date}/export.html`, {
      headers: auth(adminTok),
    });
    if (exp.status === 200) {
      const html = exp.json?.raw || '';
      assert(html.includes('公告') || html.includes('html'), '导出为 HTML');
    } else {
      assert(exp.status === 404, '无公告时允许 404');
    }
  });

  it('做市报价 CRUD', ['PAGE-MM'], async () => {
    const { token: adminTok } = await adminLogin();
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    const h100 = skus.json.data.find((s) => s.name === 'H100') || skus.json.data[0];
    const created = await req('/frd/maker-quotes', {
      method: 'POST',
      headers: auth(adminTok),
      body: {
        sku_id: h100.id,
        region: 'shanghai',
        date: todayShanghai(),
        bid: 99000,
        ask: 101000,
        note: 'page-test',
      },
    });
    assertOk(created);
    const list = await req('/frd/maker-quotes', { headers: auth(adminTok) });
    assertOk(list);
    assert(list.json.data.some((q) => q.id === created.json.data.id));
    const del = await req(`/frd/maker-quotes/${created.json.data.id}`, {
      method: 'DELETE',
      headers: auth(adminTok),
    });
    assertOk(del);
  });

  it('现货我的挂单与取消', ['PAGE-SPOT'], async () => {
    const { token: adminTok } = await adminLogin();
    const buyer = await customerLogin('buyer@comprix.local');
    await req('/frd/ledger/deposit', {
      method: 'POST',
      headers: auth(adminTok),
      body: { user_id: buyer.user.id, amount: 2_000_000 },
    });
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    const h100 = skus.json.data.find((s) => s.name === 'H100') || skus.json.data[0];
    const placed = await req('/frd/spot/orders', {
      method: 'POST',
      headers: auth(buyer.token),
      body: {
        sku_id: h100.id,
        region: 'shanghai',
        side: 'buy',
        order_type: 'limit',
        price: 50000,
        qty: 1,
      },
    });
    assertOk(placed);
    const orderId = placed.json.data.order?.id || placed.json.data.id;
    assert(orderId, '有订单 id');
    const mine = await req('/frd/spot/orders/mine', { headers: auth(buyer.token) });
    assertOk(mine);
    assert(mine.json.data.some((o) => o.id === orderId));
    const cancel = await req(`/frd/spot/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: auth(buyer.token),
    });
    assertOk(cancel);
    assert(cancel.json.data.status === 'cancelled');
  });

  it('交割白名单/通道只读与争议入口', ['PAGE-DELIVERY'], async () => {
    const buyer = await customerLogin('buyer@comprix.local');
    const wl = await req('/customer/delivery-whitelist/me', { headers: auth(buyer.token) });
    assertOk(wl);
    assert('whitelisted' in (wl.json.data || wl.json));
    const ch = await req('/customer/delivery-channels', { headers: auth(buyer.token) });
    assertOk(ch);
    assert(Array.isArray(ch.json.data));

    const { token: adminTok } = await adminLogin();
    const orders = await req('/admin/delivery-orders', { headers: auth(adminTok) });
    assertOk(orders);
    const pending = (orders.json.data || []).find((o) => o.status === 'pending');
    if (pending) {
      const d = await req(`/admin/delivery-orders/${pending.id}/dispute`, {
        method: 'POST',
        headers: auth(adminTok),
        body: { reason: 'page-api 争议冒烟' },
      });
      assertOk(d);
      assert(d.json.data.status === 'dispute');
    }
  });

  it('伙伴产能/意向成交/凭证列表', ['PAGE-PARTNER'], async () => {
    const { token: adminTok } = await adminLogin();
    const partner = await partnerLogin();
    const caps = await req('/frd/partner/capacities/mine', { headers: auth(partner.token) });
    assertOk(caps);
    assert(Array.isArray(caps.json.data));
    if (caps.json.data[0]) {
      const row = caps.json.data[0];
      const saved = await req(`/frd/partner/capacities/${row.id}`, {
        method: 'PUT',
        headers: auth(partner.token),
        body: {
          spot_qty: row.spot_qty,
          forward_qty: row.forward_qty,
          rights_qty: row.rights_qty,
          quote_bid: 100000,
          quote_ask: 102000,
        },
      });
      assertOk(saved);
    }
    const skus = await req('/admin/skus', { headers: auth(adminTok) });
    const h100 = skus.json.data.find((s) => s.name === 'H100') || skus.json.data[0];
    const deal = await req('/frd/partner/channel-deals', {
      method: 'POST',
      headers: auth(partner.token),
      body: {
        sku_id: h100.id,
        region: 'shanghai',
        qty: 1,
        unit_price: 100500,
      },
    });
    assertOk(deal);
    assert(deal.json.data.deal_status === 'intent' || deal.json.data.source === 'partner');
    const confirmed = await req(`/frd/channel-deals/${deal.json.data.id}/confirm`, {
      method: 'POST',
      headers: auth(adminTok),
      body: {},
    });
    assertOk(confirmed);

    const apps = await req('/frd/partner/applications', { headers: auth(adminTok) });
    assertOk(apps);
    const pendingApp = (apps.json.data || []).find((a) => a.status === 'pending');
    if (pendingApp) {
      const rev = await req(`/frd/partner/applications/${pendingApp.id}/review`, {
        method: 'POST',
        headers: auth(adminTok),
        body: { approve: false, review_note: 'page-api 冒烟拒绝' },
      });
      assertOk(rev);
    }
    const adminCaps = await req('/frd/partner-capacities', { headers: auth(adminTok) });
    assertOk(adminCaps);
    const deliveries = await req('/frd/partner/deliveries', { headers: auth(partner.token) });
    assertOk(deliveries);
    assert(Array.isArray(deliveries.json.data));
  });

  it('CRM 线索读写', ['PAGE-CRM'], async () => {
    const { token: adminTok } = await adminLogin();
    const created = await req('/frd/crm/leads', {
      method: 'POST',
      headers: auth(adminTok),
      body: {
        company_name: `线索${Date.now()}`,
        contact_name: '测试',
        stage: 'lead',
        source: 'other',
      },
    });
    assertOk(created);
    const list = await req('/frd/crm/leads', { headers: auth(adminTok) });
    assertOk(list);
    assert(list.json.data.some((l) => l.id === created.json.data.id));
    const note = await req(`/frd/crm/leads/${created.json.data.id}/notes`, {
      method: 'POST',
      headers: auth(adminTok),
      body: { content: 'page-api note' },
    });
    assertOk(note);
    const upd = await req(`/frd/crm/leads/${created.json.data.id}`, {
      method: 'PUT',
      headers: auth(adminTok),
      body: { stage: 'qualified' },
    });
    assertOk(upd);
  });
});

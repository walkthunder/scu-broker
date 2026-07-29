import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail } from '../lib/assert.js';
import { adminLogin, customerLogin, auth } from '../lib/auth.js';
import { todayShanghai, addDaysShanghai } from '../../src/utils/market.js';

describe('M007 实物交割', ({ it }) => {
  it('白名单+窗口内可申请并完成交割', ['V4-C1', 'V4-C3', 'V4-C4'], async () => {
    const { token: adminToken } = await adminLogin();
    const buyer = await customerLogin('13900001001');
    const seller = await customerLogin('13900001002');

    const idxList = await req('/admin/indices', { headers: auth(adminToken) });
    assertOk(idxList);
    const idx = idxList.json.data.find((x) => x.code === 'H100-M') || idxList.json.data[0];

    const channels = await req('/admin/delivery-channels', { headers: auth(adminToken) });
    assertOk(channels);
    assert(channels.json.data.length >= 1, '需有交割通道');
    const channel = channels.json.data.find((c) => c.active) || channels.json.data[0];

    // 到期日落在窗口内（今天到期 → T-0）
    const expiry = todayShanghai();
    const open = await req('/admin/forwards', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        index_id: idx.id,
        buyer_id: buyer.user.id,
        seller_id: seller.user.id,
        qty: 1,
        strike_price: 100,
        expiry_date: expiry,
      },
    });
    assertOk(open);
    const cid = open.json.data.id;

    assertOk(
      await req(`/admin/forwards/${cid}/proxy-confirm`, {
        method: 'POST',
        headers: auth(adminToken),
        body: { side: 'buyer', note: '交割测买方' },
      }),
    );
    assertOk(
      await req(`/admin/forwards/${cid}/proxy-confirm`, {
        method: 'POST',
        headers: auth(adminToken),
        body: { side: 'seller', note: '交割测卖方' },
      }),
    );

    const reqDel = await req(`/customer/forwards/${cid}/delivery-request`, {
      method: 'POST',
      headers: auth(buyer.token),
      body: { channel_id: channel.id, note: '需真卡训练' },
    });
    assertOk(reqDel);
    const did = reqDel.json.data.id;

    assertOk(
      await req(`/admin/delivery-orders/${did}/approve`, {
        method: 'POST',
        headers: auth(adminToken),
        body: {},
      }),
    );
    assertOk(
      await req(`/admin/delivery-orders/${did}/complete`, {
        method: 'POST',
        headers: auth(adminToken),
      }),
    );

    const forwards = await req('/admin/forwards', { headers: auth(adminToken) });
    assertOk(forwards);
    const row = forwards.json.data.find((r) => r.id === cid);
    assert(row?.status === 'delivered', '合约应为 delivered');

    // 批结算应跳过该合约
    const settle = await req('/admin/forwards/settle-batch', {
      method: 'POST',
      headers: auth(adminToken),
      body: { asOf: expiry },
    });
    assertOk(settle);
    const hit = settle.json.data.find((r) => r.contract_id === cid);
    if (hit) assert(!hit.ok, '已交割合约不应现金结算成功');
  });

  it('窗口外或非白名单拒绝申请', ['V4-C2', 'V4-C3'], async () => {
    const { token: adminToken } = await adminLogin();
    const buyer = await customerLogin('13900001001');
    const seller = await customerLogin('13900001002');
    const idxList = await req('/admin/indices', { headers: auth(adminToken) });
    const idx = idxList.json.data[0];
    const channels = await req('/admin/delivery-channels', { headers: auth(adminToken) });
    const channel = channels.json.data[0];

    // 到期日在 30 天后 → 不在 T-7～T-0
    const expiry = addDaysShanghai(todayShanghai(), 30);
    const open = await req('/admin/forwards', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        index_id: idx.id,
        buyer_id: buyer.user.id,
        seller_id: seller.user.id,
        qty: 1,
        strike_price: 100,
        expiry_date: expiry,
      },
    });
    assertOk(open);
    const cid = open.json.data.id;
    await req(`/admin/forwards/${cid}/proxy-confirm`, {
      method: 'POST',
      headers: auth(adminToken),
      body: { side: 'buyer', note: 'x' },
    });
    await req(`/admin/forwards/${cid}/proxy-confirm`, {
      method: 'POST',
      headers: auth(adminToken),
      body: { side: 'seller', note: 'y' },
    });

    const bad = await req(`/customer/forwards/${cid}/delivery-request`, {
      method: 'POST',
      headers: auth(buyer.token),
      body: { channel_id: channel.id },
    });
    assertFail(bad);

    // 卖方默认未进白名单
    const sellerOnly = await req(`/customer/forwards/${cid}/delivery-request`, {
      method: 'POST',
      headers: auth(seller.token),
      body: { channel_id: channel.id },
    });
    assertFail(sellerOnly);
  });

  it('Dashboard 含实物占比字段', ['V4-C5'], async () => {
    const { token } = await adminLogin();
    const r = await req('/admin/dashboard', { headers: auth(token) });
    assertOk(r);
    assert(typeof r.json.data.delivered_contracts === 'number');
    assert(typeof r.json.data.physical_ratio_pct === 'number');
  });
});

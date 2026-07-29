import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail } from '../lib/assert.js';
import { adminLogin, brokerLogin, customerLogin, auth } from '../lib/auth.js';
import { todayShanghai, addDaysShanghai } from '../../src/utils/market.js';

async function ensureIndexPublished(token, settlePrice, preferredDate) {
  const list = await req('/admin/indices', { headers: auth(token) });
  assertOk(list);
  const idx = list.json.data.find((x) => x.code === 'H100-M') || list.json.data[0];
  assert(idx, '需要种子指数');

  for (let i = 0; i < 20; i++) {
    const date = addDaysShanghai(preferredDate, -i);
    const upsert = await req(`/admin/indices/${idx.id}/prints`, {
      method: 'POST',
      headers: auth(token),
      body: { date, settle_price: settlePrice },
    });
    if (upsert.json?.code !== 0) {
      // 已锁定则换更早一天
      continue;
    }
    if (upsert.json.data.status !== 'published') {
      const pub = await req(`/admin/indices/${idx.id}/prints/${date}/publish`, {
        method: 'POST',
        headers: auth(token),
      });
      if (pub.json?.code !== 0) continue;
    }
    return { idx, date };
  }
  throw new Error('无法找到可写入的结算价日期');
}

describe('V4 远期现金结算', ({ it }) => {
  it('涨价 1.5X：卖方应付买方', ['V4-B5', 'V4-ACCEPT-1'], async () => {
    const { token: adminToken } = await adminLogin();
    const buyer = await customerLogin('13900001001', { name: '买方·星云AI', company_name: '星云智能' });
    const seller = await customerLogin('13900001002', { name: '卖方·云海算力', company_name: '云海算力' });
    const X = 100;
    const { idx, date: expiry } = await ensureIndexPublished(adminToken, 150, addDaysShanghai(todayShanghai(), -20));

    const open = await req('/admin/forwards', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        index_id: idx.id,
        buyer_id: buyer.user.id,
        seller_id: seller.user.id,
        qty: 2,
        strike_price: X,
        expiry_date: expiry,
        confirm_hours: 72,
      },
    });
    assertOk(open);
    const cid = open.json.data.id;

    assertOk(
      await req(`/customer/forwards/${cid}/confirm`, {
        method: 'POST',
        headers: auth(buyer.token),
      }),
    );
    assertOk(
      await req(`/customer/forwards/${cid}/confirm`, {
        method: 'POST',
        headers: auth(seller.token),
      }),
    );

    const settle = await req('/admin/forwards/settle-batch', {
      method: 'POST',
      headers: auth(adminToken),
      body: { asOf: todayShanghai() },
    });
    assertOk(settle);
    const hit = settle.json.data.find((r) => r.contract_id === cid && r.ok);
    assert(hit, '应结算成功');
    assert(hit.pay_direction === 'seller_to_buyer', '涨价方向');
    assert(Number(hit.amount) === 100, `差价应为 100，实际 ${hit.amount}`);

    const bills = await req('/customer/settlement-bills', { headers: auth(buyer.token) });
    assertOk(bills);
    const bill = bills.json.data.find((b) => b.contract_id === cid);
    assert(bill && bill.cashflow === 'receive', '买方应收');
  });

  it('跌价 0.7X：买方应付卖方', ['V4-ACCEPT-2'], async () => {
    const { token: adminToken } = await adminLogin();
    const buyer = await customerLogin('13900001001');
    const seller = await customerLogin('13900001002');
    const X = 100;
    const { idx, date: expiry } = await ensureIndexPublished(adminToken, 70, addDaysShanghai(todayShanghai(), -40));

    const open = await req('/admin/forwards', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        index_id: idx.id,
        buyer_id: buyer.user.id,
        seller_id: seller.user.id,
        qty: 1,
        strike_price: X,
        expiry_date: expiry,
      },
    });
    assertOk(open);
    const cid = open.json.data.id;
    assertOk(
      await req(`/admin/forwards/${cid}/proxy-confirm`, {
        method: 'POST',
        headers: auth(adminToken),
        body: { side: 'buyer', note: '测试代理买方' },
      }),
    );
    assertOk(
      await req(`/admin/forwards/${cid}/proxy-confirm`, {
        method: 'POST',
        headers: auth(adminToken),
        body: { side: 'seller', note: '测试代理卖方' },
      }),
    );

    const settle = await req('/admin/forwards/settle-batch', {
      method: 'POST',
      headers: auth(adminToken),
      body: { asOf: todayShanghai() },
    });
    assertOk(settle);
    const hit = settle.json.data.find((r) => r.contract_id === cid && r.ok);
    assert(hit, '应结算成功');
    assert(hit.pay_direction === 'buyer_to_seller');
    assert(Number(hit.amount) === 30);
  });

  it('确认超时自动取消', ['V4-B3'], async () => {
    const { token: adminToken } = await adminLogin();
    const buyer = await customerLogin('13900001001');
    const seller = await customerLogin('13900001002');
    const list = await req('/admin/indices', { headers: auth(adminToken) });
    const idx = list.json.data[0];
    const open = await req('/admin/forwards', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        index_id: idx.id,
        buyer_id: buyer.user.id,
        seller_id: seller.user.id,
        qty: 1,
        strike_price: 100,
        expiry_date: addDaysShanghai(todayShanghai(), 30),
        confirm_hours: 1,
      },
    });
    assertOk(open);
    const cid = open.json.data.id;
    // 扫描时刻推到未来，模拟截止已过
    const future = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const exp = await req('/admin/forwards/expire-confirms', {
      method: 'POST',
      headers: auth(adminToken),
      body: { asOf: future },
    });
    assertOk(exp);
    assert(exp.json.data.cancelled >= 1, '应取消至少 1 笔');
    const all = await req('/admin/forwards', { headers: auth(adminToken) });
    const row = all.json.data.find((r) => r.id === cid);
    assert(row?.status === 'cancelled', '合约应变 cancelled');
  });

  it('已结算 S 不可改价', ['V4-A4'], async () => {
    const { token: adminToken } = await adminLogin();
    const bills = await req('/admin/settlement-bills', { headers: auth(adminToken) });
    assertOk(bills);
    const bill = bills.json.data[0];
    if (!bill) return;
    const idxId = bill.contract?.index_id;
    const date = bill.settle_price_date;
    if (!idxId || !date) return;
    const bad = await req(`/admin/indices/${idxId}/prints`, {
      method: 'POST',
      headers: auth(adminToken),
      body: { date, settle_price: 999999 },
    });
    assertFail(bad);
  });

  it('Dashboard 含北星字段', ['V4-B8'], async () => {
    const { token } = await brokerLogin();
    const r = await req('/admin/dashboard', { headers: auth(token) });
    assertOk(r);
    assert(typeof r.json.data.settled_contracts === 'number');
    assert(typeof r.json.data.pending_confirms === 'number');
  });
});

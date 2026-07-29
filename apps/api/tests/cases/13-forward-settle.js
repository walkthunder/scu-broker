import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail } from '../lib/assert.js';
import { customerLogin, adminLogin, auth, brokerLogin } from '../lib/auth.js';
import { todayShanghai, addDaysShanghai } from '../../src/utils/market.js';

async function ensureIndexPublished(token, settlePrice, preferredDate) {
  const list = await req('/admin/indices', { headers: auth(token) });
  assertOk(list);
  const idx = list.json.data.find((x) => x.code === 'H100-M') || list.json.data[0];
  assert(idx, '需要种子指数');

  for (let i = 0; i < 90; i++) {
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
    const buyer = await customerLogin('buyer@comprix.local');
    const seller = await customerLogin('seller@comprix.local');
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
    const buyer = await customerLogin('buyer@comprix.local');
    const seller = await customerLogin('seller@comprix.local');
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
    const buyer = await customerLogin('buyer@comprix.local');
    const seller = await customerLogin('seller@comprix.local');
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

  it('代理确认也拒绝超时合约', ['V4-B3'], async () => {
    const { token: adminToken } = await adminLogin();
    const buyer = await customerLogin('buyer@comprix.local');
    const seller = await customerLogin('seller@comprix.local');
    const list = await req('/admin/indices', { headers: auth(adminToken) });
    const idx = list.json.data[0];
    // 1 秒确认窗；等过截止后再代理确认（覆盖 MySQL DATETIME 秒精度）
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
        confirm_hours: 1 / 3600,
      },
    });
    assertOk(open);
    const cid = open.json.data.id;
    await new Promise((r) => setTimeout(r, 1500));
    const bad = await req(`/admin/forwards/${cid}/proxy-confirm`, {
      method: 'POST',
      headers: auth(adminToken),
      body: { side: 'buyer', note: '应被拒绝' },
    });
    assertFail(bad);
    const all = await req('/admin/forwards', { headers: auth(adminToken) });
    const row = all.json.data.find((r) => r.id === cid);
    assert(row?.status === 'cancelled', '超时代理确认后应取消');
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

  it('无已发布 S 不可开仓；卖方 MTM 符号相反', ['V4-FLOW'], async () => {
    const { token: adminToken } = await adminLogin();
    const buyer = await customerLogin('buyer@comprix.local');
    const seller = await customerLogin('seller@comprix.local');

    const list = await req('/admin/indices', { headers: auth(adminToken) });
    assertOk(list);
    const idx = list.json.data.find((x) => x.code === 'H100-M') || list.json.data[0];
    assert(idx, '需要种子指数');

    // 找一个没有 published 的指数：新建临时指数
    const skus = await req('/admin/skus', { headers: auth(adminToken) });
    assertOk(skus);
    const sku = skus.json.data.find((s) => s.name === 'H100') || skus.json.data[0];
    const code = `TMP-${Date.now().toString(36).slice(-6)}`;
    const created = await req('/admin/indices', {
      method: 'POST',
      headers: auth(adminToken),
      body: { code, name: '临时无S', sku_id: sku.id, jump_threshold_pct: 20 },
    });
    assertOk(created);
    const bareId = created.json.data.id;

    const bad = await req('/admin/forwards', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        index_id: bareId,
        buyer_id: buyer.user.id,
        seller_id: seller.user.id,
        qty: 1,
        strike_price: 100,
        expiry_date: addDaysShanghai(todayShanghai(), 30),
      },
    });
    assertFail(bad);
    assert(String(bad.json.message || '').includes('已发布'), '应提示无已发布 S');

    const X = 100;
    const { idx: ready, date: expiry } = await ensureIndexPublished(
      adminToken,
      130,
      addDaysShanghai(todayShanghai(), 14),
    );
    const open = await req('/admin/forwards', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        index_id: ready.id,
        buyer_id: buyer.user.id,
        seller_id: seller.user.id,
        qty: 1,
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

    const buyerList = await req('/customer/forwards', { headers: auth(buyer.token) });
    const sellerList = await req('/customer/forwards', { headers: auth(seller.token) });
    assertOk(buyerList);
    assertOk(sellerList);
    const bRow = buyerList.json.data.find((r) => r.id === cid);
    const sRow = sellerList.json.data.find((r) => r.id === cid);
    assert(bRow?.mtm && sRow?.mtm, '双方应有 MTM');
    assert(
      Number(bRow.mtm.signed_amount) === -Number(sRow.mtm.signed_amount),
      `买卖双方 MTM 应相反：${bRow.mtm.signed_amount} vs ${sRow.mtm.signed_amount}`,
    );
  });
});

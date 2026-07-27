import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk } from '../lib/assert.js';
import { adminLogin, brokerLogin, customerLogin, auth } from '../lib/auth.js';

describe('Dashboard / 通知 / 隔离', ({ it }) => {
  it('Dashboard 返回关键字段', ['R-P1-8', 'R-ACCEPT-1'], async () => {
    const { token } = await adminLogin();
    const r = await req('/admin/dashboard', { headers: auth(token) });
    assertOk(r);
    const d = r.json.data;
    assert(typeof d.today_rfqs === 'number', 'today_rfqs');
    assert(typeof d.pending_rfqs === 'number', 'pending_rfqs');
    assert(typeof d.month_orders === 'number', 'month_orders');
    assert(typeof d.month_amount === 'number', 'month_amount');
    assert(Array.isArray(d.recent_pending), 'recent_pending');
  });

  it('Broker 可访问 Dashboard', ['R-P1-8'], async () => {
    const { token } = await brokerLogin();
    const r = await req('/admin/dashboard', { headers: auth(token) });
    assertOk(r);
  });

  it('客户 Token 不能访问后台 API', ['R-AUTH-2'], async () => {
    const { token } = await customerLogin(`128${String(Date.now()).slice(-8)}`);
    const r = await req('/admin/dashboard', { headers: auth(token) });
    assert(r.status === 403 || r.json?.code !== 0, 'customer blocked from admin');
  });

  it('统一错误体不含 stack', ['R-INFRA'], async () => {
    const r = await req('/admin/login', {
      method: 'POST',
      body: { phone: '13800000000', password: 'bad' },
    });
    assert(r.json?.message, 'has message');
    assert(!('stack' in (r.json || {})), 'no stack');
    const raw = JSON.stringify(r.json);
    assert(!raw.includes('at '), 'no stack frames');
  });

  it('通知：新询价不抛错（开发环境写日志）', ['R-P1-9'], async () => {
    const { token } = await customerLogin(`127${String(Date.now()).slice(-8)}`, {
      company_name: '通知测试公司',
    });
    const skus = await req('/customer/skus');
    const r = await req('/customer/rfqs', {
      method: 'POST',
      headers: auth(token),
      body: { sku_id: skus.json.data[0].id, quantity: 1, note: 'trigger notify' },
    });
    assertOk(r);
  });
});

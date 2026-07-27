import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail, assertEq } from '../lib/assert.js';
import { customerLogin, adminLogin, brokerLogin, auth } from '../lib/auth.js';

describe('鉴权 Auth', ({ it }) => {
  it('健康检查', ['R-INFRA'], async () => {
    const r = await req('/health');
    assertOk(r);
    assert(r.json.data?.service === 'comprix-api', 'service name');
  });

  it('客户 OTP + 登录成功', ['R-AUTH-1'], async () => {
    const phone = `139${String(Date.now()).slice(-8)}`;
    const { token, user } = await customerLogin(phone, { name: '新客户', company_name: '新公司' });
    assert(!!token, 'token');
    assertEq(user.role, 'customer', 'role customer');
    assertEq(user.phone, phone, 'phone');
  });

  it('错误验证码拒绝', ['R-AUTH-1'], async () => {
    const phone = `139${String(Date.now() + 1).slice(-8)}`;
    await req('/customer/otp', { method: 'POST', body: { phone } });
    const bad = await req('/customer/login', {
      method: 'POST',
      body: { phone, code: '000000' },
    });
    assertFail(bad, 'bad otp');
  });

  it('非法手机号拒绝 OTP', ['R-AUTH-1'], async () => {
    const bad = await req('/customer/otp', { method: 'POST', body: { phone: '12345' } });
    assertFail(bad);
  });

  it('Admin 密码登录', ['R-AUTH-2'], async () => {
    const { token, user } = await adminLogin();
    assert(!!token, 'token');
    assertEq(user.role, 'admin');
  });

  it('Broker 密码登录', ['R-AUTH-2'], async () => {
    const { user } = await brokerLogin('13800000001');
    assertEq(user.role, 'broker');
  });

  it('Admin 错误密码拒绝', ['R-AUTH-2'], async () => {
    const r = await req('/admin/login', {
      method: 'POST',
      body: { phone: '13800000000', password: 'wrong' },
    });
    assertFail(r);
  });

  it('纯客户号不能后台登录', ['R-AUTH-2'], async () => {
    const phone = `138${String(Date.now()).slice(-8)}`;
    await customerLogin(phone);
    const r = await req('/admin/login', {
      method: 'POST',
      body: { phone, password: 'anything' },
    });
    assertFail(r);
  });

  it('Broker 号可客户前台 OTP 登录并保留角色', ['R-AUTH-3', 'R-GAP-PHONE'], async () => {
    const { user } = await customerLogin('13800000002', { name: '李自测' });
    assertEq(user.role, 'broker');
  });

  it('/me 需登录', ['R-AUTH-1'], async () => {
    const r = await req('/me');
    assert(r.status === 401 || r.json?.code !== 0, 'unauthorized');
  });

  it('/me 返回当前用户', ['R-AUTH-1'], async () => {
    const { token, user } = await customerLogin(`137${String(Date.now()).slice(-8)}`);
    const me = await req('/me', { headers: auth(token) });
    assertOk(me);
    assertEq(me.json.data.id, user.id);
  });
});

import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail } from '../lib/assert.js';
import {
  customerLogin,
  customerRegister,
  ensureCustomer,
  adminLogin,
  brokerLogin,
  auth,
  DEFAULT_PASSWORD,
} from '../lib/auth.js';

describe('鉴权 Auth', ({ it }) => {
  it('健康检查', ['R-INFRA'], async () => {
    const r = await req('/health');
    assertOk(r);
  });

  it('客户邮箱注册 + 登录成功', ['R-AUTH-1'], async () => {
    const email = `u${Date.now()}@test.local`;
    const { token, user } = await customerRegister(email, DEFAULT_PASSWORD, {
      name: '新客户',
      company_name: '新公司',
    });
    assert(token);
    assert(user.email === email);
    assert(user.role === 'customer');
  });

  it('错误密码拒绝', ['R-AUTH-1'], async () => {
    const email = `bad${Date.now()}@test.local`;
    await customerRegister(email);
    const bad = await req('/customer/login', {
      method: 'POST',
      body: { email, password: 'wrong-pass' },
    });
    assertFail(bad);
  });

  it('非法邮箱拒绝注册 OTP', ['R-AUTH-1'], async () => {
    const bad = await req('/customer/register/otp', {
      method: 'POST',
      body: { email: 'not-an-email' },
    });
    assertFail(bad);
  });

  it('Admin 密码登录', ['R-AUTH-2'], async () => {
    const { token, user } = await adminLogin();
    assert(token);
    assert(user.role === 'admin');
  });

  it('客户前台可用管理员手机号+密码登录', ['R-AUTH-1'], async () => {
    const r = await req('/customer/login', {
      method: 'POST',
      body: { phone: '13800000000', password: 'admin123' },
    });
    assertOk(r);
    assert(r.json.data.user.role === 'admin');
    assert(r.json.data.user.phone === '13800000000');
  });

  it('Broker 密码登录', ['R-AUTH-2'], async () => {
    const { token, user } = await brokerLogin();
    assert(token);
    assert(user.role === 'broker');
  });

  it('Admin 错误密码拒绝', ['R-AUTH-2'], async () => {
    const r = await req('/admin/login', {
      method: 'POST',
      body: { phone: '13800000000', password: 'wrong' },
    });
    assertFail(r);
  });

  it('纯客户号不能后台登录', ['R-AUTH-2'], async () => {
    const r = await req('/admin/login', {
      method: 'POST',
      body: { phone: '13900001001', password: DEFAULT_PASSWORD },
    });
    assertFail(r);
  });

  it('Broker 邮箱可客户前台登录并保留角色', ['R-AUTH-3', 'R-GAP-PHONE'], async () => {
    const { user } = await customerLogin('13800000002@comprix.local', 'broker123');
    assert(user.role === 'broker');
  });

  it('/me 需登录', ['R-AUTH-1'], async () => {
    const r = await req('/me');
    assertFail(r);
  });

  it('/me 返回当前用户', ['R-AUTH-1'], async () => {
    const { token, user } = await ensureCustomer(`me${Date.now()}@test.local`);
    const r = await req('/me', { headers: auth(token) });
    assertOk(r);
    assert(r.json.data.id === user.id);
    assert(r.json.data.email === user.email);
  });

  it('忘记密码重置后可登录', ['R-AUTH-1'], async () => {
    const email = `rst${Date.now()}@test.local`;
    await customerRegister(email, DEFAULT_PASSWORD);
    const otp = await req('/customer/password/forgot-otp', {
      method: 'POST',
      body: { email },
    });
    assertOk(otp);
    const code = otp.json.data?.dev_otp || process.env.DEV_OTP || '123456';
    assertOk(
      await req('/customer/password/reset', {
        method: 'POST',
        body: { email, code, password: 'NewPass99!' },
      }),
    );
    assertOk(
      await req('/customer/login', {
        method: 'POST',
        body: { email, password: 'NewPass99!' },
      }),
    );
  });

  it('登录后可改密', ['R-AUTH-1'], async () => {
    const email = `chg${Date.now()}@test.local`;
    const { token } = await customerRegister(email, DEFAULT_PASSWORD);
    assertOk(
      await req('/customer/password/change', {
        method: 'POST',
        headers: auth(token),
        body: { old_password: DEFAULT_PASSWORD, new_password: 'Changed1!' },
      }),
    );
    assertOk(
      await req('/customer/login', {
        method: 'POST',
        body: { email, password: 'Changed1!' },
      }),
    );
  });
});

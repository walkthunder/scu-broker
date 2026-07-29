import { req, auth } from './http.js';
import { assertOk } from './assert.js';

const DEFAULT_PASSWORD = 'Pass1234!';

/** 种子账号 / 已存在用户：邮箱+密码登录 */
export async function customerLogin(email, password = DEFAULT_PASSWORD) {
  const login = await req('/customer/login', {
    method: 'POST',
    body: { email, password },
  });
  assertOk(login, `customer login ${email}`);
  return { token: login.json.data.token, user: login.json.data.user };
}

/** 新客户：发码注册并登录（功能测试临时账号） */
export async function customerRegister(email, password = DEFAULT_PASSWORD, extra = {}) {
  const otp = await req('/customer/register/otp', {
    method: 'POST',
    body: { email },
  });
  assertOk(otp, `register otp ${email}`);
  const code = otp.json.data?.dev_otp || process.env.DEV_OTP || '123456';
  const reg = await req('/customer/register', {
    method: 'POST',
    body: {
      email,
      password,
      code,
      name: extra.name,
      company_name: extra.company_name,
      phone: extra.phone,
    },
  });
  assertOk(reg, `register ${email}`);
  return { token: reg.json.data.token, user: reg.json.data.user };
}

/** 兼容旧用例：无密码时按注册；有种子邮箱则登录 */
export async function ensureCustomer(email, password = DEFAULT_PASSWORD, extra = {}) {
  const login = await req('/customer/login', {
    method: 'POST',
    body: { email, password },
  });
  if (login.json?.code === 0) {
    return { token: login.json.data.token, user: login.json.data.user };
  }
  return customerRegister(email, password, extra);
}

export async function adminLogin(phone = '13800000000', password = 'admin123') {
  const login = await req('/admin/login', { method: 'POST', body: { phone, password } });
  assertOk(login, `admin login ${phone}`);
  return { token: login.json.data.token, user: login.json.data.user };
}

export async function brokerLogin(phone = '13800000001', password = 'broker123') {
  return adminLogin(phone, password);
}

export { auth, DEFAULT_PASSWORD };

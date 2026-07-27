import { req, auth } from './http.js';
import { assertOk } from './assert.js';

export async function customerLogin(phone, extra = {}) {
  const otp = await req('/customer/otp', { method: 'POST', body: { phone } });
  assertOk(otp, `otp for ${phone}`);
  const code = otp.json.data?.dev_otp || process.env.DEV_OTP || '123456';
  const login = await req('/customer/login', {
    method: 'POST',
    body: { phone, code, ...extra },
  });
  assertOk(login, `customer login ${phone}`);
  return { token: login.json.data.token, user: login.json.data.user };
}

export async function adminLogin(phone = '13800000000', password = 'admin123') {
  const login = await req('/admin/login', { method: 'POST', body: { phone, password } });
  assertOk(login, `admin login ${phone}`);
  return { token: login.json.data.token, user: login.json.data.user };
}

export async function brokerLogin(phone = '13800000001', password = 'broker123') {
  return adminLogin(phone, password);
}

export { auth };

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { config } from '../config/index.js';
import { User, OtpCode } from '../models/index.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { AppError, ok } from '../utils/errors.js';
import { sendEmail } from '../services/notify.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MIN_PASSWORD = 8;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function assertEmail(email) {
  if (!EMAIL_RE.test(email)) throw new AppError('邮箱格式不正确');
}

function assertPassword(password) {
  if (!password || String(password).length < MIN_PASSWORD) {
    throw new AppError(`密码至少 ${MIN_PASSWORD} 位`);
  }
}

function randomOtp() {
  if (config.nodeEnv === 'development' && !config.smtp?.host) return config.devOtp;
  return String(Math.floor(100000 + Math.random() * 900000));
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    company_name: user.company_name,
    role: user.role,
  };
}

async function issueEmailOtp(email, purpose) {
  assertEmail(email);
  const code = randomOtp();
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await OtpCode.create({ email, purpose, code, expires_at: expires });
  const subject =
    purpose === 'reset' ? 'CompriX 重置密码验证码' : 'CompriX 注册验证码';
  await sendEmail({
    to: email,
    subject,
    text: `您的验证码是 ${code}，10分钟内有效。`,
  });
  const exposeDev =
    config.nodeEnv === 'development' && !config.smtp?.host;
  return {
    sent: true,
    ...(exposeDev ? { dev_otp: code } : {}),
  };
}

async function consumeOtp(email, purpose, code) {
  const otp = await OtpCode.findOne({
    where: {
      email,
      purpose,
      code: String(code || '').trim(),
      used: false,
      expires_at: { [Op.gt]: new Date() },
    },
    order: [['id', 'DESC']],
  });
  if (!otp) throw new AppError('验证码无效或已过期', 400, 'INVALID_OTP');
  otp.used = true;
  await otp.save();
  return otp;
}

router.post('/customer/register/otp', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    assertEmail(email);
    const exists = await User.findOne({ where: { email } });
    if (exists) throw new AppError('该邮箱已注册');
    ok(res, await issueEmailOtp(email, 'register'));
  } catch (e) {
    next(e);
  }
});

router.post('/customer/register', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const code = String(req.body.code || '').trim();
    assertEmail(email);
    assertPassword(password);
    if (!code) throw new AppError('请输入验证码');

    const exists = await User.findOne({ where: { email } });
    if (exists) throw new AppError('该邮箱已注册');

    await consumeOtp(email, 'register', code);

    const phoneRaw = req.body.phone ? String(req.body.phone).trim() : '';
    if (phoneRaw && !/^1\d{10}$/.test(phoneRaw)) throw new AppError('手机号格式不正确');
    if (phoneRaw) {
      const phoneTaken = await User.findOne({ where: { phone: phoneRaw } });
      if (phoneTaken) throw new AppError('该手机号已被占用');
    }

    const user = await User.create({
      email,
      phone: phoneRaw || null,
      name: req.body.name ? String(req.body.name).trim() : null,
      company_name: req.body.company_name ? String(req.body.company_name).trim() : null,
      password_hash: await bcrypt.hash(password, 10),
      role: 'customer',
    });

    const token = signToken(user);
    ok(res, { token, user: publicUser(user) }, '注册成功');
  } catch (e) {
    next(e);
  }
});

router.post('/customer/login', async (req, res, next) => {
  try {
    const account = String(req.body.email || req.body.phone || '').trim();
    const password = String(req.body.password || '');
    if (!account) throw new AppError('请输入邮箱或手机号');
    if (!password) throw new AppError('请输入密码');

    let user = null;
    const asEmail = account.toLowerCase();
    if (EMAIL_RE.test(asEmail)) {
      user = await User.findOne({ where: { email: asEmail } });
    } else if (/^1\d{10}$/.test(account)) {
      user = await User.findOne({ where: { phone: account } });
    } else {
      throw new AppError('请输入正确的邮箱或11位手机号');
    }

    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('账号或密码错误', 401);
    }

    const token = signToken(user);
    ok(res, { token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/customer/password/forgot-otp', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    assertEmail(email);
    const user = await User.findOne({ where: { email } });
    // 不泄露是否存在
    if (user) {
      ok(res, await issueEmailOtp(email, 'reset'));
    } else {
      ok(res, {
        sent: true,
        ...(config.nodeEnv === 'development' && !config.smtp?.host
          ? { dev_otp: null, hint: '若邮箱已注册将收到验证码' }
          : {}),
      });
    }
  } catch (e) {
    next(e);
  }
});

router.post('/customer/password/reset', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const code = String(req.body.code || '').trim();
    assertEmail(email);
    assertPassword(password);
    await consumeOtp(email, 'reset', code);
    const user = await User.findOne({ where: { email } });
    if (!user) throw new AppError('用户不存在', 404);
    user.password_hash = await bcrypt.hash(password, 10);
    await user.save();
    ok(res, { ok: true }, '密码已重置');
  } catch (e) {
    next(e);
  }
});

router.post('/customer/password/change', authRequired, async (req, res, next) => {
  try {
    const oldPassword = String(req.body.old_password || '');
    const newPassword = String(req.body.new_password || '');
    assertPassword(newPassword);
    const user = req.user;
    if (!user.password_hash || !(await bcrypt.compare(oldPassword, user.password_hash))) {
      throw new AppError('旧密码不正确');
    }
    user.password_hash = await bcrypt.hash(newPassword, 10);
    await user.save();
    ok(res, { ok: true }, '密码已修改');
  } catch (e) {
    next(e);
  }
});

router.post('/admin/login', async (req, res, next) => {
  try {
    const account = String(req.body.phone || req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!account || !password) throw new AppError('请输入账号和密码');

    let user = null;
    const asEmail = account.toLowerCase();
    if (EMAIL_RE.test(asEmail)) {
      user = await User.findOne({ where: { email: asEmail } });
    } else {
      user = await User.findOne({ where: { phone: account } });
    }

    if (!user || !['broker', 'admin'].includes(user.role)) {
      throw new AppError('账号或密码错误', 401);
    }
    if (!user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('账号或密码错误', 401);
    }
    const token = signToken(user);
    ok(res, {
      token,
      user: publicUser(user),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authRequired, async (req, res) => {
  ok(res, publicUser(req.user));
});

export default router;

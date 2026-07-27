import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { config } from '../config/index.js';
import { User, OtpCode } from '../models/index.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { AppError, ok } from '../utils/errors.js';
import { sendSms } from '../services/notify.js';

const router = Router();

function randomOtp() {
  if (!config.smsEnabled) return config.devOtp;
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post('/customer/otp', async (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').trim();
    if (!/^1\d{10}$/.test(phone)) throw new AppError('手机号格式不正确');
    const code = randomOtp();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await OtpCode.create({ phone, code, expires_at: expires });
    await sendSms({ phone, text: `您的登录验证码是 ${code}，10分钟内有效。` });
    ok(res, {
      sent: true,
      ...(config.nodeEnv === 'development' && !config.smsEnabled ? { dev_otp: code } : {}),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/customer/login', async (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const code = String(req.body.code || '').trim();
    const name = req.body.name ? String(req.body.name).trim() : null;
    const company_name = req.body.company_name
      ? String(req.body.company_name).trim()
      : null;

    if (!/^1\d{10}$/.test(phone)) throw new AppError('手机号格式不正确');
    if (!code) throw new AppError('请输入验证码');

    const otp = await OtpCode.findOne({
      where: {
        phone,
        code,
        used: false,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [['id', 'DESC']],
    });
    if (!otp) throw new AppError('验证码无效或已过期', 400, 'INVALID_OTP');

    let user = await User.findOne({ where: { phone } });
    if (!user) {
      user = await User.create({
        phone,
        name,
        company_name,
        role: 'customer',
      });
    } else {
      // 同一手机号可进客户前台（Broker/Admin 亦可自测客户流程）；后台仍用密码登录
      if (name) user.name = name;
      if (company_name) user.company_name = company_name;
      await user.save();
    }

    otp.used = true;
    await otp.save();

    const token = signToken(user);
    ok(res, {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        company_name: user.company_name,
        role: user.role,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/login', async (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');
    if (!phone || !password) throw new AppError('请输入手机号和密码');
    const user = await User.findOne({ where: { phone } });
    if (!user || !['broker', 'admin'].includes(user.role)) {
      throw new AppError('账号或密码错误', 401);
    }
    if (!user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('账号或密码错误', 401);
    }
    const token = signToken(user);
    ok(res, {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authRequired, async (req, res) => {
  ok(res, {
    id: req.user.id,
    phone: req.user.phone,
    name: req.user.name,
    company_name: req.user.company_name,
    email: req.user.email,
    role: req.user.role,
  });
});

export default router;

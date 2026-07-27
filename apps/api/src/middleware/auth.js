import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { User } from '../models/index.js';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export async function authRequired(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('未登录', 401, 'UNAUTHORIZED');
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findByPk(payload.id);
    if (!user) throw new AppError('用户不存在', 401, 'UNAUTHORIZED');
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('登录已失效', 401, 'UNAUTHORIZED'));
  }
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('无权限', 403, 'FORBIDDEN'));
    }
    next();
  };
}

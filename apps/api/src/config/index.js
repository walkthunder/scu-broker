import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'comprix',
    user: process.env.DB_USER || 'comprix',
    password: process.env.DB_PASSWORD || 'comprix_dev',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  uploadDir: path.resolve(
    process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads'),
  ),
  /** 公网路径前缀，如 `/scu`；空表示根路径部署 */
  publicPathPrefix: String(process.env.PUBLIC_PATH_PREFIX || '').replace(/\/$/, ''),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@comprix.local',
  },
  smsEnabled: process.env.SMS_ENABLED === 'true',
  devOtp: process.env.DEV_OTP || '123456',
  admin: {
    phone: process.env.ADMIN_PHONE || '13800000000',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    name: process.env.ADMIN_NAME || '管理员',
  },
};

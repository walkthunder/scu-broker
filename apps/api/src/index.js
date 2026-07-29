import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/index.js';
import { sequelize } from './config/database.js';
import './models/index.js';
import { errorHandler } from './utils/errors.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customer.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(config.uploadDir));

app.get('/api/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { service: 'comprix-api' } });
});

app.use('/api', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

async function ensureDealFeedOrderIdNullable() {
  try {
    const [rows] = await sequelize.query(
      `SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deal_feeds' AND COLUMN_NAME = 'order_id'`,
    );
    if (rows?.[0]?.IS_NULLABLE === 'NO') {
      const [fks] = await sequelize.query(
        `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deal_feeds'
           AND COLUMN_NAME = 'order_id' AND REFERENCED_TABLE_NAME IS NOT NULL`,
      );
      for (const fk of fks || []) {
        await sequelize.query(
          `ALTER TABLE \`deal_feeds\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
        );
      }
      await sequelize.query(
        'ALTER TABLE `deal_feeds` MODIFY COLUMN `order_id` INT UNSIGNED NULL',
      );
    }
  } catch {
    /* table may not exist yet; sync will create */
  }
}

async function ensureOtpCodesEmailSchema() {
  try {
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_codes'`,
    );
    const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
    if (names.has('phone') && !names.has('email')) {
      await sequelize.query('DROP TABLE IF EXISTS `otp_codes`');
    }
  } catch {
    /* ignore */
  }
}

async function ensureForwardDeliveryPendingStatus() {
  try {
    await sequelize.query(
      "ALTER TABLE `forward_contracts` MODIFY COLUMN `status` ENUM('draft','pending_confirm','open','delivery_pending','settled','delivered','cancelled') NOT NULL DEFAULT 'pending_confirm'",
    );
  } catch {
    /* sync alter may handle */
  }
}

async function start() {
  await sequelize.authenticate();
  await ensureDealFeedOrderIdNullable();
  await ensureOtpCodesEmailSchema();
  await ensureForwardDeliveryPendingStatus();
  await sequelize.sync({ alter: true });
  app.listen(config.port, () => {
    console.log(`CompriX API listening on :${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});

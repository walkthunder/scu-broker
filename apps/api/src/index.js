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
import frdRoutes from './routes/frd.js';

const app = express();
app.set('etag', false);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// 禁止 CDN/浏览器缓存 API（腾讯云等会对带 ETag 的 GET 做边缘缓存）
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use('/uploads', express.static(config.uploadDir));

app.get('/api/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { service: 'comprix-api' } });
});

app.use('/api', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/frd', frdRoutes);

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

async function ensureDeliveryOrderContractNullable() {
  try {
    const [fks] = await sequelize.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_orders'
         AND COLUMN_NAME = 'contract_id' AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    for (const fk of fks || []) {
      await sequelize.query(
        `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
      );
    }
    const [rows] = await sequelize.query(
      `SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_orders' AND COLUMN_NAME = 'contract_id'`,
    );
    if (rows?.[0] && rows[0].IS_NULLABLE === 'NO') {
      await sequelize.query(
        'ALTER TABLE `delivery_orders` MODIFY COLUMN `contract_id` INT UNSIGNED NULL',
      );
    }
  } catch {
    /* ignore */
  }
}

/** 存量库补列（默认 sync 不加列）；仅 ADD，不 alter 整表 */
async function ensureColumn(table, column, addSql) {
  try {
    const [rows] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      { replacements: [table, column] },
    );
    if (rows?.length) return;
    await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN ${addSql}`);
    console.log(`[schema] added ${table}.${column}`);
  } catch (e) {
    console.warn(`[schema] ensure ${table}.${column}:`, e.message);
  }
}

async function ensureModifyColumn(table, column, modifySql) {
  try {
    await sequelize.query(`ALTER TABLE \`${table}\` MODIFY COLUMN ${modifySql}`);
    console.log(`[schema] modified ${table}.${column}`);
  } catch (e) {
    console.warn(`[schema] modify ${table}.${column}:`, e.message);
  }
}

async function ensureFrdColumns() {
  await ensureColumn(
    'users',
    'source',
    "`source` ENUM('friend','partner','sales','event','other') NULL",
  );
  await ensureColumn(
    'users',
    'blacklisted',
    '`blacklisted` TINYINT(1) NOT NULL DEFAULT 0',
  );
  await ensureColumn('users', 'supplier_id', '`supplier_id` INT UNSIGNED NULL');
  // 存量 ENUM 无 partner 时登录/伙伴账号会失败
  await ensureModifyColumn(
    'users',
    'role',
    "`role` ENUM('customer','broker','admin','partner') NOT NULL DEFAULT 'customer'",
  );
  await ensureColumn(
    'rfqs',
    'region',
    "`region` VARCHAR(32) NOT NULL DEFAULT 'shanghai'",
  );
  await ensureColumn(
    'price_indices',
    'region',
    "`region` VARCHAR(32) NOT NULL DEFAULT 'shanghai'",
  );
  await ensureColumn(
    'index_prints',
    'sample_count',
    '`sample_count` INT UNSIGNED NULL',
  );
  await ensureColumn(
    'index_prints',
    'is_reference',
    '`is_reference` TINYINT(1) NOT NULL DEFAULT 0',
  );
  await ensureColumn(
    'index_prints',
    'calculated_by',
    '`calculated_by` INT UNSIGNED NULL',
  );
  await ensureColumn(
    'index_prints',
    'reviewed_by',
    '`reviewed_by` INT UNSIGNED NULL',
  );
  await ensureModifyColumn(
    'index_prints',
    'source',
    "`source` ENUM('price_mid','manual','engine','reference') NOT NULL DEFAULT 'price_mid'",
  );
  await ensureColumn(
    'reference_prices',
    'region',
    "`region` VARCHAR(32) NOT NULL DEFAULT 'shanghai'",
  );
  await ensureColumn(
    'forward_contracts',
    'region',
    "`region` VARCHAR(32) NOT NULL DEFAULT 'shanghai'",
  );
  await ensureColumn(
    'forward_contracts',
    'contract_code',
    '`contract_code` VARCHAR(64) NULL',
  );
  await ensureColumn(
    'forward_contracts',
    'delivery_month',
    '`delivery_month` VARCHAR(7) NULL',
  );
  await ensureColumn(
    'forward_contracts',
    'basis_rate',
    '`basis_rate` DECIMAL(8,2) NULL DEFAULT -20',
  );
  await ensureColumn(
    'forward_contracts',
    'spot_ref_at_open',
    '`spot_ref_at_open` DECIMAL(14,2) NULL',
  );
  await ensureColumn(
    'forward_contracts',
    'margin_initial_pct',
    '`margin_initial_pct` DECIMAL(8,2) NULL DEFAULT 15',
  );
  await ensureColumn(
    'forward_contracts',
    'margin_maintain_pct',
    '`margin_maintain_pct` DECIMAL(8,2) NULL DEFAULT 8',
  );
  await ensureColumn(
    'forward_contracts',
    'margin_frozen',
    '`margin_frozen` DECIMAL(16,2) NULL DEFAULT 0',
  );
  await ensureColumn(
    'forward_contracts',
    'delivery_intent',
    "`delivery_intent` ENUM('unset','cash','physical') NOT NULL DEFAULT 'unset'",
  );
  await ensureColumn(
    'delivery_orders',
    'right_contract_id',
    '`right_contract_id` INT UNSIGNED NULL',
  );
  await ensureColumn(
    'delivery_orders',
    'spot_fill_id',
    '`spot_fill_id` INT UNSIGNED NULL',
  );
  await ensureModifyColumn(
    'delivery_orders',
    'status',
    "`status` ENUM('pending','approved','in_delivery','done','rejected','reconciled') NOT NULL DEFAULT 'pending'",
  );
}

/** 依赖 sequelize.sync 已建表后的约束 */
async function ensureFrdPostSync() {
  try {
    const [idx] = await sequelize.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mtm_statements'
         AND INDEX_NAME = 'uniq_mtm_user_date_ref'`,
    );
    if (!idx?.length) {
      await sequelize.query(
        'CREATE UNIQUE INDEX `uniq_mtm_user_date_ref` ON `mtm_statements` (`user_id`,`date`,`ref_type`,`ref_id`)',
      );
    }
  } catch (e) {
    console.warn('[schema] mtm unique:', e.message);
  }
}

/** Sequelize alter:true 会在 MySQL 上反复叠加 UNIQUE/INDEX，超过 64 后启动失败 */
async function pruneDuplicateUserPhoneIndexes() {
  try {
    const [idxs] = await sequelize.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'
         AND NON_UNIQUE = 0 AND INDEX_NAME != 'PRIMARY'`,
    );
    const names = [...new Set((idxs || []).map((r) => r.INDEX_NAME))];
    // 保留一个 phone 唯一索引，丢掉 alter 堆积的副本
    for (const name of names.slice(1)) {
      await sequelize.query(`ALTER TABLE \`users\` DROP INDEX \`${name}\``);
    }
  } catch {
    /* ignore */
  }
}

async function start() {
  await sequelize.authenticate();
  await ensureDealFeedOrderIdNullable();
  await ensureOtpCodesEmailSchema();
  await ensureForwardDeliveryPendingStatus();
  await ensureDeliveryOrderContractNullable();
  await pruneDuplicateUserPhoneIndexes();
  // 先补已有表缺列，再 sync：否则会按模型建含新列的 UNIQUE，而列尚不存在
  await ensureFrdColumns();
  // 默认不 alter：避免 FK/UNIQUE 无限叠加。需要改表时用 npm run db:sync 或 DB_SYNC_ALTER=1
  const alter = process.env.DB_SYNC_ALTER === '1';
  await sequelize.sync(alter ? { alter: true } : undefined);
  await ensureFrdPostSync();
  const { startFrdScheduler } = await import('./jobs/scheduler.js');
  startFrdScheduler();
  app.listen(config.port, () => {
    console.log(`CompriX API listening on :${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});

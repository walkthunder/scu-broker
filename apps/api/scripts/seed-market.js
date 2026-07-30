/**
 * 仅补齐/回填行情大厅数据（幂等，不重置账号）。
 * 用法：node scripts/seed-market.js
 * 环境变量：MARKET_HISTORY_DAYS=21（默认）
 */
import { sequelize } from '../src/config/database.js';
import {
  backfillMarketHistory,
  ensureMarketDay,
} from '../src/services/ensure-market-day.js';

async function main() {
  await sequelize.authenticate();
  const days = Math.max(7, Number(process.env.MARKET_HISTORY_DAYS || 21));
  const hist = await backfillMarketHistory(days);
  const day = await ensureMarketDay();
  console.log('Market seed done:', JSON.stringify({ hist, day }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

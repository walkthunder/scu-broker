#!/usr/bin/env node
/**
 * CompriX 全量功能测试入口
 * 覆盖 docs/REQUIREMENTS.md + docs/PRODUCT_V3.md（已落地的 Phase A/B 能力）。
 *
 *   npm run db:seed && npm run test:functional
 */
import { req } from './lib/http.js';
import { runAll } from './lib/runner.js';

async function waitApi(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await req('/health');
      if (r.json?.code === 0) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API 不可达，请先启动 apps/api (npm run dev)');
}

// 动态加载全部 cases（注册到 runner）
await import('./cases/01-auth.js');
await import('./cases/02-master-data.js');
await import('./cases/03-reference-prices.js');
await import('./cases/04-rfq.js');
await import('./cases/05-quote.js');
await import('./cases/06-order.js');
await import('./cases/07-finance.js');
await import('./cases/08-attachment.js');
await import('./cases/09-dashboard-security.js');
await import('./cases/10-v3-market.js');
await import('./cases/11-v3-ops.js');

console.log('CompriX Functional Suite');
console.log('API:', process.env.API_BASE || 'http://127.0.0.1:3000/api');

await waitApi();
const summary = await runAll();

if (summary.failed > 0) {
  process.exitCode = 1;
}

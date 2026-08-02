/**
 * 幂等铺演示现货挂单（H100 · 上海默认）。
 * 用法：cd apps/api && node scripts/seed-spot-book-demo.js
 */
import { Op } from 'sequelize';
import { sequelize } from '../src/config/database.js';
import { User } from '../src/models/index.js';
import { SpotBookOrder } from '../src/models/frd-models.js';
import {
  placeSpotOrder,
  cancelSpotOrder,
  getOrderBook,
} from '../src/services/spot-book.js';
import { resolveMarketQuote } from '../src/services/market-resolve.js';
import { getBuyingPower, adminDeposit } from '../src/services/ledger.js';

const sku_id = Number(process.env.DEMO_SKU_ID || 1);
const region = process.env.DEMO_REGION || 'shanghai';

async function main() {
  const buyer = await User.findOne({ where: { email: 'buyer@comprix.local' } });
  const seller = await User.findOne({ where: { email: 'seller@comprix.local' } });
  const admin = await User.findOne({ where: { role: 'admin' }, order: [['id', 'ASC']] });
  if (!buyer || !seller || !admin) throw new Error('缺少 buyer/seller/admin 种子账号');

  const stale = await SpotBookOrder.findAll({
    where: {
      user_id: { [Op.in]: [buyer.id, seller.id] },
      sku_id,
      region,
      status: { [Op.in]: ['open', 'partial'] },
    },
  });
  for (const o of stale) {
    await cancelSpotOrder(o.user_id, o.id).catch((e) => console.warn('cancel', o.id, e.message));
  }

  const q = await resolveMarketQuote(sku_id, region);
  const bid0 = Number(q?.bid) || 112000;
  const ask0 = Number(q?.ask) || 118000;

  const sells = [
    { price: round4(ask0), qty: 2 },
    { price: round4(ask0 + 800), qty: 3 },
    { price: round4(ask0 + 1600), qty: 1.5 },
    { price: round4(ask0 + 2800), qty: 4 },
  ];
  const buys = [
    { price: round4(bid0), qty: 2 },
    { price: round4(bid0 - 700), qty: 2.5 },
    { price: round4(bid0 - 1500), qty: 3 },
    { price: round4(bid0 - 2500), qty: 1 },
  ];

  const need = buys.reduce((s, b) => s + b.price * b.qty, 0);
  const bp = await getBuyingPower(buyer.id);
  if (bp.available < need) {
    await adminDeposit(buyer.id, Math.ceil(need - bp.available + 50000), admin.id, '演示挂单补入金');
  }

  for (const s of sells) {
    await placeSpotOrder(seller.id, {
      sku_id,
      region,
      side: 'sell',
      order_type: 'limit',
      price: s.price,
      qty: s.qty,
    });
  }
  for (const b of buys) {
    await placeSpotOrder(buyer.id, {
      sku_id,
      region,
      side: 'buy',
      order_type: 'limit',
      price: b.price,
      qty: b.qty,
    });
  }

  const book = await getOrderBook(sku_id, region);
  console.log(JSON.stringify({ sku_id, region, bids: book.bids, asks: book.asks }, null, 2));
  await sequelize.close();
}

function round4(n) {
  return Math.round(Number(n) * 100) / 100;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

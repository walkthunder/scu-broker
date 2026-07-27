/**
 * 演示/联调数据：在基础 seed 之上追加客户、进行中询价、已成交样例。
 * 幂等：按固定 phone / 备注标记查找。
 */
import bcrypt from 'bcryptjs';
import { sequelize } from '../src/config/database.js';
import {
  User,
  Sku,
  Supplier,
  Rfq,
  Quote,
  Order,
  OrderLog,
  Payment,
  ReferencePrice,
} from '../src/models/index.js';

function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function seedDemo() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  const admin = await User.findOne({ where: { role: 'admin' } });
  const broker = await User.findOne({ where: { role: 'broker' } });
  if (!admin || !broker) {
    throw new Error('请先运行 npm run db:seed');
  }

  const hash = await bcrypt.hash('unused', 10);
  const customers = [
    { phone: '13911110001', name: '演示客户A', company_name: '星河智能' },
    { phone: '13911110002', name: '演示客户B', company_name: '云图科技' },
    { phone: '13911110003', name: '演示客户C', company_name: '深算实验室' },
  ];
  const customerUsers = [];
  for (const c of customers) {
    const [u] = await User.findOrCreate({
      where: { phone: c.phone },
      defaults: { ...c, role: 'customer', password_hash: null },
    });
    customerUsers.push(u);
  }

  const skus = await Sku.findAll({ where: { status: 'active' }, order: [['id', 'ASC']] });
  const suppliers = await Supplier.findAll({ order: [['id', 'ASC']], limit: 5 });
  const date = todayShanghai();
  for (const s of skus.slice(0, 5)) {
    await ReferencePrice.findOrCreate({
      where: { sku_id: s.id, date },
      defaults: {
        sku_id: s.id,
        date,
        price_low: 20,
        price_mid: 28,
        price_high: 36,
        source: '人工录入',
        created_by: admin.id,
      },
    });
  }

  // 待处理询价
  const [pendingRfq] = await Rfq.findOrCreate({
    where: { customer_id: customerUsers[0].id, note: '[DEMO] pending rfq' },
    defaults: {
      customer_id: customerUsers[0].id,
      sku_id: skus[0].id,
      quantity: 8,
      duration: '1个月',
      delivery_date: '2026-08-15',
      budget_range: '8-12万',
      note: '[DEMO] pending rfq',
      status: 'pending',
      broker_id: broker.id,
    },
  });

  // 已报价待确认
  let quotedRfq = await Rfq.findOne({
    where: { customer_id: customerUsers[1].id, note: '[DEMO] quoted rfq' },
  });
  if (!quotedRfq) {
    quotedRfq = await Rfq.create({
      customer_id: customerUsers[1].id,
      sku_id: skus[1]?.id || skus[0].id,
      quantity: 16,
      duration: '720小时',
      note: '[DEMO] quoted rfq',
      status: 'quoted',
      broker_id: broker.id,
    });
    const quote = await Quote.create({
      rfq_id: quotedRfq.id,
      supplier_id: suppliers[0].id,
      broker_id: broker.id,
      price: 96000,
      delivery_date: '2026-08-20',
      note: '[DEMO] pending quote',
      status: 'pending',
      expiry_time: new Date(Date.now() + 24 * 3600 * 1000),
      sent_at: new Date(),
    });
    console.log('demo quoted rfq', quotedRfq.id, 'quote', quote.id);
  }

  // 已完成订单 + 收付款
  let doneRfq = await Rfq.findOne({
    where: { customer_id: customerUsers[2].id, note: '[DEMO] done rfq' },
  });
  if (!doneRfq) {
    doneRfq = await Rfq.create({
      customer_id: customerUsers[2].id,
      sku_id: skus[0].id,
      quantity: 4,
      note: '[DEMO] done rfq',
      status: 'confirmed',
      broker_id: broker.id,
    });
    const quote = await Quote.create({
      rfq_id: doneRfq.id,
      supplier_id: suppliers[0].id,
      broker_id: broker.id,
      price: 42000,
      status: 'confirmed',
      expiry_time: new Date(Date.now() + 3600 * 1000),
      sent_at: new Date(),
    });
    const order = await Order.create({
      quote_id: quote.id,
      customer_id: customerUsers[2].id,
      supplier_id: suppliers[0].id,
      broker_id: broker.id,
      sku_id: skus[0].id,
      price: 42000,
      status: '已完成',
      signed_at: new Date(),
      delivered_at: new Date(),
      accepted_at: new Date(),
      settled_at: new Date(),
    });
    await OrderLog.create({
      order_id: order.id,
      from_status: null,
      to_status: '待签约',
      note: '[DEMO] seed',
      operator_id: customerUsers[2].id,
    });
    await OrderLog.create({
      order_id: order.id,
      from_status: '待结算',
      to_status: '已完成',
      note: '[DEMO] settled',
      operator_id: admin.id,
    });
    await Payment.create({
      order_id: order.id,
      type: '客户付款',
      amount: 42000,
      method: '对公',
      status: '已确认',
      confirmed_by: admin.id,
    });
    await Payment.create({
      order_id: order.id,
      type: '供应商放款',
      amount: 42000,
      method: '对公',
      status: '已确认',
      confirmed_by: admin.id,
    });
    console.log('demo completed order', order.id);
  }

  void hash;
  console.log('Demo seed done.');
  console.log('Demo customers: 13911110001 / 13911110002 / 13911110003  OTP=123456');
  console.log('Pending RFQ id:', pendingRfq.id);
  process.exit(0);
}

seedDemo().catch((e) => {
  console.error(e);
  process.exit(1);
});

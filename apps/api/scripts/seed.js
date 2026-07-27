import bcrypt from 'bcryptjs';
import { sequelize } from '../src/config/database.js';
import { config } from '../src/config/index.js';
import {
  User,
  Sku,
  Supplier,
  ReferencePrice,
  Announcement,
  DealFeed,
} from '../src/models/index.js';
import { todayShanghai, addDaysShanghai } from '../src/utils/market.js';

async function ensureDealFeedOrderIdNullable() {
  try {
    await sequelize.query(
      'ALTER TABLE `deal_feeds` MODIFY COLUMN `order_id` INT UNSIGNED NULL',
    );
  } catch {
    /* table may not exist yet */
  }
}

async function seed() {
  await sequelize.authenticate();
  await ensureDealFeedOrderIdNullable();
  await sequelize.sync({ alter: true });

  const hash = await bcrypt.hash(config.admin.password, 10);
  const [admin] = await User.findOrCreate({
    where: { phone: config.admin.phone },
    defaults: {
      phone: config.admin.phone,
      name: config.admin.name,
      role: 'admin',
      password_hash: hash,
      email: 'admin@comprix.local',
    },
  });
  if (!admin.password_hash) {
    admin.password_hash = hash;
    admin.role = 'admin';
    await admin.save();
  }

  const brokers = [
    { phone: '13800000001', name: 'Broker 张', password: 'broker123' },
    { phone: '13800000002', name: 'Broker 李', password: 'broker123' },
    { phone: '13800000003', name: 'Broker 王', password: 'broker123' },
  ];
  for (const b of brokers) {
    const ph = await bcrypt.hash(b.password, 10);
    await User.findOrCreate({
      where: { phone: b.phone },
      defaults: {
        phone: b.phone,
        name: b.name,
        role: 'broker',
        password_hash: ph,
        email: `${b.phone}@comprix.local`,
      },
    });
  }

  const skuDefs = [
    {
      name: 'H100',
      type: 'gpu',
      unit: '小时',
      spec: '80GB HBM3',
      is_hot: true,
      sort_weight: 100,
      selling_point: '现货充足，24h 可交付',
      delivery_note: '常见交期 1–3 天，视机房库存而定',
    },
    {
      name: 'H800',
      type: 'gpu',
      unit: '小时',
      spec: '80GB',
      is_hot: true,
      sort_weight: 90,
      selling_point: '国产合规优选',
      delivery_note: '建议提前 2 天锁定',
    },
    {
      name: 'A100',
      type: 'gpu',
      unit: '小时',
      spec: '40/80GB',
      is_hot: true,
      sort_weight: 80,
      selling_point: '性价比之选',
    },
    { name: 'A800', type: 'gpu', unit: '小时', spec: '80GB', sort_weight: 40 },
    { name: '昇腾 910B', type: 'gpu', unit: '小时', spec: '国产卡', sort_weight: 50 },
    {
      name: 'GPT Token',
      type: 'token',
      unit: '百万token',
      spec: '主流推理',
      is_hot: true,
      sort_weight: 70,
      selling_point: '按量即开',
    },
    {
      name: 'DeepSeek Token',
      type: 'token',
      unit: '百万token',
      spec: '国产模型',
      is_hot: true,
      sort_weight: 65,
      selling_point: '国产模型高性价比',
    },
    { name: 'L40S', type: 'gpu', unit: '小时', spec: '48GB' },
    { name: '4090', type: 'gpu', unit: '小时', spec: '24GB' },
    {
      name: 'H100 包月',
      type: 'gpu',
      unit: '月',
      spec: '整机包月',
      is_hot: true,
      sort_weight: 85,
      selling_point: '整机包月更省',
      delivery_note: '签约后 3–5 个工作日开通',
    },
  ];
  const skus = [];
  for (const d of skuDefs) {
    const [s] = await Sku.findOrCreate({
      where: { name: d.name },
      defaults: { ...d, is_public: true, status: 'active' },
    });
    // 幂等刷新运营字段
    Object.assign(s, {
      is_public: true,
      is_hot: !!d.is_hot,
      sort_weight: d.sort_weight || 0,
      selling_point: d.selling_point || s.selling_point,
      delivery_note: d.delivery_note || s.delivery_note,
    });
    await s.save();
    skus.push(s);
  }

  // 隐藏测试 SKU
  const { Op } = await import('sequelize');
  const tests = await Sku.findAll({ where: { name: { [Op.like]: 'SKU-T-%' } } });
  for (const t of tests) {
    t.is_public = false;
    t.is_hot = false;
    await t.save();
  }

  const today = todayShanghai();
  const yesterday = addDaysShanghai(today, -1);
  for (const s of skus) {
    const base = s.type === 'token' ? 8 : s.unit === '月' ? 80000 : 25;
    await ReferencePrice.findOrCreate({
      where: { sku_id: s.id, date: yesterday },
      defaults: {
        sku_id: s.id,
        date: yesterday,
        price_low: base * 0.75,
        price_mid: base * 0.95,
        price_high: base * 1.2,
        source: '人工录入',
        created_by: admin.id,
      },
    });
    await ReferencePrice.findOrCreate({
      where: { sku_id: s.id, date: today },
      defaults: {
        sku_id: s.id,
        date: today,
        price_low: base * 0.8,
        price_mid: base,
        price_high: base * 1.3,
        source: '人工录入',
        created_by: admin.id,
      },
    });
  }

  const suppliers = [
    {
      name: '华东算力一号',
      display_name: '华东资源方',
      contact_name: '陈工',
      contact_phone: '13900000001',
      skus: 'H100,H800,A100',
      price_style: '中等',
      reliability: '靠谱',
    },
    {
      name: '西南智算中心',
      display_name: '西南资源方',
      contact_name: '刘经理',
      contact_phone: '13900000002',
      skus: 'A800,昇腾 910B',
      price_style: '偏低',
      reliability: '一般',
    },
    {
      name: 'Token 云联',
      display_name: 'Token 渠道',
      contact_name: '赵',
      contact_phone: '13900000003',
      skus: 'GPT Token,DeepSeek Token',
      price_style: '偏高',
      reliability: '靠谱',
    },
  ];
  for (let i = 0; i < 27; i++) {
    suppliers.push({
      name: `示例供应商 ${i + 4}`,
      display_name: `供应商 ${String.fromCharCode(65 + (i % 26))}`,
      contact_name: `联系人${i + 4}`,
      contact_phone: `1390000${String(i + 4).padStart(4, '0')}`,
      skus: 'H100,A100',
      price_style: ['偏高', '中等', '偏低'][i % 3],
      reliability: ['靠谱', '一般', '需谨慎'][i % 3],
      note: '冷启动示例',
    });
  }
  for (const s of suppliers) {
    await Supplier.findOrCreate({ where: { name: s.name }, defaults: s });
  }

  await Announcement.findOrCreate({
    where: { title: 'H100 现货偏紧，建议提前询价' },
    defaults: {
      title: 'H100 现货偏紧，建议提前询价',
      content: '本周 H100 / H800 询价活跃，Broker 通常 2–6 小时内反馈。正式报价 24 小时有效。',
      position: 'top',
      bg_color: '#1e293b',
      text_color: '#f8fafc',
      is_active: true,
      start_time: new Date(Date.now() - 86400000),
      end_time: new Date(Date.now() + 30 * 86400000),
      created_by: admin.id,
    },
  });

  const feedSamples = [
    { region: '东部', sku_name: 'H100', deal_type: '包月', deal_date: today },
    { region: '南部', sku_name: 'H800', deal_type: '时租', deal_date: yesterday },
    { region: '西部', sku_name: 'A100', deal_type: '包月', deal_date: addDaysShanghai(today, -2) },
    { region: '北部', sku_name: 'DeepSeek Token', deal_type: 'Token包', deal_date: today },
    { region: '海外', sku_name: 'H100', deal_type: '时租', deal_date: addDaysShanghai(today, -3) },
  ];
  for (const f of feedSamples) {
    const [row] = await DealFeed.findOrCreate({
      where: {
        sku_name: f.sku_name,
        region: f.region,
        deal_type: f.deal_type,
        deal_date: f.deal_date,
      },
      defaults: {
        ...f,
        order_id: null,
        is_published: true,
        published_by: admin.id,
        published_at: new Date(),
      },
    });
    if (!row.is_published) {
      row.is_published = true;
      row.published_by = admin.id;
      row.published_at = row.published_at || new Date();
      await row.save();
    }
  }

  console.log('Seed done.');
  console.log(`Admin login: ${config.admin.phone} / ${config.admin.password}`);
  console.log('Broker login: 13800000001 / broker123');
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

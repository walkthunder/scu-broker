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
  PriceIndex,
  IndexPrint,
  DeliveryChannel,
  DeliveryWhitelist,
  SettlementBill,
  ForwardContract,
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
      unit: '台·月',
      spec: 'NVIDIA H100 80GB',
      is_hot: true,
      sort_weight: 100,
      selling_point: '进口高端',
    },
    {
      name: 'H200',
      type: 'gpu',
      unit: '台·月',
      spec: 'NVIDIA H200',
      is_hot: true,
      sort_weight: 95,
      selling_point: '进口旗舰',
    },
    {
      name: 'PPU',
      type: 'gpu',
      unit: '台·月',
      spec: '国产加速卡',
      is_hot: true,
      sort_weight: 90,
      selling_point: '国产加速卡',
    },
    {
      name: '算力 Token',
      type: 'token',
      unit: '百万token',
      spec: '综合推理 Token',
      is_hot: true,
      sort_weight: 85,
      selling_point: '全国综合价',
    },
    // 兼容旧演示
    {
      name: 'H100 包月',
      type: 'gpu',
      unit: '月',
      spec: '整机包月',
      is_hot: false,
      sort_weight: 40,
      selling_point: '兼容旧指数',
    },
    { name: 'H800', type: 'gpu', unit: '小时', spec: '80GB', sort_weight: 30 },
    { name: 'A100', type: 'gpu', unit: '小时', spec: '40/80GB', sort_weight: 20 },
    {
      name: 'GPT Token',
      type: 'token',
      unit: '百万token',
      is_hot: false,
      sort_weight: 15,
    },
    {
      name: 'DeepSeek Token',
      type: 'token',
      unit: '百万token',
      is_hot: false,
      sort_weight: 10,
    },
  ];
  const skus = [];
  for (const d of skuDefs) {
    const [s] = await Sku.findOrCreate({
      where: { name: d.name },
      defaults: { ...d, is_public: true, status: 'active' },
    });
    Object.assign(s, {
      is_public: true,
      is_hot: !!d.is_hot,
      sort_weight: d.sort_weight || 0,
      unit: d.unit || s.unit,
      selling_point: d.selling_point || s.selling_point,
      delivery_note: d.delivery_note || s.delivery_note,
      status: 'active',
    });
    await s.save();
    skus.push(s);
  }

  // 非 FRD 主推标的降热度
  for (const name of ['H800', 'A100', 'GPT Token', 'DeepSeek Token', 'H100 包月']) {
    const s = skus.find((x) => x.name === name);
    if (s && !['H100', 'H200', 'PPU', '算力 Token'].includes(s.name)) {
      s.is_hot = false;
      await s.save();
    }
  }

  // 隐藏测试 SKU（功能测试残留）
  const { Op } = await import('sequelize');
  const tests = await Sku.findAll({
    where: {
      name: { [Op.or]: [{ [Op.like]: 'SKU-T-%' }, { [Op.like]: 'Hidden-SKU-%' }] },
    },
  });
  for (const t of tests) {
    t.is_public = false;
    t.is_hot = false;
    t.status = 'inactive';
    await t.save();
  }

  const today = todayShanghai();
  const yesterday = addDaysShanghai(today, -1);
  const regions = ['shanghai', 'neimeng', 'guizhou'];
  const frdAnchors = {
    H100: 120000,
    H200: 145000,
    PPU: 53000,
    '算力 Token': 2.05,
  };
  for (const s of skus) {
    const base =
      frdAnchors[s.name] ??
      (s.type === 'token' ? 8 : s.unit === '月' || s.unit === '台·月' ? 80000 : 25);
    for (const region of regions) {
      const regional =
        region === 'neimeng' ? base * 0.95 : region === 'guizhou' ? base * 0.92 : base;
      await ReferencePrice.findOrCreate({
        where: { sku_id: s.id, date: yesterday, region },
        defaults: {
          sku_id: s.id,
          date: yesterday,
          region,
          price_low: regional * 0.75,
          price_mid: regional * 0.95,
          price_high: regional * 1.2,
          source: '人工录入',
          created_by: admin.id,
        },
      });
      const [todayRef] = await ReferencePrice.findOrCreate({
        where: { sku_id: s.id, date: today, region },
        defaults: {
          sku_id: s.id,
          date: today,
          region,
          price_low: regional * 0.8,
          price_mid: regional,
          price_high: regional * 1.3,
          source: '人工录入',
          created_by: admin.id,
        },
      });
      todayRef.price_low = regional * 0.8;
      todayRef.price_mid = regional;
      todayRef.price_high = regional * 1.3;
      todayRef.source = '人工录入';
      await todayRef.save();
    }
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

  // 远期对冲双方（邮箱密码登录）
  const customerPass = await bcrypt.hash('Pass1234!', 10);
  for (const c of [
    {
      phone: '13900001001',
      email: 'buyer@comprix.local',
      name: '买方·星云AI',
      company_name: '星云智能',
    },
    {
      phone: '13900001002',
      email: 'seller@comprix.local',
      name: '卖方·云海算力',
      company_name: '云海算力',
    },
  ]) {
    const [u] = await User.findOrCreate({
      where: { email: c.email },
      defaults: {
        phone: c.phone,
        email: c.email,
        name: c.name,
        company_name: c.company_name,
        role: 'customer',
        password_hash: customerPass,
      },
    });
    if (!u.password_hash) {
      u.password_hash = customerPass;
      u.email = c.email;
      await u.save();
    }
  }

  // 价格指数：FRD 四标的 × 三区域 + 兼容旧代码
  const frdSkus = ['H100', 'H200', 'PPU', '算力 Token'];
  const regionCodes = [
    { code: 'shanghai', tag: 'SH', name: '上海' },
    { code: 'neimeng', tag: 'NM', name: '内蒙' },
    { code: 'guizhou', tag: 'GZ', name: '贵州' },
  ];
  const indexDefs = [];
  for (const skuName of frdSkus) {
    for (const r of regionCodes) {
      const short = skuName === '算力 Token' ? 'TK' : skuName;
      indexDefs.push({
        code: `${short}-${r.tag}`,
        name: `${skuName} ${r.name}结算指数`,
        skuName,
        region: r.code,
        jump: skuName === '算力 Token' ? 30 : 20,
      });
    }
  }
  indexDefs.push(
    { code: 'H100-M', name: 'H100 包月结算指数', skuName: 'H100 包月', region: 'shanghai', jump: 20 },
    { code: 'H100-H', name: 'H100 时租结算指数', skuName: 'H100', region: 'shanghai', jump: 20 },
  );
  const seededIndices = [];
  for (const def of indexDefs) {
    const sku = skus.find((s) => s.name === def.skuName);
    if (!sku) {
      console.warn(`skip index ${def.code}: missing SKU ${def.skuName}`);
      continue;
    }
    const [idx] = await PriceIndex.findOrCreate({
      where: { code: def.code },
      defaults: {
        code: def.code,
        name: def.name,
        sku_id: sku.id,
        region: def.region || 'shanghai',
        status: 'active',
        jump_threshold_pct: def.jump,
      },
    });
    idx.sku_id = sku.id;
    idx.name = def.name;
    idx.region = def.region || 'shanghai';
    idx.status = 'active';
    idx.jump_threshold_pct = def.jump;
    await idx.save();
    const midToday = await ReferencePrice.findOne({
      where: { sku_id: sku.id, date: today, region: def.region || 'shanghai' },
    });
    if (midToday) {
      const [print] = await IndexPrint.findOrCreate({
        where: { index_id: idx.id, date: today },
        defaults: {
          index_id: idx.id,
          date: today,
          settle_price: midToday.price_mid,
          source: 'price_mid',
          status: 'published',
        },
      });
      const used = await SettlementBill.findOne({
        where: { settle_price_date: today },
        include: [
          {
            model: ForwardContract,
            as: 'contract',
            required: true,
            where: { index_id: idx.id },
            attributes: ['id'],
          },
        ],
      }).catch(() => null);
      if (!used && (print.status !== 'published' || Number(print.settle_price) !== Number(midToday.price_mid))) {
        print.settle_price = midToday.price_mid;
        print.source = 'price_mid';
        print.status = 'published';
        await print.save();
      }
    }
    seededIndices.push({ idx, sku });
  }

  // 交割通道：主流 GPU 包月/时租各一条示例
  const [runze] = await Supplier.findOrCreate({
    where: { name: '润泽算力交割通道' },
    defaults: {
      name: '润泽算力交割通道',
      display_name: '润泽通道',
      contact_name: '通道对接',
      contact_phone: '13900009999',
      skus: 'H100 包月,H100,H800',
      note: '实物交割合作意向方示例',
    },
  });
  const channelDefs = [
    { name: '润泽·H100包月交割', skuName: 'H100 包月' },
    { name: '润泽·H100时租交割', skuName: 'H100' },
    { name: '润泽·H800时租交割', skuName: 'H800' },
  ];
  for (const cd of channelDefs) {
    const sku = skus.find((s) => s.name === cd.skuName);
    if (!sku) continue;
    await DeliveryChannel.findOrCreate({
      where: { name: cd.name },
      defaults: {
        name: cd.name,
        supplier_id: runze.id,
        sku_id: sku.id,
        active: true,
      },
    });
  }
  for (const email of ['buyer@comprix.local', 'seller@comprix.local']) {
    const u = await User.findOne({ where: { email } });
    if (!u) continue;
    await DeliveryWhitelist.findOrCreate({
      where: { user_id: u.id },
      defaults: {
        user_id: u.id,
        active: true,
        approved_by: admin.id,
        note: `试运行白名单（${email}）`,
      },
    });
  }

  // FRD：配置、账本、伙伴、渠道成交样本、产能
  const { seedPlatformDefaults } = await import('../src/services/platform-config.js');
  const { adminDeposit } = await import('../src/services/ledger.js');
  const { createChannelDeal } = await import('../src/services/channel-deal.js');
  const { PartnerCapacity } = await import('../src/models/frd-models.js');
  await seedPlatformDefaults();

  const buyer = await User.findOne({ where: { email: 'buyer@comprix.local' } });
  if (buyer) {
    buyer.source = 'friend';
    await buyer.save();
    await adminDeposit(buyer.id, 2_000_000, admin.id, '种子入账');
  }

  const partnerPass = await bcrypt.hash('partner123', 10);
  const [partnerUser] = await User.findOrCreate({
    where: { phone: '13900002001' },
    defaults: {
      phone: '13900002001',
      email: 'partner@comprix.local',
      name: '伙伴·华东',
      role: 'partner',
      supplier_id: runze.id,
      password_hash: partnerPass,
    },
  });
  partnerUser.role = 'partner';
  partnerUser.supplier_id = runze.id;
  partnerUser.password_hash = partnerPass;
  await partnerUser.save();

  for (const skuName of ['H100', 'H200', 'PPU', '算力 Token']) {
    const sku = skus.find((s) => s.name === skuName);
    if (!sku) continue;
    await DeliveryChannel.findOrCreate({
      where: { name: `润泽·${skuName}交割` },
      defaults: {
        name: `润泽·${skuName}交割`,
        supplier_id: runze.id,
        sku_id: sku.id,
        active: true,
      },
    });
    for (const region of ['shanghai', 'neimeng', 'guizhou']) {
      const [cap] = await PartnerCapacity.findOrCreate({
        where: { supplier_id: runze.id, sku_id: sku.id, region },
        defaults: {
          supplier_id: runze.id,
          sku_id: sku.id,
          region,
          spot_qty: skuName === '算力 Token' ? 100000 : 5000,
          forward_qty: skuName === '算力 Token' ? 100000 : 5000,
          rights_qty: 2000,
          active: true,
        },
      });
      cap.spot_qty = skuName === '算力 Token' ? 100000 : 5000;
      cap.forward_qty = skuName === '算力 Token' ? 100000 : 5000;
      cap.rights_qty = 2000;
      cap.active = true;
      await cap.save();
      const mid = await ReferencePrice.findOne({
        where: { sku_id: sku.id, date: today, region },
      });
      if (mid) {
        for (let i = 0; i < 4; i++) {
          await createChannelDeal(
            {
              sku_id: sku.id,
              region,
              qty: 2 + i,
              unit_price: Number(mid.price_mid) * (0.98 + i * 0.01),
              deal_status: 'filled',
              source: 'manual',
              note: 'seed sample',
            },
            admin.id,
          ).catch(() => null);
        }
      }
    }
  }

  console.log('Seed done.');
  console.log(`Admin login: ${config.admin.phone} / ${config.admin.password}`);
  console.log('Broker login: 13800000001 / broker123');
  console.log('Customer: buyer@comprix.local / Pass1234!  (seller@comprix.local，均已开通交割白名单)');
  console.log('Partner: partner@comprix.local / partner123 (或手机 13900002001)');
  console.log(
    'Indices:',
    seededIndices.map((x) => x.idx.code).join(', ') || '(none)',
  );
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

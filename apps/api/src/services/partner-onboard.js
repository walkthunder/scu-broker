import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { PartnerApplication, PartnerCapacity } from '../models/frd-models.js';
import { Supplier, User, Sku } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { sequelize } from '../config/database.js';
import { REGION_CODES } from '../constants/platform.js';

export async function submitPartnerApplication(body) {
  const { company_name, contact_name, phone, email, regions, skus, note } = body;
  if (!company_name) throw new AppError('公司名称必填');
  return PartnerApplication.create({
    company_name,
    contact_name: contact_name || null,
    phone: phone || null,
    email: email || null,
    regions: regions || null,
    skus: skus || null,
    note: note || null,
    status: 'pending',
  });
}

export async function listPartnerApplications(status) {
  const where = status ? { status } : {};
  return PartnerApplication.findAll({
    where,
    include: [
      { association: 'supplier', attributes: ['id', 'name', 'display_name'] },
      { association: 'user', attributes: ['id', 'name', 'email', 'phone'] },
      { association: 'reviewer', attributes: ['id', 'name'] },
    ],
    order: [['id', 'DESC']],
  });
}

export async function reviewPartnerApplication(id, reviewerId, { approve, review_note, password }) {
  return sequelize.transaction(async (t) => {
    const app = await PartnerApplication.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!app) throw new AppError('申请不存在', 404);
    if (app.status !== 'pending') throw new AppError('申请已处理');

    if (!approve) {
      app.status = 'rejected';
      app.reviewed_by = reviewerId;
      app.reviewed_at = new Date();
      app.review_note = review_note || '驳回';
      await app.save({ transaction: t });
      return app;
    }

    const [supplier] = await Supplier.findOrCreate({
      where: { name: app.company_name },
      defaults: {
        name: app.company_name,
        display_name: app.company_name,
        contact_name: app.contact_name,
        contact_phone: app.phone,
      },
      transaction: t,
    });

    const email = app.email || `partner_${app.id}@comprix.local`;
    const phone = app.phone || `139${String(10000000 + app.id).slice(-8)}`;
    const plain = password || `Partner${app.id}!`;
    const hash = await bcrypt.hash(plain, 10);
    let user = await User.findOne({
      where: { email },
      transaction: t,
    });
    if (!user) {
      user = await User.create(
        {
          name: app.contact_name || app.company_name,
          email,
          phone,
          password_hash: hash,
          role: 'partner',
          company_name: app.company_name,
          supplier_id: supplier.id,
          source: 'partner',
        },
        { transaction: t },
      );
    } else {
      user.role = 'partner';
      user.supplier_id = supplier.id;
      await user.save({ transaction: t });
    }

    const skuNames = String(app.skus || 'H100,H200,PPU,算力 Token')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const regions = String(app.regions || REGION_CODES.join(','))
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((r) => REGION_CODES.includes(r));
    const skus = await Sku.findAll({
      where: skuNames.length ? { name: { [Op.in]: skuNames } } : { status: 'active' },
      transaction: t,
    });
    for (const sku of skus) {
      for (const region of regions.length ? regions : REGION_CODES) {
        await PartnerCapacity.findOrCreate({
          where: { supplier_id: supplier.id, sku_id: sku.id, region },
          defaults: {
            supplier_id: supplier.id,
            sku_id: sku.id,
            region,
            spot_qty: 100,
            forward_qty: 100,
            rights_qty: 50,
            active: true,
          },
          transaction: t,
        });
      }
    }

    app.status = 'approved';
    app.supplier_id = supplier.id;
    app.user_id = user.id;
    app.reviewed_by = reviewerId;
    app.reviewed_at = new Date();
    app.review_note = review_note || `已开通 ${email}（初始密码仅本次响应返回）`;
    await app.save({ transaction: t });

    const j = app.toJSON();
    // 一次性出示给运营复制；勿写入持久化备注/日志
    j.login_hint = { email, phone, initial_password: plain };
    return j;
  });
}

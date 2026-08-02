import { Op } from 'sequelize';
import { PartnerCapacity } from '../models/frd-models.js';
import { AppError } from '../utils/errors.js';

const FIELD = {
  spot: 'spot_qty',
  forward: 'forward_qty',
  rights: 'rights_qty',
};

export async function assertCapacity(kind, skuId, region, qty, transaction) {
  const field = FIELD[kind];
  if (!field) throw new AppError(`未知产能类型 ${kind}`);
  const rows = await PartnerCapacity.findAll({
    where: { sku_id: skuId, region, active: true },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!rows.length) return; // 未登记产能时不拦（兼容旧环境）
  const sum = rows.reduce((s, r) => s + Number(r[field]), 0);
  if (sum + 1e-9 < Number(qty)) {
    throw new AppError(`可交割余量不足（${kind}）：需要 ${qty}，可用 ${sum}`, 400, 'CAPACITY');
  }
}

export async function consumeCapacity(kind, skuId, region, qty, transaction) {
  const field = FIELD[kind];
  if (!field) throw new AppError(`未知产能类型 ${kind}`);
  const rows = await PartnerCapacity.findAll({
    where: { sku_id: skuId, region, active: true, [field]: { [Op.gt]: 0 } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  // 未登记产能时与 assertCapacity 一致：不扣减
  if (!rows.length) {
    const any = await PartnerCapacity.findAll({
      where: { sku_id: skuId, region, active: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!any.length) return;
  }
  let left = Number(qty);
  for (const r of rows) {
    if (left <= 0) break;
    const take = Math.min(Number(r[field]), left);
    r[field] = Number(r[field]) - take;
    await r.save({ transaction });
    left -= take;
  }
  if (left > 1e-9) {
    throw new AppError(`可交割余量不足（${kind}）：仍缺 ${left}`, 400, 'CAPACITY');
  }
}

/** 释放产能：与 consume 同序（id ASC）加回第一行活跃产能，保证可逆 */
export async function releaseCapacity(kind, skuId, region, qty, transaction) {
  const field = FIELD[kind];
  if (!field || !(Number(qty) > 0)) return;
  const rows = await PartnerCapacity.findAll({
    where: { sku_id: skuId, region, active: true },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!rows.length) return;
  // 加回 id 最小行（与 FIFO consume 的首行一致），避免分散到错误伙伴
  const row = rows[0];
  row[field] = Number(row[field]) + Number(qty);
  await row.save({ transaction });
}

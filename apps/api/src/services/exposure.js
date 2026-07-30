import { Op } from 'sequelize';
import { ForwardContract } from '../models/index.js';
import { SpotBookOrder, RightContract } from '../models/frd-models.js';
import { getPlatformParams } from './platform-config.js';
import { AppError } from '../utils/errors.js';

/** 单客 / 全平台名义敞口（开仓前校验） */
export async function assertNotionalLimits(userId, addNotional, transaction) {
  const params = await getPlatformParams();
  const add = Number(addNotional) || 0;
  if (!(add > 0)) return;

  const customerCap = Number(params.customer_limit_notional);
  const platformCap = Number(params.platform_limit_notional);

  const fwdOpen = await ForwardContract.findAll({
    where: {
      status: { [Op.in]: ['pending_confirm', 'open', 'delivery_pending'] },
      [Op.or]: [{ buyer_id: userId }, { seller_id: userId }],
    },
    attributes: ['strike_price', 'qty', 'buyer_id', 'seller_id'],
    transaction,
  });
  let userFwd = 0;
  for (const c of fwdOpen) {
    userFwd += Number(c.strike_price) * Number(c.qty);
  }

  const spotOpen = await SpotBookOrder.findAll({
    where: {
      user_id: userId,
      status: { [Op.in]: ['open', 'partial'] },
      side: 'buy',
    },
    attributes: ['price', 'qty', 'filled_qty'],
    transaction,
  });
  let userSpot = 0;
  for (const o of spotOpen) {
    const left = Number(o.qty) - Number(o.filled_qty);
    if (Number(o.price) > 0) userSpot += Number(o.price) * left;
  }

  const rightsOpen = await RightContract.findAll({
    where: {
      buyer_id: userId,
      status: { [Op.in]: ['pending_confirm', 'open'] },
    },
    attributes: ['strike', 'qty', 'premium'],
    transaction,
  });
  let userRights = 0;
  for (const r of rightsOpen) {
    userRights += Number(r.premium) + Number(r.strike) * Number(r.qty) * 0.1;
  }

  const userTotal = userFwd + userSpot + userRights + add;
  if (customerCap > 0 && userTotal > customerCap + 1e-6) {
    throw new AppError(
      `超过单客户敞口限额：当前约 ${Math.round(userTotal)}，上限 ${customerCap}`,
      400,
      'CUSTOMER_LIMIT',
    );
  }

  if (platformCap > 0) {
    const allFwd = await ForwardContract.sum('qty', {
      where: { status: { [Op.in]: ['pending_confirm', 'open', 'delivery_pending'] } },
      transaction,
    });
    // 粗算：用新增名义对比平台上限（已有合约按 strike*qty 汇总）
    const rows = await ForwardContract.findAll({
      where: { status: { [Op.in]: ['pending_confirm', 'open', 'delivery_pending'] } },
      attributes: ['strike_price', 'qty'],
      transaction,
    });
    let platform = 0;
    for (const c of rows) platform += Number(c.strike_price) * Number(c.qty);
    platform += add;
    void allFwd;
    if (platform > platformCap + 1e-6) {
      throw new AppError(
        `超过全平台敞口限额：当前约 ${Math.round(platform)}，上限 ${platformCap}`,
        400,
        'PLATFORM_LIMIT',
      );
    }
  }
}

import { Op } from 'sequelize';
import { ForwardContract } from '../models/index.js';
import { SpotBookOrder, RightContract } from '../models/frd-models.js';
import { getPlatformParams } from './platform-config.js';
import { AppError } from '../utils/errors.js';

async function sumSpotBuyNotional(whereExtra, transaction) {
  const spotOpen = await SpotBookOrder.findAll({
    where: {
      status: { [Op.in]: ['open', 'partial'] },
      side: 'buy',
      ...whereExtra,
    },
    attributes: ['price', 'qty', 'filled_qty'],
    transaction,
  });
  let n = 0;
  for (const o of spotOpen) {
    const left = Number(o.qty) - Number(o.filled_qty);
    if (Number(o.price) > 0) n += Number(o.price) * left;
  }
  return n;
}

async function sumRightsNotional(whereExtra, transaction) {
  const rightsOpen = await RightContract.findAll({
    where: {
      status: { [Op.in]: ['pending_confirm', 'open'] },
      ...whereExtra,
    },
    attributes: ['strike', 'qty', 'premium'],
    transaction,
  });
  let n = 0;
  for (const r of rightsOpen) {
    n += Number(r.premium) + Number(r.strike) * Number(r.qty) * 0.1;
  }
  return n;
}

/** 单客 / 全平台名义敞口（开仓前校验） */
export async function assertNotionalLimits(userId, addNotional, transaction) {
  const params = await getPlatformParams();
  const add = Number(addNotional) || 0;
  if (!(add > 0)) return;

  const customerCap = Number(params.customer_limit_notional);
  const platformCap = Number(params.platform_limit_notional);

  // 仅计买方名义（卖方为对手方敞口，不按买方口径叠加）
  const fwdOpen = await ForwardContract.findAll({
    where: {
      status: { [Op.in]: ['pending_confirm', 'open', 'delivery_pending'] },
      buyer_id: userId,
    },
    attributes: ['strike_price', 'qty'],
    transaction,
  });
  let userFwd = 0;
  for (const c of fwdOpen) {
    userFwd += Number(c.strike_price) * Number(c.qty);
  }

  const userSpot = await sumSpotBuyNotional({ user_id: userId }, transaction);
  const userRights = await sumRightsNotional({ buyer_id: userId }, transaction);

  const userTotal = userFwd + userSpot + userRights + add;
  if (customerCap > 0 && userTotal > customerCap + 1e-6) {
    throw new AppError(
      `超过单客户敞口限额：当前约 ${Math.round(userTotal)}，上限 ${customerCap}`,
      400,
      'CUSTOMER_LIMIT',
    );
  }

  if (platformCap > 0) {
    const rows = await ForwardContract.findAll({
      where: { status: { [Op.in]: ['pending_confirm', 'open', 'delivery_pending'] } },
      attributes: ['strike_price', 'qty'],
      transaction,
    });
    let platform = 0;
    for (const c of rows) platform += Number(c.strike_price) * Number(c.qty);
    platform += await sumSpotBuyNotional({}, transaction);
    platform += await sumRightsNotional({}, transaction);
    platform += add;
    if (platform > platformCap + 1e-6) {
      throw new AppError(
        `超过全平台敞口限额：当前约 ${Math.round(platform)}，上限 ${platformCap}`,
        400,
        'PLATFORM_LIMIT',
      );
    }
  }
}

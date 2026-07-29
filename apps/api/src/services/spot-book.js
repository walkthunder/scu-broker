import { Op } from 'sequelize';
import { SpotBookOrder, SpotFill } from '../models/frd-models.js';
import { Sku, DeliveryChannel, DeliveryOrder } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { getPlatformParams } from './platform-config.js';
import { createChannelDeal } from './channel-deal.js';
import { postLedger } from './ledger.js';
import { sequelize } from '../config/database.js';
import { REGION_CODES } from '../constants/platform.js';
import { assertCapacity, consumeCapacity } from './partner-capacity.js';

async function marginFor(price, qty) {
  const params = await getPlatformParams();
  const pct = Number(params.margin_initial_pct) / 100;
  return Math.round(Number(price) * Number(qty) * pct * 100) / 100;
}

function bumpAvg(prevAvg, prevFilled, fillPx, fillQty) {
  const before = Number(prevFilled) - Number(fillQty);
  if (before <= 0) return Number(fillPx);
  const base = prevAvg != null ? Number(prevAvg) : Number(fillPx);
  return (base * before + Number(fillPx) * Number(fillQty)) / Number(prevFilled);
}

export async function getOrderBook(skuId, region, depth = 10) {
  const buys = await SpotBookOrder.findAll({
    where: {
      sku_id: skuId,
      region,
      side: 'buy',
      status: { [Op.in]: ['open', 'partial'] },
    },
    order: [
      ['price', 'DESC'],
      ['id', 'ASC'],
    ],
    limit: 50,
  });
  const sells = await SpotBookOrder.findAll({
    where: {
      sku_id: skuId,
      region,
      side: 'sell',
      status: { [Op.in]: ['open', 'partial'] },
    },
    order: [
      ['price', 'ASC'],
      ['id', 'ASC'],
    ],
    limit: 50,
  });

  function aggregate(orders, side) {
    const map = new Map();
    for (const o of orders) {
      const p = Number(o.price);
      const q = Number(o.qty) - Number(o.filled_qty);
      if (q <= 0) continue;
      map.set(p, (map.get(p) || 0) + q);
    }
    const levels = [...map.entries()]
      .sort((a, b) => (side === 'buy' ? b[0] - a[0] : a[0] - b[0]))
      .slice(0, depth);
    let cum = 0;
    return levels.map(([price, qty]) => {
      cum += qty;
      return { price, qty, cumulative: cum };
    });
  }

  return {
    bids: aggregate(buys, 'buy'),
    asks: aggregate(sells, 'sell'),
  };
}

export function estimateImpact(bookSide, qty) {
  let left = Number(qty);
  let cost = 0;
  let filled = 0;
  for (const lvl of bookSide) {
    if (left <= 0) break;
    const take = Math.min(lvl.qty, left);
    cost += take * lvl.price;
    filled += take;
    left -= take;
  }
  return {
    filled_qty: filled,
    avg_price: filled > 0 ? Math.round((cost / filled) * 10000) / 10000 : null,
    unfilled: left,
    suggest_rfq: left > 0 || filled < Number(qty),
  };
}

async function matchOrder(order, transaction) {
  const remaining = () => Number(order.qty) - Number(order.filled_qty);
  while (remaining() > 1e-9) {
    const where = {
      sku_id: order.sku_id,
      region: order.region,
      status: { [Op.in]: ['open', 'partial'] },
      id: { [Op.ne]: order.id },
    };
    if (order.side === 'buy') {
      where.side = 'sell';
      if (order.order_type === 'limit') where.price = { [Op.lte]: Number(order.price) };
    } else {
      where.side = 'buy';
      if (order.order_type === 'limit') where.price = { [Op.gte]: Number(order.price) };
    }
    const opposite = await SpotBookOrder.findOne({
      where,
      order:
        order.side === 'buy'
          ? [
              ['price', 'ASC'],
              ['id', 'ASC'],
            ]
          : [
              ['price', 'DESC'],
              ['id', 'ASC'],
            ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!opposite) break;
    const px = Number(opposite.price);
    const qty = Math.min(remaining(), Number(opposite.qty) - Number(opposite.filled_qty));
    if (qty <= 0) break;

    const buy = order.side === 'buy' ? order : opposite;
    const sell = order.side === 'sell' ? order : opposite;

    const fill = await SpotFill.create(
      {
        buy_order_id: buy.id,
        sell_order_id: sell.id,
        sku_id: order.sku_id,
        region: order.region,
        price: px,
        qty,
        buyer_id: buy.user_id,
        seller_id: sell.user_id,
      },
      { transaction },
    );

    order.filled_qty = Number(order.filled_qty) + qty;
    opposite.filled_qty = Number(opposite.filled_qty) + qty;
    order.status = Number(order.filled_qty) + 1e-9 >= Number(order.qty) ? 'filled' : 'partial';
    opposite.status =
      Number(opposite.filled_qty) + 1e-9 >= Number(opposite.qty) ? 'filled' : 'partial';
    order.avg_price = bumpAvg(order.avg_price, order.filled_qty, px, qty);
    opposite.avg_price = bumpAvg(opposite.avg_price, opposite.filled_qty, px, qty);
    await order.save({ transaction });
    await opposite.save({ transaction });

    await consumeCapacity('spot', order.sku_id, order.region, qty, transaction);

    // 买方成交：冻结保证金转为扣款（unfreeze_debit）
    if (buy.price) {
      const m = await marginFor(buy.price, qty);
      if (m > 0) {
        await postLedger(
          {
            userId: buy.user_id,
            type: 'margin_release',
            amount: m,
            ref_type: 'spot_fill',
            ref_id: fill.id,
            note: '现货成交释放并扣减保证金占用',
            mode: 'unfreeze_debit',
          },
          transaction,
        );
      }
    }

    await createChannelDeal(
      {
        sku_id: order.sku_id,
        region: order.region,
        qty,
        unit_price: px,
        deal_status: 'filled',
        source: 'order',
        counterparty_type: '挂单成交',
        note: `book ${buy.id}x${sell.id}`,
      },
      null,
      transaction,
    );

    const channel = await DeliveryChannel.findOne({
      where: { sku_id: order.sku_id, active: true },
      transaction,
    });
    if (channel) {
      await DeliveryOrder.create(
        {
          contract_id: null,
          channel_id: channel.id,
          status: 'pending',
          requested_by: buy.user_id,
          note: `现货挂单成交 ${qty}@${px}`,
          priority: false,
          spot_fill_id: fill.id,
        },
        { transaction },
      );
    }
  }
}

export async function placeSpotOrder(userId, body) {
  const { sku_id, region, side, order_type, price, qty, expires_at } = body;
  if (!sku_id || !region || !side || !qty) throw new AppError('缺少下单要素');
  if (!REGION_CODES.includes(region)) throw new AppError('无效区域');
  if (!['buy', 'sell'].includes(side)) throw new AppError('side 无效');
  const type = order_type || 'limit';
  if (type === 'limit' && !(Number(price) > 0)) throw new AppError('限价单须填写价格');
  if (!(Number(qty) > 0)) throw new AppError('数量须大于 0');
  const sku = await Sku.findByPk(sku_id);
  if (!sku) throw new AppError('SKU 不存在', 404);

  const params = await getPlatformParams();
  if (Number(qty) >= Number(params.rfq_qty_threshold)) {
    return {
      require_rfq: true,
      threshold: params.rfq_qty_threshold,
      message: `超过大宗阈值 ${params.rfq_qty_threshold}，请走 RFQ`,
    };
  }

  const book = await getOrderBook(sku_id, region);
  const impactSide = side === 'buy' ? book.asks : book.bids;
  const impact = estimateImpact(impactSide, qty);

  return sequelize.transaction(async (t) => {
    if (side === 'sell') {
      await assertCapacity('spot', sku_id, region, qty, t);
    }

    const order = await SpotBookOrder.create(
      {
        user_id: userId,
        sku_id,
        region,
        side,
        order_type: type,
        price: type === 'market' ? impact.avg_price || price || 0 : price,
        qty,
        expires_at: expires_at || null,
      },
      { transaction: t },
    );
    if (side === 'buy' && order.price) {
      const need = await marginFor(order.price, qty);
      await postLedger(
        {
          userId,
          type: 'margin_freeze',
          amount: need,
          ref_type: 'spot_book',
          ref_id: order.id,
          note: '现货挂单保证金冻结',
          mode: 'freeze',
        },
        t,
      );
    }
    await matchOrder(order, t);
    await order.reload({ transaction: t });
    return { order, impact };
  });
}

export async function cancelSpotOrder(userId, orderId) {
  return sequelize.transaction(async (t) => {
    const order = await SpotBookOrder.findByPk(orderId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!order) throw new AppError('订单不存在', 404);
    if (Number(order.user_id) !== Number(userId)) throw new AppError('无权取消', 403);
    if (!['open', 'partial'].includes(order.status)) throw new AppError('当前状态不可取消');

    const unfilled = Number(order.qty) - Number(order.filled_qty);
    if (order.side === 'buy' && order.price && unfilled > 0) {
      const m = await marginFor(order.price, unfilled);
      if (m > 0) {
        await postLedger(
          {
            userId,
            type: 'margin_release',
            amount: m,
            ref_type: 'spot_book',
            ref_id: order.id,
            note: '取消挂单释放保证金',
            mode: 'release',
          },
          t,
        );
      }
    }
    order.status = 'cancelled';
    await order.save({ transaction: t });
    return order;
  });
}

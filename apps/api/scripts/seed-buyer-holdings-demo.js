/**
 * 整理试用客户持仓演示数据（幂等）。
 * - 买方：作废脏权益/预售；确保 H100·上海预售持仓 + H100 认购待确认
 * - 卖方：若账本接近空，补演示入金（卖侧确认/挂单观感正常）
 * - 过期询价 SLA 顺延
 *
 * 用法：cd apps/api && npm run db:seed:buyer-holdings
 */
import { Op } from 'sequelize';
import { sequelize } from '../src/config/database.js';
import {
  User,
  PriceIndex,
  Rfq,
  ForwardContract,
  MtmStatement,
} from '../src/models/index.js';
import { RightContract } from '../src/models/frd-models.js';
import { assertForwardTransition } from '../src/services/forward-state.js';
import { releaseCapacity } from '../src/services/partner-capacity.js';
import { postLedger, getBuyingPower, adminDeposit } from '../src/services/ledger.js';
import { resolvePrimaryIndex } from '../src/services/market-resolve.js';
import { getLatestPublished } from '../src/services/index-price.js';
import { suggestPresalePrice } from '../src/services/index-engine.js';
import { getPlatformParams } from '../src/services/platform-config.js';
import {
  selfOpenForward,
  confirmForward,
  listPresaleOffers,
} from '../src/services/forward-settle.js';
import { selfOpenRight, listRights } from '../src/services/right-contract.js';
import { todayShanghai, addDaysShanghai } from '../src/utils/market.js';

const BUYER_EMAIL = 'buyer@comprix.local';
const H100_SKU = Number(process.env.DEMO_SKU_ID || 1);
const REGION = process.env.DEMO_REGION || 'shanghai';

async function voidOpenForward(contract) {
  await sequelize.transaction(async (t) => {
    const row = await ForwardContract.findByPk(contract.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!row || !['open', 'pending_confirm'].includes(row.status)) return;
    assertForwardTransition(row.status, 'cancelled');
    row.status = 'cancelled';
    row.cancel_reason = '试用演示数据整理：作废不合理预售';
    if (Number(row.margin_frozen) > 0) {
      await postLedger(
        {
          userId: row.buyer_id,
          type: 'margin_release',
          amount: Number(row.margin_frozen),
          ref_type: 'forward',
          ref_id: row.id,
          note: '演示整理释放保证金',
          mode: 'release',
        },
        t,
      );
      row.margin_frozen = 0;
    }
    await row.save({ transaction: t });
    const index = await PriceIndex.findByPk(row.index_id, { transaction: t });
    if (index?.sku_id) {
      await releaseCapacity(
        'forward',
        index.sku_id,
        row.region || index.region || REGION,
        row.qty,
        t,
      );
    }
  });
  await MtmStatement.destroy({
    where: { ref_type: 'forward', ref_id: contract.id },
  });
  console.log('voided forward', contract.id, contract.contract_code);
}

async function voidRight(row) {
  await sequelize.transaction(async (t) => {
    const locked = await RightContract.findByPk(row.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!locked || ['cancelled', 'expired', 'exercised'].includes(locked.status)) return;
    if (['pending_confirm', 'open'].includes(locked.status)) {
      await releaseCapacity('rights', locked.sku_id, locked.region, locked.qty, t);
    }
    locked.status = 'cancelled';
    locked.note = [locked.note, '试用演示数据整理：作废不合理权益'].filter(Boolean).join(' | ');
    await locked.save({ transaction: t });
  });
  console.log('voided right', row.id, `sku=${row.sku_id}`, `strike=${row.strike}`);
}

function forwardLooksGood(f, index, spot) {
  if (!index || Number(index.sku_id) !== H100_SKU) return false;
  if ((index.region || REGION) !== REGION) return false;
  if (f.status !== 'open') return false;
  const x = Number(f.strike_price);
  const s = Number(spot);
  if (!(x > 0) || !(s > 0)) return false;
  // 锁价应落在现货约 60%～100%（基差约 -20% ± 带宽）
  return x >= s * 0.55 && x <= s * 1.05 && Number(f.qty) >= 1;
}

function rightLooksGood(r, spot) {
  if (Number(r.sku_id) !== H100_SKU || r.region !== REGION) return false;
  if (!['pending_confirm', 'open'].includes(r.status)) return false;
  if (r.kind !== 'call') return false;
  const k = Number(r.strike);
  const s = Number(spot);
  if (!(k > 0) || !(s > 0)) return false;
  // 行权价应贴近 H100 现货量级，排除 Token/小时卡脏数据
  return k >= s * 0.5 && k <= s * 1.5 && Number(r.qty) >= 1;
}

async function main() {
  const buyer = await User.findOne({ where: { email: BUYER_EMAIL } });
  const seller = await User.findOne({ where: { email: 'seller@comprix.local' } });
  const admin = await User.findOne({ where: { role: 'admin' }, order: [['id', 'ASC']] });
  if (!buyer || !seller || !admin) throw new Error('缺少 buyer/seller/admin');

  // 卖方种子曾无入金：控制台 0/0 易被误认为坏账；补一笔演示资金（幂等）
  const sellerBp = await getBuyingPower(seller.id);
  if (sellerBp.total < 10_000) {
    await adminDeposit(seller.id, 500_000, admin.id, '试用卖方演示入金');
    console.log('seller deposit 500000');
  } else {
    console.log('keep seller ledger', sellerBp);
  }

  const index = await resolvePrimaryIndex(H100_SKU, REGION);
  if (!index) throw new Error('缺少 H100 主指数');
  const print = await getLatestPublished(index.id);
  if (!print) throw new Error('H100 无已发布结算价');
  const spot = Number(print.settle_price);
  const params = await getPlatformParams();

  // 1) 权益：作废不合理，再补一笔待确认认购
  const rights = await RightContract.findAll({
    where: {
      buyer_id: buyer.id,
      status: { [Op.in]: ['pending_confirm', 'open'] },
    },
  });
  let goodRight = null;
  for (const r of rights) {
    if (rightLooksGood(r, spot)) goodRight = r;
    else await voidRight(r);
  }
  if (!goodRight) {
    const strike = Math.round(spot / 100) * 100; // ATM 附近整百
    goodRight = await selfOpenRight(buyer.id, {
      kind: 'call',
      sku_id: H100_SKU,
      region: REGION,
      qty: 1,
      strike,
      unit: '台·月',
      note: '试用演示·H100 认购待确认',
    });
    console.log('created right', goodRight.id, 'strike', strike, 'premium', goodRight.premium);
  } else {
    console.log('keep right', goodRight.id);
  }

  // 2) 预售：作废不合理，再补一笔已确认持仓
  const forwards = await ForwardContract.findAll({
    where: {
      buyer_id: buyer.id,
      status: { [Op.in]: ['pending_confirm', 'open'] },
    },
  });
  let goodFwd = null;
  for (const f of forwards) {
    const idx = await PriceIndex.findByPk(f.index_id);
    if (forwardLooksGood(f, idx, spot)) goodFwd = f;
    else await voidOpenForward(f);
  }
  if (!goodFwd) {
    const band = suggestPresalePrice(spot, params);
    const offer = (await listPresaleOffers()).find(
      (o) => Number(o.index_id) === Number(index.id),
    );
    const strike = Number(offer?.strike_suggest || band.mid);
    const created = await selfOpenForward(buyer.id, {
      index_id: index.id,
      qty: 1,
      strike_price: strike,
      unit: '台·月',
      region: REGION,
      note: '试用演示·H100 预售持仓',
    });
    await confirmForward(created.id, buyer.id);
    await confirmForward(created.id, seller.id);
    goodFwd = await ForwardContract.findByPk(created.id);
    console.log(
      'created forward',
      goodFwd.id,
      goodFwd.contract_code,
      'X=',
      goodFwd.strike_price,
      'margin=',
      goodFwd.margin_frozen,
    );
  } else {
    console.log('keep forward', goodFwd.id, goodFwd.contract_code);
  }

  // 3) 询价：SLA 已过期的 pending 顺延 2 天，避免演示页一片超时
  const staleRfqs = await Rfq.findAll({
    where: {
      customer_id: buyer.id,
      status: 'pending',
      sla_deadline: { [Op.lt]: new Date() },
    },
  });
  for (const rfq of staleRfqs) {
    rfq.sla_deadline = new Date(Date.now() + 2 * 86400 * 1000);
    await rfq.save();
    console.log('extended rfq sla', rfq.id);
  }

  const holdings = await listRights({ userId: buyer.id });
  console.log(
    'done.',
    'spotS=',
    spot,
    'rights=',
    holdings.filter((r) => ['pending_confirm', 'open'].includes(r.status)).map((r) => ({
      id: r.id,
      kind: r.kind_label,
      strike: r.strike,
      status: r.status_label,
    })),
    'forward=',
    {
      id: goodFwd.id,
      code: goodFwd.contract_code,
      x: goodFwd.strike_price,
      s_ref: goodFwd.spot_ref_at_open,
      margin: goodFwd.margin_frozen,
      status: goodFwd.status,
    },
  );
  console.log('today=', todayShanghai(), 'window_hint=', addDaysShanghai(todayShanghai(), 30));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

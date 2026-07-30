import { req } from './http.js';
import { auth } from './auth.js';
import { todayShanghai, addDaysShanghai } from '../../src/utils/market.js';

/**
 * 找可写入的指数结算价日期：先尝试撤销发布，跳过已用于结算的锁定日。
 * @returns {{ date: string, data: object } | null}
 */
export async function tryUpsertPrint(token, indexId, settlePrice, {
  preferredDate = todayShanghai(),
  maxLookback = 150,
} = {}) {
  let last = null;
  for (let i = 0; i < maxLookback; i++) {
    const date = addDaysShanghai(preferredDate, -i);
    await req(`/admin/indices/${indexId}/prints/${date}/unpublish`, {
      method: 'POST',
      headers: auth(token),
    }).catch(() => null);
    last = await req(`/admin/indices/${indexId}/prints`, {
      method: 'POST',
      headers: auth(token),
      body: { date, settle_price: settlePrice },
    });
    if (last.json?.code === 0) return { date, data: last.json.data };
  }
  return null;
}

/** 写入并确保 published */
export async function ensurePublishedPrint(token, indexId, settlePrice, preferredDate) {
  const hit = await tryUpsertPrint(token, indexId, settlePrice, { preferredDate });
  if (!hit) throw new Error('无法找到可写入的结算价日期');
  if (hit.data.status !== 'published') {
    const pub = await req(`/admin/indices/${indexId}/prints/${hit.date}/publish`, {
      method: 'POST',
      headers: auth(token),
    });
    if (pub.json?.code !== 0) throw new Error(pub.json?.message || '发布失败');
  }
  return hit;
}

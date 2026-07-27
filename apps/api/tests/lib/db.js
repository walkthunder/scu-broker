/**
 * 功能测试用 DB 直连辅助（仅测内部状态，不暴露 HTTP）。
 */
import { Quote } from '../../src/models/index.js';

export async function forceQuoteExpiry(quoteId, when = new Date(Date.now() - 60_000)) {
  const [n] = await Quote.update({ expiry_time: when }, { where: { id: quoteId } });
  if (!n) throw new Error(`forceQuoteExpiry: quote ${quoteId} not updated`);
}

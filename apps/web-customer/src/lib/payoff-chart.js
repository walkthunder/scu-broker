/**
 * 权益到期损益图（纯展示）
 * 输入：API presentRight → analytics.payoff（业务真相源）
 * 输出：SVG 绑定所需几何与文案，不在前端重算行权/盈亏
 */

const SIZE = { w: 420, h: 180, padL: 42, padR: 14, padT: 18, padB: 32 };

const MONEYNESS_ZH = { ITM: '实值', OTM: '虚值', ATM: '平值' };

export function fmtNum(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(digits);
}

export function fmtSigned(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
}

export function moneynessLabel(m) {
  return MONEYNESS_ZH[m] || '—';
}

/**
 * @param {object} payoff analytics.payoff
 * @param {{ kind: string, qty: number }} meta
 * @returns {object|null}
 */
export function buildPayoffChart(payoff, meta) {
  const points = Array.isArray(payoff?.points)
    ? payoff.points.filter((p) => Number.isFinite(p?.spot) && Number.isFinite(p?.pnl))
    : [];
  if (points.length < 2 || !Number.isFinite(Number(payoff?.strike))) return null;

  const kind = meta.kind;
  const qty = Number(meta.qty) || 0;
  const strike = Number(payoff.strike);
  const breakeven = Number(payoff.breakeven);
  const maxLoss = Number(payoff.max_loss);
  const spot = payoff.spot == null || !Number.isFinite(Number(payoff.spot)) ? null : Number(payoff.spot);
  const currentPnl =
    payoff.current_pnl == null || !Number.isFinite(Number(payoff.current_pnl))
      ? null
      : Number(payoff.current_pnl);
  const moneyness = payoff.moneyness || null;

  const xs = points.map((p) => p.spot);
  const ys = points.map((p) => p.pnl);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys, 0);
  let maxY = Math.max(...ys, 0);
  const span = Math.max(maxY - minY, Math.max(Math.abs(maxY), Math.abs(minY), 0.01) * 0.5);
  const padY = span * 0.12;
  minY -= padY;
  maxY += padY;

  const { w, h, padL, padR, padT, padB } = SIZE;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const sx = (x) => padL + ((x - minX) / (maxX - minX || 1)) * iw;
  const sy = (y) => padT + ih - ((y - minY) / (maxY - minY || 1)) * ih;
  const clampX = (v) => sx(Math.min(maxX, Math.max(minX, Number(v))));

  const zero = sy(0);
  const left = sx(minX);
  const right = sx(maxX);
  const dataMin = Math.min(...ys, 0);
  const dataMax = Math.max(...ys, 0);

  const yTicks = [dataMin, dataMax]
    .filter((v, i, a) => a.indexOf(v) === i && Math.abs(v) > 1e-9)
    .map((v) => ({ key: `y-${v}`, y: sy(v), label: fmtSigned(v) }));

  // 横轴：按像素间距去重，关键价位优先（S > K > BE > 端点），避免右下角 28.63/29.96 叠字
  const xTicks = pickXTicks({
    minX,
    maxX,
    strike,
    breakeven,
    spot,
    clampX,
    minPx: 44,
  });

  const spotX = spot == null ? null : clampX(spot);
  // 贴近右缘时标签放左侧，避免与轴端刻度挤在一起
  const spotLabelLeft = spotX != null && spotX > padL + iw * 0.72;

  const total =
    currentPnl == null || !(qty > 0) ? null : Math.round(currentPnl * qty * 100) / 100;

  return {
    size: SIZE,
    viewBox: `0 0 ${w} ${h}`,
    path: points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.spot)},${sy(p.pnl)}`).join(' '),
    profitZone: `M${left},${zero} L${right},${zero} L${right},${padT} L${left},${padT} Z`,
    lossZone: `M${left},${zero} L${right},${zero} L${right},${h - padB} L${left},${h - padB} Z`,
    zero,
    padL,
    padR,
    padT,
    padB,
    w,
    h,
    rotateY: `rotate(-90 12 ${h / 2})`,
    yTicks,
    xTicks,
    kX: clampX(strike),
    beX: Math.abs(breakeven - strike) > 1e-6 ? clampX(breakeven) : null,
    spotX,
    spotY: currentPnl == null ? null : sy(currentPnl),
    spotLabelX: spotX == null ? null : spotLabelLeft ? spotX - 5 : spotX + 5,
    spotLabelAnchor: spotLabelLeft ? 'end' : 'start',
    strike,
    breakeven,
    maxLoss,
    spot,
    currentPnl,
    moneyness,
    total,
    qty,
    beFormula: kind === 'call' ? 'K + 单位权利金' : 'K − 单位权利金',
    pnlClass:
      currentPnl > 0 ? 'text-emerald-300' : currentPnl < 0 ? 'text-rose-300' : 'text-slate-300',
    insight: insightText({ kind, strike, breakeven, maxLoss, spot, currentPnl, moneyness }),
    aria: `${kind === 'call' ? '认购' : '认沽'}到期损益图`,
  };
}

/** 横轴刻度：像素碰撞检测 + 关键价优先 */
function pickXTicks({ minX, maxX, strike, breakeven, spot, clampX, minPx }) {
  const cands = [
    { v: spot, pri: 4, role: 'S' },
    { v: strike, pri: 3, role: 'K' },
    { v: Math.abs(breakeven - strike) > 1e-6 ? breakeven : null, pri: 2, role: 'BE' },
    { v: minX, pri: 1, role: 'min' },
    { v: maxX, pri: 0, role: 'max' },
  ].filter((c) => c.v != null && Number.isFinite(c.v));

  cands.sort((a, b) => b.pri - a.pri || a.v - b.v);
  const placed = [];
  for (const c of cands) {
    const x = clampX(c.v);
    if (placed.some((p) => Math.abs(p.x - x) < minPx)) continue;
    placed.push({ key: `x-${c.role}`, v: c.v, x, label: fmtNum(c.v) });
  }
  placed.sort((a, b) => a.v - b.v);
  return placed;
}

function insightText({ kind, strike, breakeven, maxLoss, spot, currentPnl, moneyness }) {
  const product = kind === 'call' ? '认购（优先使用权）' : '认沽（回售保障）';
  const k = fmtNum(strike);
  const be = fmtNum(breakeven);
  const loss = fmtNum(maxLoss);
  if (spot == null) {
    return `${product}：到期最大亏损为权利金 ${loss}/单位；结算价越过 ${be} 后进入盈利区（行权价 ${k}）。`;
  }
  const m = moneynessLabel(moneyness);
  const cur = fmtSigned(currentPnl);
  const s = fmtNum(spot);
  if (kind === 'call') {
    if (moneyness === 'OTM') {
      return `当前现货 ${s} 低于行权价 ${k}（${m}）。若到期仍低于 ${be}，损益约为 ${loss}/单位；越过盈亏平衡后随现货上涨。当前隐含单位损益 ${cur}。`;
    }
    if (moneyness === 'ITM') {
      return `当前现货 ${s} 高于行权价 ${k}（${m}）。窗内可按锁定价优先使用；相对盈亏平衡 ${be}，当前隐含单位损益 ${cur}。`;
    }
  } else {
    if (moneyness === 'OTM') {
      return `当前现货 ${s} 高于行权价 ${k}（${m}）。保障暂未激活；跌破 ${be} 后回售差价开始覆盖权利金。当前隐含单位损益 ${cur}。`;
    }
    if (moneyness === 'ITM') {
      return `当前现货 ${s} 低于行权价 ${k}（${m}）。窗内可按行权价回售差价；相对盈亏平衡 ${be}，当前隐含单位损益 ${cur}。`;
    }
  }
  return `当前现货贴近行权价 ${k}（${m}）。盈亏平衡 ${be}；最大亏损 ${loss}/单位。当前隐含单位损益 ${cur}。`;
}

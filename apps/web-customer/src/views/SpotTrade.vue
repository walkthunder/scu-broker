<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api';

const skus = ref([]);
const regions = ref([]);
const book = ref({ bids: [], asks: [], impact: null, indicative: null });
const form = reactive({
  sku_id: null,
  region: 'shanghai',
  side: 'buy',
  order_type: 'limit',
  price: 0,
  qty: 1,
});
const msg = ref('');
const err = ref('');
const curve = ref([]);
const myOrders = ref([]);

const DEPTH = 8;
const CHART_W = 640;
const CHART_H = 220;
const PAD = { l: 56, r: 16, t: 16, b: 28 };

function fmtPrice(v) {
  const n = Number(v);
  if (!(n > 0) && n !== 0) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function fmtQty(v) {
  const n = Number(v);
  if (!(n >= 0)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtShortDate(d) {
  if (!d) return '';
  const s = String(d);
  return s.length >= 10 ? s.slice(5, 10) : s;
}

const selectedSku = computed(() => skus.value.find((s) => s.id === form.sku_id) || null);
const regionName = computed(
  () => regions.value.find((r) => r.code === form.region)?.name || form.region,
);

/** 盘口 = 真实挂单（API 已聚合排序）；做市价不进档位 */
const bidRows = computed(() => (book.value.bids || []).slice(0, DEPTH));
const askRows = computed(() => (book.value.asks || []).slice(0, DEPTH));
const askRowsStacked = computed(() => [...askRows.value].reverse());
const reference = computed(() => book.value.indicative || null);

const maxDepthQty = computed(() => {
  const qs = [...bidRows.value, ...askRows.value].map((r) => Number(r.qty) || 0);
  return Math.max(1, ...qs);
});

const bestBid = computed(() => (bidRows.value[0] ? Number(bidRows.value[0].price) : null));
const bestAsk = computed(() => (askRows.value[0] ? Number(askRows.value[0].price) : null));

const impactForSide = computed(() => {
  const imp = book.value.impact;
  if (!imp) return null;
  return form.side === 'sell' ? imp.sell : imp.buy;
});

const spread = computed(() => {
  if (!(bestBid.value > 0) || !(bestAsk.value > 0)) return null;
  return Math.round((bestAsk.value - bestBid.value) * 10000) / 10000;
});

const midPrice = computed(() => {
  if (bestBid.value > 0 && bestAsk.value > 0) {
    return Math.round(((bestBid.value + bestAsk.value) / 2) * 10000) / 10000;
  }
  return null;
});

/** 曲线原样展示已发布 S（脏数据在写入口治理，前端不滤） */
const chartSeries = computed(() =>
  (curve.value || [])
    .map((p) => ({ date: p.date, settle: Number(p.settle) }))
    .filter((p) => p.date && p.settle > 0)
    .slice(-30),
);

const lastSettle = computed(() => {
  const pts = chartSeries.value;
  return pts.length ? pts[pts.length - 1].settle : null;
});

const prevSettle = computed(() => {
  const pts = chartSeries.value;
  return pts.length > 1 ? pts[pts.length - 2].settle : null;
});

const chg = computed(() => {
  if (!(lastSettle.value > 0) || !(prevSettle.value > 0)) return null;
  const d = lastSettle.value - prevSettle.value;
  const pct = (d / prevSettle.value) * 100;
  return { d, pct };
});

const chgUp = computed(() => chg.value != null && chg.value.d >= 0);

const chartGeom = computed(() => {
  const pts = chartSeries.value;
  if (pts.length < 2) return null;
  const ys = pts.map((p) => p.settle);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const padY = (maxY - minY) * 0.12 || maxY * 0.02 || 1;
  minY -= padY;
  maxY += padY;
  const iw = CHART_W - PAD.l - PAD.r;
  const ih = CHART_H - PAD.t - PAD.b;
  const xAt = (i) => PAD.l + (i / (pts.length - 1)) * iw;
  const yAt = (v) => PAD.t + ((maxY - v) / (maxY - minY || 1)) * ih;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.settle).toFixed(1)}`).join(' ');
  const area = `${line} L${xAt(pts.length - 1).toFixed(1)},${(PAD.t + ih).toFixed(1)} L${xAt(0).toFixed(1)},${(PAD.t + ih).toFixed(1)} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = minY + (maxY - minY) * (1 - t);
    return { y: PAD.t + t * ih, label: fmtPrice(v) };
  });
  const xLabels = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i) => ({
    x: xAt(i),
    label: fmtShortDate(pts[i].date),
  }));
  const last = {
    x: xAt(pts.length - 1),
    y: yAt(pts[pts.length - 1].settle),
    v: pts[pts.length - 1].settle,
  };
  return { line, area, yTicks, xLabels, last, up: chgUp.value };
});

function depthPct(qty) {
  if (!(Number(qty) > 0)) return '0%';
  return `${Math.min(100, (Number(qty) / maxDepthQty.value) * 100)}%`;
}

function pickPrice(px, side) {
  form.price = Number(px);
  if (side) form.side = side;
}

async function loadMeta() {
  try {
    skus.value = (await api('/customer/skus')).data || [];
    regions.value = (await api('/frd/meta/regions')).data || [];
    if (skus.value[0]) form.sku_id = skus.value[0].id;
    await refreshBook();
    await loadOrders();
  } catch (e) {
    err.value = e.message;
  }
}

async function loadOrders() {
  try {
    myOrders.value = (await api('/frd/spot/orders/mine')).data || [];
  } catch (e) {
    void e;
  }
}

async function refreshBook() {
  if (!form.sku_id) return;
  try {
    book.value = (
      await api(`/frd/spot/book?sku_id=${form.sku_id}&region=${form.region}&qty=${form.qty}`)
    ).data;
    curve.value =
      (await api(`/frd/curves?sku_id=${form.sku_id}&region=${form.region}&kind=spot`)).data || [];
  } catch (e) {
    err.value = e.message;
  }
}

async function place() {
  err.value = '';
  msg.value = '';
  try {
    const r = await api('/frd/spot/orders', { method: 'POST', body: { ...form } });
    if (r.data?.require_rfq) {
      msg.value = r.data.message + ' → 请走询价';
      return;
    }
    msg.value = `下单成功 #${r.data?.order?.id} 状态 ${r.data?.order?.status}`;
    await refreshBook();
    await loadOrders();
  } catch (e) {
    err.value = e.message;
  }
}

async function cancel(id) {
  err.value = '';
  try {
    await api(`/frd/spot/orders/${id}/cancel`, { method: 'POST' });
    msg.value = `已取消 #${id}`;
    await refreshBook();
    await loadOrders();
  } catch (e) {
    err.value = e.message;
  }
}

const openOrders = computed(() =>
  myOrders.value.filter((x) => ['open', 'partial'].includes(x.status)),
);

onMounted(loadMeta);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:py-8">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">现货交易台</h1>
        <p class="page-desc">盘口深度 · 限价/市价 · 结算价走势 · 大额引导 RFQ</p>
      </div>
      <div class="font-mono text-right text-sm">
        <div class="text-xs uppercase tracking-wider text-slate-500">
          {{ selectedSku?.name || '—' }} · {{ regionName }}
        </div>
        <div class="mt-0.5 flex items-baseline justify-end gap-2">
          <span
            class="text-2xl font-semibold tabular-nums"
            :class="chg == null ? 'text-slate-100' : chgUp ? 'text-[var(--up)]' : 'text-[var(--down)]'"
          >
            {{ lastSettle != null ? fmtPrice(lastSettle) : '—' }}
          </span>
          <span
            v-if="chg"
            class="text-xs tabular-nums"
            :class="chgUp ? 'text-[var(--up)]' : 'text-[var(--down)]'"
          >
            {{ chgUp ? '+' : '' }}{{ fmtPrice(chg.d) }}
            ({{ chgUp ? '+' : '' }}{{ chg.pct.toFixed(2) }}%)
          </span>
        </div>
        <div class="text-[11px] text-slate-500">近结 S · 相对前一交易日</div>
      </div>
    </div>

    <div class="mt-6 grid gap-4 lg:grid-cols-12">
      <!-- 下单 -->
      <div class="panel p-4 lg:col-span-4">
        <div class="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">下单</h2>
          <div class="flex rounded-sm border border-slate-700 p-0.5 text-xs">
            <button
              type="button"
              class="inline-flex min-h-[44px] items-center px-3 transition-colors"
              :class="
                form.side === 'buy'
                  ? 'bg-[var(--up)]/20 font-medium text-[var(--up)]'
                  : 'text-slate-500 hover:text-slate-300'
              "
              @click="form.side = 'buy'"
            >
              买入
            </button>
            <button
              type="button"
              class="inline-flex min-h-[44px] items-center px-3 transition-colors"
              :class="
                form.side === 'sell'
                  ? 'bg-[var(--down)]/20 font-medium text-[var(--down)]'
                  : 'text-slate-500 hover:text-slate-300'
              "
              @click="form.side = 'sell'"
            >
              卖出
            </button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <label class="col-span-2">
            <span class="text-xs text-slate-500">标的</span>
            <select v-model="form.sku_id" class="mt-1 w-full font-mono" @change="refreshBook">
              <option v-for="s in skus" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <label>
            <span class="text-xs text-slate-500">区域</span>
            <select v-model="form.region" class="mt-1 w-full font-mono" @change="refreshBook">
              <option v-for="r in regions" :key="r.code" :value="r.code">{{ r.name }}</option>
            </select>
          </label>
          <label>
            <span class="text-xs text-slate-500">类型</span>
            <select v-model="form.order_type" class="mt-1 w-full font-mono">
              <option value="limit">限价</option>
              <option value="market">市价</option>
            </select>
          </label>
          <label>
            <span class="text-xs text-slate-500">价格</span>
            <input
              v-model.number="form.price"
              type="number"
              class="mt-1 w-full font-mono tabular-nums"
              :disabled="form.order_type === 'market'"
            />
          </label>
          <label>
            <span class="text-xs text-slate-500">数量</span>
            <input
              v-model.number="form.qty"
              type="number"
              class="mt-1 w-full font-mono tabular-nums"
              @change="refreshBook"
            />
          </label>
        </div>
        <button
          class="mt-4 w-full rounded-sm px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 min-h-[44px]"
          type="button"
          :class="form.side === 'buy' ? 'bg-[var(--up)]' : 'bg-[var(--down)]'"
          @click="place"
        >
          {{ form.side === 'buy' ? '买入下单' : '卖出下单' }}
        </button>
        <p v-if="msg" class="mt-2 text-sm text-amber-400">{{ msg }}</p>
        <p v-if="err" class="mt-2 text-sm text-[var(--up)]">{{ err }}</p>
        <p v-if="impactForSide && (bidRows.length || askRows.length)" class="mt-3 font-mono text-[11px] text-slate-500">
          冲击均价 {{ fmtPrice(impactForSide.avg_price) }} · 未成交
          {{ fmtQty(impactForSide.unfilled) }}
          <span v-if="impactForSide.suggest_rfq" class="text-amber-400"> · 建议 RFQ</span>
        </p>
        <p v-else-if="!(bidRows.length || askRows.length)" class="mt-3 font-mono text-[11px] text-slate-500">
          当前无对手挂单
        </p>
      </div>

      <!-- 盘口 -->
      <div class="panel overflow-hidden lg:col-span-8">
        <div class="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">五档盘口</h2>
          <button
            type="button"
            class="text-[11px] text-slate-500 hover:text-amber-400"
            @click="refreshBook"
          >
            刷新
          </button>
        </div>
        <!-- 宽屏：左买右卖（同花顺式对照） -->
        <div class="hidden sm:grid sm:grid-cols-2 sm:divide-x sm:divide-slate-800">
          <div class="px-2 pb-2">
            <div
              class="grid grid-cols-3 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500"
            >
              <span>档位</span><span class="text-right">数量</span><span class="text-right">买价</span>
            </div>
            <div
              v-for="(b, i) in bidRows"
              :key="'b' + i"
              class="relative mb-0.5 cursor-pointer overflow-hidden rounded-sm py-1.5 pl-2 pr-2 transition-colors hover:bg-slate-800/60"
              @click="pickPrice(b.price, 'buy')"
            >
              <div
                class="pointer-events-none absolute inset-y-0 right-0 bg-[var(--up)]/15"
                :style="{ width: depthPct(b.qty) }"
              />
              <div class="relative grid grid-cols-3 font-mono text-xs tabular-nums">
                <span class="text-slate-500">买{{ i + 1 }}</span>
                <span class="text-right text-slate-300">{{ fmtQty(b.qty) }}</span>
                <span class="text-right font-medium text-[var(--up)]">{{ fmtPrice(b.price) }}</span>
              </div>
            </div>
            <p v-if="!bidRows.length" class="px-2 py-6 text-center text-xs text-slate-600">暂无买盘</p>
          </div>
          <div class="px-2 pb-2">
            <div
              class="grid grid-cols-3 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500"
            >
              <span>卖价</span><span class="text-right">数量</span><span class="text-right">档位</span>
            </div>
            <div
              v-for="(a, i) in askRows"
              :key="'a' + i"
              class="relative mb-0.5 cursor-pointer overflow-hidden rounded-sm py-1.5 pl-2 pr-2 transition-colors hover:bg-slate-800/60"
              @click="pickPrice(a.price, 'sell')"
            >
              <div
                class="pointer-events-none absolute inset-y-0 left-0 bg-[var(--down)]/15"
                :style="{ width: depthPct(a.qty) }"
              />
              <div class="relative grid grid-cols-3 font-mono text-xs tabular-nums">
                <span class="font-medium text-[var(--down)]">{{ fmtPrice(a.price) }}</span>
                <span class="text-right text-slate-300">{{ fmtQty(a.qty) }}</span>
                <span class="text-right text-slate-500">卖{{ i + 1 }}</span>
              </div>
            </div>
            <p v-if="!askRows.length" class="px-2 py-6 text-center text-xs text-slate-600">暂无卖盘</p>
          </div>
        </div>

        <!-- 窄屏：卖上买下，卖一贴近中间价差 -->
        <div class="sm:hidden px-2 pb-2">
          <div
            v-for="(a, i) in askRowsStacked"
            :key="'ma' + i"
            class="relative mb-0.5 cursor-pointer overflow-hidden rounded-sm py-1.5 px-2"
            @click="pickPrice(a.price, 'sell')"
          >
            <div
              class="pointer-events-none absolute inset-y-0 right-0 bg-[var(--down)]/15"
              :style="{ width: depthPct(a.qty) }"
            />
            <div class="relative flex justify-between font-mono text-xs tabular-nums">
              <span class="text-slate-500">卖{{ askRowsStacked.length - i }}</span>
              <span class="text-slate-300">{{ fmtQty(a.qty) }}</span>
              <span class="font-medium text-[var(--down)]">{{ fmtPrice(a.price) }}</span>
            </div>
          </div>
          <div
            class="my-2 flex items-center justify-between rounded-sm border border-slate-800 bg-slate-900/80 px-3 py-2 font-mono text-xs"
          >
            <span class="text-slate-500">价差</span>
            <span class="tabular-nums text-amber-400">{{ spread != null ? fmtPrice(spread) : '—' }}</span>
            <span class="text-slate-500">中间价</span>
            <span class="tabular-nums text-slate-200">{{ midPrice != null ? fmtPrice(midPrice) : '—' }}</span>
          </div>
          <div
            v-for="(b, i) in bidRows"
            :key="'mb' + i"
            class="relative mb-0.5 cursor-pointer overflow-hidden rounded-sm py-1.5 px-2"
            @click="pickPrice(b.price, 'buy')"
          >
            <div
              class="pointer-events-none absolute inset-y-0 right-0 bg-[var(--up)]/15"
              :style="{ width: depthPct(b.qty) }"
            />
            <div class="relative flex justify-between font-mono text-xs tabular-nums">
              <span class="text-slate-500">买{{ i + 1 }}</span>
              <span class="text-slate-300">{{ fmtQty(b.qty) }}</span>
              <span class="font-medium text-[var(--up)]">{{ fmtPrice(b.price) }}</span>
            </div>
          </div>
        </div>

        <div
          class="hidden items-center justify-between border-t border-slate-800 bg-slate-900/50 px-4 py-2 font-mono text-xs sm:flex"
        >
          <div>
            <span class="text-slate-500">买一 </span>
            <span class="tabular-nums text-[var(--up)]">{{ fmtPrice(bestBid) }}</span>
          </div>
          <div>
            <span class="text-slate-500">价差 </span>
            <span class="tabular-nums text-amber-400">{{ spread != null ? fmtPrice(spread) : '—' }}</span>
            <span class="mx-2 text-slate-700">|</span>
            <span class="text-slate-500">中间价 </span>
            <span class="tabular-nums text-slate-200">{{ midPrice != null ? fmtPrice(midPrice) : '—' }}</span>
          </div>
          <div>
            <span class="text-slate-500">卖一 </span>
            <span class="tabular-nums text-[var(--down)]">{{ fmtPrice(bestAsk) }}</span>
          </div>
        </div>
        <div
          v-if="reference"
          class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-2 font-mono text-[11px]"
        >
          <span class="text-slate-500">
            做市参考（非挂单）· {{ reference.source === 'partner' ? '伙伴' : '做市' }}
          </span>
          <div class="flex gap-3">
            <button type="button" class="text-[var(--up)] hover:underline" @click="pickPrice(reference.bid, 'buy')">
              Bid {{ fmtPrice(reference.bid) }}
            </button>
            <button type="button" class="text-[var(--down)] hover:underline" @click="pickPrice(reference.ask, 'sell')">
              Ask {{ fmtPrice(reference.ask) }}
            </button>
          </div>
        </div>
        <p class="border-t border-slate-800/80 px-4 py-1.5 text-[10px] text-slate-600">
          点击档位填入下单区 · 深度条为相对挂单量
        </p>
      </div>
    </div>

    <!-- 结算价走势 -->
    <div class="panel mt-4 overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
        <div>
          <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">现货结算价走势</h2>
          <p class="mt-0.5 text-[11px] text-slate-600">已发布日结算价 S · 近 {{ chartSeries.length }} 个交易日</p>
        </div>
        <div v-if="lastSettle" class="font-mono text-right text-xs">
          <span class="text-slate-500">最新 S </span>
          <span
            class="tabular-nums font-medium"
            :class="chg == null ? 'text-slate-200' : chgUp ? 'text-[var(--up)]' : 'text-[var(--down)]'"
          >
            {{ fmtPrice(lastSettle) }}
          </span>
        </div>
      </div>
      <div class="relative px-2 py-3 sm:px-4">
        <svg
          v-if="chartGeom"
          class="h-[200px] w-full sm:h-[240px]"
          :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          :aria-label="`结算价走势，最新 ${fmtPrice(lastSettle)}`"
        >
          <defs>
            <linearGradient id="spotSettleFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                :stop-color="chartGeom.up ? '#ef4444' : '#22c55e'"
                stop-opacity="0.28"
              />
              <stop
                offset="100%"
                :stop-color="chartGeom.up ? '#ef4444' : '#22c55e'"
                stop-opacity="0.02"
              />
            </linearGradient>
          </defs>
          <line
            v-for="(t, i) in chartGeom.yTicks"
            :key="'g' + i"
            :x1="PAD.l"
            :x2="CHART_W - PAD.r"
            :y1="t.y"
            :y2="t.y"
            stroke="#1e293b"
            stroke-width="1"
          />
          <text
            v-for="(t, i) in chartGeom.yTicks"
            :key="'yl' + i"
            :x="PAD.l - 6"
            :y="t.y + 3"
            text-anchor="end"
            fill="#64748b"
            font-size="9"
            font-family="IBM Plex Mono, monospace"
          >
            {{ t.label }}
          </text>
          <path :d="chartGeom.area" fill="url(#spotSettleFill)" />
          <path
            :d="chartGeom.line"
            fill="none"
            :stroke="chartGeom.up ? '#ef4444' : '#22c55e'"
            stroke-width="1.75"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
          <circle
            :cx="chartGeom.last.x"
            :cy="chartGeom.last.y"
            r="3.5"
            :fill="chartGeom.up ? '#ef4444' : '#22c55e'"
            stroke="#0b1220"
            stroke-width="1.5"
          />
          <text
            v-for="(x, i) in chartGeom.xLabels"
            :key="'xl' + i"
            :x="x.x"
            :y="CHART_H - 8"
            text-anchor="middle"
            fill="#64748b"
            font-size="9"
            font-family="IBM Plex Mono, monospace"
          >
            {{ x.label }}
          </text>
        </svg>
        <p v-else class="py-16 text-center text-sm text-slate-600">暂无足够结算价样本绘制走势</p>
      </div>
    </div>

    <div class="panel mt-4 p-4">
      <div class="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">我的挂单</h2>
        <span class="font-mono text-[11px] text-slate-600">{{ openOrders.length }} 笔未完成</span>
      </div>
      <div
        v-for="o in openOrders"
        :key="o.id"
        class="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 py-2 text-sm last:mb-0 last:border-0"
      >
        <span class="font-mono text-xs text-slate-400">
          <span :class="o.side === 'buy' ? 'text-[var(--up)]' : 'text-[var(--down)]'">
            {{ o.side === 'buy' ? '买' : '卖' }}
          </span>
          #{{ o.id }} · {{ o.sku?.name || form.sku_id }} {{ o.region }} ·
          <span class="text-slate-200">{{ fmtPrice(o.price) }}</span>
          × {{ fmtQty(o.qty) }}
          <span class="text-slate-600"> · {{ o.status }}</span>
        </span>
        <button type="button" class="btn-secondary text-xs" @click="cancel(o.id)">取消</button>
      </div>
      <p v-if="!openOrders.length" class="text-sm text-slate-500">暂无未完成挂单</p>
    </div>
  </div>
</template>

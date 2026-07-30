<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const POLL_MS = 30_000;
const router = useRouter();
const list = ref([]);
const hot = ref([]);
const indices = ref([]);
const announcement = ref(null);
const bulletin = ref(null);
const pulse = ref(null);
const feeds = ref([]);
const err = ref('');
const loading = ref(true);
const filter = ref('all');
const announceDismissed = ref(localStorage.getItem('comprix_announce_dismiss') === '1');
const lastSyncedAt = ref(null);
const clockNow = ref(Date.now());
const refreshing = ref(false);
const flashIds = ref(new Set());

let pollTimer;
let clockTimer;

const filtered = computed(() => {
  if (filter.value === 'all') return list.value;
  return list.value.filter((r) => r.type === filter.value);
});

/** 已发布结算价的指数（首页速览，完整列表在 /indices） */
const publishedIndices = computed(() =>
  (indices.value || []).filter((i) => i.latest_published),
);

const syncAgeText = computed(() => {
  if (!lastSyncedAt.value) return '—';
  const sec = Math.max(0, Math.floor((clockNow.value - lastSyncedAt.value) / 1000));
  if (sec < 5) return '刚刚同步';
  if (sec < 60) return `${sec} 秒前同步`;
  return `${Math.floor(sec / 60)} 分前同步`;
});

function bulletinLines(b) {
  if (!b) return [];
  let payload = b.payload;
  let snapshot = b.snapshot;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  if (typeof snapshot === 'string') {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      snapshot = null;
    }
  }
  return payload?.lines || snapshot?.lines || [];
}

const clockText = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(clockNow.value),
);

const tickerItems = computed(() => {
  if (feeds.value.length) {
    return feeds.value.map(
      (f) => `${f.region} · ${f.sku_name} · ${f.deal_type} · ${f.deal_date}`,
    );
  }
  return [pulse.value?.pulse_text || '行情已更新', pulse.value?.sla_hint || '正式报价 24 小时有效'].filter(
    Boolean,
  );
});

function fmt(v) {
  return v == null ? '—' : Number(v).toLocaleString('zh-CN');
}

function changeClass(pct) {
  if (pct == null) return 'text-slate-500';
  if (pct > 0) return 'price-up';
  if (pct < 0) return 'price-down';
  return 'text-slate-400';
}

function markFlash(ids) {
  if (!ids.length) return;
  const next = new Set(flashIds.value);
  ids.forEach((id) => next.add(id));
  flashIds.value = next;
  setTimeout(() => {
    const cleared = new Set(flashIds.value);
    ids.forEach((id) => cleared.delete(id));
    flashIds.value = cleared;
  }, 1200);
}

function diffPriceRows(prev, next) {
  const map = new Map(prev.map((r) => [r.sku_id, r]));
  const changed = [];
  for (const row of next) {
    const old = map.get(row.sku_id);
    if (!old) continue;
    if (
      Number(old.price_mid) !== Number(row.price_mid) ||
      old.change_label !== row.change_label
    ) {
      changed.push(row.sku_id);
    }
  }
  return changed;
}

async function loadMarket({ silent = false } = {}) {
  if (!silent) loading.value = true;
  else refreshing.value = true;
  try {
    const [prices, hots, ann, pul, feed, idx, bull] = await Promise.all([
      api('/customer/reference-prices'),
      api('/customer/hot-skus'),
      api('/customer/announcement'),
      api('/customer/market-pulse'),
      api('/customer/deal-feeds'),
      api('/customer/indices'),
      api('/frd/price-bulletins/latest').catch(() => ({ data: null })),
    ]);
    const nextList = prices.data || [];
    if (silent && list.value.length) {
      markFlash(diffPriceRows(list.value, nextList));
    }
    list.value = nextList;
    hot.value = hots.data || [];
    announcement.value = ann.data;
    bulletin.value = bull.data || null;
    pulse.value = pul.data;
    feeds.value = feed.data || [];
    indices.value = idx.data || [];
    lastSyncedAt.value = Date.now();
    err.value = '';
  } catch (e) {
    if (!silent) err.value = e.message;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    loadMarket({ silent: true });
  }, POLL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    loadMarket({ silent: true });
    startPolling();
  } else {
    stopPolling();
  }
}

onMounted(async () => {
  clockTimer = setInterval(() => {
    clockNow.value = Date.now();
  }, 1000);
  await loadMarket();
  startPolling();
  document.addEventListener('visibilitychange', onVisibility);
});

onUnmounted(() => {
  stopPolling();
  if (clockTimer) clearInterval(clockTimer);
  document.removeEventListener('visibilitychange', onVisibility);
});

function dismissAnnounce() {
  announceDismissed.value = true;
  localStorage.setItem('comprix_announce_dismiss', '1');
}

function goRfq(skuId, page = 'home') {
  router.push({ path: '/rfq', query: { ...(skuId ? { sku_id: skuId } : {}), from: page } });
}

function scrollToMarket() {
  document.getElementById('market-table')?.scrollIntoView({ behavior: 'smooth' });
}
</script>

<template>
  <div>
    <!-- 通告 -->
    <div
      v-if="announcement && !announceDismissed"
      class="border-b border-slate-700 px-4 py-2 text-sm"
      :style="{ background: announcement.bg_color, color: announcement.text_color }"
    >
      <div class="mx-auto flex max-w-6xl items-start justify-between gap-4">
        <p>
          <span class="font-medium">{{ announcement.title }}</span>
          <span v-if="announcement.content" class="ml-2 opacity-80">{{ announcement.content }}</span>
        </p>
        <button type="button" class="shrink-0 opacity-70 hover:opacity-100" @click="dismissAnnounce">关闭</button>
      </div>
    </div>

    <!-- FRD 日价格公告（价格发现正式结算价） -->
    <div
      v-if="bulletin?.status === 'published'"
      class="border-b border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-slate-300"
    >
      <div class="mx-auto max-w-6xl">
        <span class="font-medium text-amber-400">日价格公告 {{ bulletin.date }}</span>
        <span class="ml-2 text-slate-500">正式结算价</span>
        <span
          v-for="line in bulletinLines(bulletin).slice(0, 4)"
          :key="line.code"
          class="ml-3 font-mono text-xs text-slate-400"
        >
          {{ line.code }}={{ line.settle_price }}
        </span>
        <router-link to="/console" class="ml-3 text-xs text-amber-400/90 underline">控制台全文</router-link>
      </div>
    </div>

    <!-- 交易台顶栏：品牌压缩为一行，行情板才是首屏主体 -->
    <section class="border-b border-slate-700 bg-slate-950">
      <div class="mx-auto max-w-6xl px-4 py-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 class="font-mono text-sm font-semibold tracking-[0.14em] text-slate-100 uppercase">CompriX</h1>
            <span class="live-pill">
              <span class="live-dot" />
              LIVE
            </span>
            <span class="font-mono text-xs text-slate-500">{{ clockText }}</span>
            <span class="hidden text-xs text-slate-500 sm:inline">GPU / Token 现货参考价 · 结算指数见下方 / 导航「指数」</span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button type="button" class="btn-secondary !py-1.5 !text-xs" @click="scrollToMarket">全表</button>
            <button type="button" class="btn-primary !py-1.5 !text-xs" @click="goRfq(null, 'home')">询价</button>
          </div>
        </div>
      </div>

      <!-- 首屏主视觉：热门报价板（交易所 top pairs） -->
      <div class="border-t border-slate-800 bg-slate-900/80">
        <div class="mx-auto max-w-6xl px-4 py-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span class="font-mono uppercase tracking-wider text-slate-500">热门报价</span>
            <span class="font-mono text-slate-600">
              AS OF {{ pulse?.price_as_of || '—' }} ·
              <span v-if="refreshing" class="text-amber-500">同步中</span>
              <span v-else>{{ syncAgeText }}</span>
              · {{ POLL_MS / 1000 }}s
            </span>
          </div>
          <p v-if="err" class="mb-2 text-sm text-red-400">{{ err }}</p>
          <p v-else-if="loading" class="py-6 font-mono text-sm text-slate-500">加载行情板…</p>
          <div v-else class="grid grid-cols-2 gap-px overflow-hidden border border-slate-700 bg-slate-700 sm:grid-cols-3 lg:grid-cols-6">
            <button
              v-for="card in hot"
              :key="card.sku_id"
              type="button"
              class="board-cell group text-left"
              :class="flashIds.has(card.sku_id) ? 'row-flash' : ''"
              @click="$router.push(`/sku/${card.sku_id}`)"
            >
              <div class="flex items-start justify-between gap-1">
                <p class="truncate font-mono text-sm font-semibold text-slate-100">{{ card.name }}</p>
                <span :class="['shrink-0 font-mono text-[10px]', changeClass(card.change_pct)]">
                  {{ card.change_label }}
                </span>
              </div>
              <p class="mono-num mt-2 text-xl font-semibold leading-none text-amber-500">
                {{ fmt(card.price_mid) }}
              </p>
              <p class="mt-1 truncate font-mono text-[10px] text-slate-500">
                {{ fmt(card.price_low) }}–{{ fmt(card.price_high) }}
                <span class="text-slate-600">/{{ card.unit }}</span>
              </p>
              <span
                class="mt-2 inline-block font-mono text-[10px] text-amber-500/80 group-hover:text-amber-400"
                @click.stop="goRfq(card.sku_id, 'home')"
              >
                询价 →
              </span>
            </button>
            <p
              v-if="!hot.length"
              class="col-span-full bg-slate-900 px-3 py-8 text-center text-sm text-slate-500"
            >
              暂无热门 SKU，请查看下方完整行情。
            </p>
          </div>
        </div>
      </div>

      <!-- 结算指数速览：与现货热门板区分 -->
      <div
        v-if="!loading && publishedIndices.length"
        class="border-t border-slate-800 bg-slate-950"
      >
        <div class="mx-auto max-w-6xl px-4 py-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span class="font-mono uppercase tracking-wider text-slate-500">
              结算指数 S
              <span class="ml-2 hidden font-sans normal-case tracking-normal text-slate-600 sm:inline">
                远期盯市 / 到期结算用 · 非现货报价
              </span>
            </span>
            <router-link
              to="/indices"
              class="tap-target inline-flex items-center font-mono text-amber-500/90 hover:text-amber-400"
            >
              全部指数 →
            </router-link>
          </div>
          <div class="flex gap-2 overflow-x-auto pb-1" style="-webkit-overflow-scrolling: touch">
            <router-link
              v-for="ix in publishedIndices"
              :key="ix.id"
              to="/indices"
              class="tap-target shrink-0 rounded border border-slate-700 bg-slate-900/90 px-3 py-2 hover:border-amber-500/40"
            >
              <p class="font-mono text-xs font-semibold text-slate-200">{{ ix.code }}</p>
              <p class="mono-num mt-1 text-lg font-semibold text-amber-500">
                {{ fmt(ix.latest_published.settle_price) }}
              </p>
              <p class="mt-0.5 font-mono text-[10px] text-slate-500">
                {{ ix.latest_published.date }} · {{ ix.sku?.name || ix.name }}
              </p>
            </router-link>
          </div>
        </div>
      </div>

      <!-- 脉搏 + 成交 ticker：贴行情板，不占整屏 -->
      <div v-if="!loading" class="border-t border-slate-800 bg-slate-950">
        <div
          class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-xs text-slate-400"
        >
          <span class="font-mono text-amber-500/90">{{ pulse?.pulse_text || '行情已更新' }}</span>
          <span>{{ pulse?.priced_sku_count ?? 0 }} SKU 有价</span>
          <span>{{ pulse?.published_feed_count ?? 0 }} 条动态</span>
          <span class="hidden sm:inline">{{ pulse?.sla_hint }}</span>
          <button type="button" class="ml-auto font-mono text-slate-500 hover:text-amber-500" @click="loadMarket({ silent: true })">
            刷新
          </button>
        </div>
        <div class="ticker-track border-t border-slate-800/80">
          <div class="ticker-rail font-mono text-xs text-slate-400">
            <span v-for="(line, i) in [...tickerItems, ...tickerItems]" :key="`${line}-${i}`" class="ticker-item">
              <span class="text-amber-500/70">●</span> {{ line }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <div class="mx-auto max-w-6xl px-4 py-6">
      <template v-if="!loading && !err">
        <!-- 全表：紧贴首屏，不再把行情推到第二屏 -->
        <section id="market-table" class="scroll-mt-24">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-sm font-medium uppercase tracking-wider text-slate-400">完整行情</h2>
              <p class="mt-1 text-xs text-slate-500">低 / 中 / 高为参考区间，不构成要约。</p>
            </div>
            <div class="flex w-full border border-slate-700 sm:w-auto">
              <button
                v-for="f in [
                  { id: 'all', label: '全部' },
                  { id: 'gpu', label: 'GPU' },
                  { id: 'token', label: 'Token' },
                ]"
                :key="f.id"
                type="button"
                class="tap-target flex-1 border-r border-slate-700 px-3 py-2 text-xs last:border-r-0 sm:flex-none sm:py-1.5"
                :class="filter === f.id ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400'"
                @click="filter = f.id"
              >
                {{ f.label }}
              </button>
            </div>
          </div>

          <!-- 移动端：卡片列表（触控友好） -->
          <div class="mt-3 space-y-2 md:hidden">
            <article
              v-for="row in filtered"
              :key="row.sku_id"
              class="market-card"
              :class="flashIds.has(row.sku_id) ? 'row-flash' : ''"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <router-link
                    :to="`/sku/${row.sku_id}`"
                    class="block truncate font-mono text-sm font-semibold text-slate-100"
                  >
                    {{ row.name }}
                  </router-link>
                  <p class="mt-0.5 truncate text-xs text-slate-500">{{ row.spec }} · {{ row.unit }}</p>
                </div>
                <span :class="['shrink-0 font-mono text-xs', changeClass(row.change_pct)]">
                  {{ row.change_label }}
                </span>
              </div>
              <div class="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p class="mono-num text-xl font-semibold text-amber-500">{{ fmt(row.price_mid) }}</p>
                  <p class="mt-0.5 font-mono text-[10px] text-slate-500">
                    {{ fmt(row.price_low) }}–{{ fmt(row.price_high) }}
                    <span v-if="row.deal_low != null" class="ml-1 text-slate-600">
                      · 成交 {{ fmt(row.deal_low) }}–{{ fmt(row.deal_high) }}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  class="btn-primary !min-h-[40px] !px-3 !py-2 !text-xs"
                  @click="goRfq(row.sku_id, 'table')"
                >
                  询价
                </button>
              </div>
            </article>
            <p v-if="!filtered.length" class="py-8 text-center text-sm text-slate-500">暂无行情</p>
          </div>

          <!-- 桌面：表格 -->
          <div class="panel mt-3 hidden overflow-x-auto md:block">
            <table class="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>单位</th>
                  <th>低</th>
                  <th>中位</th>
                  <th>高</th>
                  <th>涨跌</th>
                  <th>近30日成交</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in filtered"
                  :key="row.sku_id"
                  :class="flashIds.has(row.sku_id) ? 'row-flash' : ''"
                >
                  <td>
                    <router-link :to="`/sku/${row.sku_id}`" class="font-mono text-slate-100 hover:text-amber-500">
                      {{ row.name }}
                    </router-link>
                    <p class="text-xs text-slate-500">{{ row.spec }}</p>
                  </td>
                  <td class="text-slate-400">{{ row.unit }}</td>
                  <td class="mono-num">{{ fmt(row.price_low) }}</td>
                  <td class="mono-num accent font-medium">{{ fmt(row.price_mid) }}</td>
                  <td class="mono-num">{{ fmt(row.price_high) }}</td>
                  <td :class="['mono-num text-xs', changeClass(row.change_pct)]">{{ row.change_label }}</td>
                  <td class="mono-num text-slate-400">
                    <template v-if="row.deal_low == null">—</template>
                    <template v-else>{{ fmt(row.deal_low) }} – {{ fmt(row.deal_high) }}</template>
                  </td>
                  <td>
                    <button type="button" class="btn-ghost !px-2 !py-1 text-xs text-amber-500" @click="goRfq(row.sku_id, 'table')">
                      询价
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 成交动态：列表精简，主叙事已在顶栏 ticker -->
        <section class="mt-8">
          <div class="flex items-end justify-between gap-3">
            <h2 class="text-sm font-medium uppercase tracking-wider text-slate-400">脱敏成交动态</h2>
            <p class="text-xs text-slate-600">无价格 · 粗区域</p>
          </div>
          <div class="panel mt-3 divide-y divide-slate-700">
            <p v-if="!feeds.length" class="px-4 py-5 text-sm text-slate-500">
              暂无已发布动态。订单完成后由 Broker 审核发布。
            </p>
            <div
              v-for="f in feeds"
              :key="f.id"
              class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm text-slate-300"
            >
              <span>
                <span class="text-amber-500/90">{{ f.region }}</span>
                · {{ f.sku_name }} · {{ f.deal_type }}
              </span>
              <span class="font-mono text-xs text-slate-500">{{ f.deal_date }}</span>
            </div>
          </div>
        </section>

        <section class="mt-8 grid gap-3 border border-slate-700 sm:grid-cols-3">
          <div class="border-b border-slate-700 p-4 sm:border-b-0 sm:border-r">
            <p class="font-mono text-xs text-amber-500">01 撮合</p>
            <p class="mt-1 text-sm text-slate-400">Broker 线下谈，系统记状态与报价。</p>
          </div>
          <div class="border-b border-slate-700 p-4 sm:border-b-0 sm:border-r">
            <p class="font-mono text-xs text-amber-500">02 进度</p>
            <p class="mt-1 text-sm text-slate-400">询价 → 报价 → 订单五态可追溯。</p>
          </div>
          <div class="p-4">
            <p class="font-mono text-xs text-amber-500">03 结算</p>
            <p class="mt-1 text-sm text-slate-400">线下对公收款，后台记应收应付。</p>
          </div>
        </section>

        <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border border-slate-700 bg-slate-900 px-5 py-4">
          <p class="text-sm text-slate-300">参考价仅供对照，成交以正式报价为准。</p>
          <button type="button" class="btn-primary" @click="goRfq(null, 'home')">提交询价</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid rgba(245, 158, 11, 0.45);
  color: #f59e0b;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  padding: 0.15rem 0.45rem;
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #f59e0b;
  animation: live-pulse 1.6s ease-in-out infinite;
}
@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.85);
  }
}
.board-cell {
  background: #0f172a;
  padding: 0.75rem 0.875rem;
  transition: background 0.15s ease;
}
.board-cell:hover {
  background: #1e293b;
}
.row-flash {
  animation: price-flash 1.2s ease;
}
@keyframes price-flash {
  0% {
    background: rgba(245, 158, 11, 0.16);
  }
  100% {
    background: #0f172a;
  }
}
.ticker-track {
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
}
.ticker-rail {
  display: flex;
  width: max-content;
  gap: 2.5rem;
  padding: 0.4rem 0;
  animation: ticker-scroll 40s linear infinite;
}
.ticker-item {
  white-space: nowrap;
}
@keyframes ticker-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ticker-rail {
    animation: none;
  }
}
</style>

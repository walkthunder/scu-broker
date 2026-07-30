<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api';

const list = ref([]);
const skus = ref([]);
const regions = ref([]);
const err = ref('');
const msg = ref('');
const expanded = ref(null);
const premiumHint = ref(null);
const form = reactive({
  kind: 'call',
  sku_id: null,
  region: 'shanghai',
  qty: 1,
  strike: null,
});

const today = computed(() =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
);

function canExercise(r) {
  return r.status === 'open' && r.window_start <= today.value && r.window_end >= today.value;
}

async function load() {
  try {
    const [rights, skuList, regs] = await Promise.all([
      api('/frd/rights/mine'),
      api('/customer/skus'),
      api('/frd/meta/regions').catch(() => ({ data: [] })),
    ]);
    list.value = rights.data || [];
    skus.value = skuList.data || [];
    regions.value = regs.data || [];
    if (!form.sku_id && skus.value[0]) form.sku_id = skus.value[0].id;
  } catch (e) {
    err.value = e.message;
  }
}

async function refreshPremium() {
  premiumHint.value = null;
  if (!form.sku_id || !(form.strike > 0) || !(form.qty > 0)) return;
  try {
    premiumHint.value = (
      await api('/frd/rights/premium-ref', {
        method: 'POST',
        body: {
          kind: form.kind,
          sku_id: form.sku_id,
          region: form.region,
          strike: form.strike,
          qty: form.qty,
        },
      })
    ).data;
  } catch {
    premiumHint.value = null;
  }
}

async function selfBuy() {
  err.value = '';
  msg.value = '';
  try {
    await refreshPremium();
    const out = await api('/frd/rights/self-open', {
      method: 'POST',
      body: {
        kind: form.kind,
        sku_id: form.sku_id,
        region: form.region,
        qty: form.qty,
        strike: form.strike,
        premium: premiumHint.value?.premium_ref,
      },
    });
    msg.value = `权益已提交 #${out.data?.id || ''}，请确认；运营确认收费后生效`;
    await load();
  } catch (e) {
    err.value = e.message;
  }
}

async function confirm(id) {
  try {
    err.value = '';
    await api(`/frd/rights/${id}/confirm`, { method: 'POST' });
    await load();
  } catch (e) {
    err.value = e.message;
  }
}

async function exercise(id) {
  try {
    err.value = '';
    await api(`/frd/rights/${id}/exercise`, { method: 'POST', body: {} });
    await load();
  } catch (e) {
    err.value = e.message;
  }
}

function payoffPath(points) {
  if (!points?.length) return '';
  const xs = points.map((p) => p.spot);
  const ys = points.map((p) => p.pnl);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const w = 280;
  const h = 100;
  const pad = 8;
  const sx = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (w - pad * 2);
  const sy = (y) => h - pad - ((y - minY) / (maxY - minY || 1)) * (h - pad * 2);
  return points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.spot)},${sy(p.pnl)}`).join(' ');
}

function zeroLine(points) {
  if (!points?.length) return 50;
  const ys = points.map((p) => p.pnl);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const h = 100;
  const pad = 8;
  return h - pad - ((0 - minY) / (maxY - minY || 1)) * (h - pad * 2);
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="page-title">我的权益</h1>
    <p class="page-desc">30 天认购（优先使用权）/ 认沽（回售保障）· 可自助买入 · 展示 IV/TV 参考</p>
    <p v-if="msg" class="mt-2 text-sm text-emerald-400">{{ msg }}</p>
    <p v-if="err" class="mt-2 text-sm text-rose-400">{{ err }}</p>

    <div class="panel mt-6 p-4">
      <h2 class="text-sm font-medium text-slate-200">买入权益</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label class="text-xs text-slate-500">
          类型
          <select v-model="form.kind" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm" @change="refreshPremium">
            <option value="call">认购</option>
            <option value="put">认沽</option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          SKU
          <select v-model.number="form.sku_id" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm" @change="refreshPremium">
            <option v-for="s in skus" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          区域
          <select v-model="form.region" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm" @change="refreshPremium">
            <option v-for="r in regions" :key="r.code" :value="r.code">{{ r.name || r.code }}</option>
            <option v-if="!regions.length" value="shanghai">上海</option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          行权价
          <input v-model.number="form.strike" type="number" min="0.01" step="0.01" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm" @change="refreshPremium" />
        </label>
        <label class="text-xs text-slate-500">
          数量
          <input v-model.number="form.qty" type="number" min="0.01" step="0.01" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm" @change="refreshPremium" />
        </label>
      </div>
      <p v-if="premiumHint" class="mt-2 text-xs text-slate-400">
        参考权利金 {{ premiumHint.premium_ref }} · IV≈{{ premiumHint.iv }}% · TV {{ premiumHint.tv }} · 内在
        {{ premiumHint.intrinsic }} · Δ≈{{ premiumHint.delta }}
        <button type="button" class="ml-2 text-amber-400 underline" @click="refreshPremium">刷新</button>
      </p>
      <button type="button" class="btn-primary mt-3 text-sm" @click="selfBuy">提交买入</button>
    </div>

    <div class="mt-6 space-y-3">
      <div v-for="r in list" :key="r.id" class="panel p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="font-medium text-slate-200">
              #{{ r.id }} · {{ r.kind === 'call' ? '认购' : '认沽' }} · {{ r.sku?.name }} ·
              {{ r.region }}
            </div>
            <div class="mt-1 text-xs text-slate-500">
              行权价 {{ r.strike }} · 权利金 {{ r.premium }} · {{ r.window_start }} → {{ r.window_end }}
              · {{ r.status }}
            </div>
            <div v-if="r.analytics" class="mt-1 text-xs text-slate-500">
              IV≈{{ r.analytics.iv }}% · TV {{ r.analytics.tv }} · Δ≈{{ r.analytics.delta }} · 盈亏平衡
              {{ r.analytics.payoff?.breakeven }}
              <button
                type="button"
                class="ml-2 text-amber-400/90 underline"
                @click="expanded = expanded === r.id ? null : r.id"
              >
                {{ expanded === r.id ? '收起损益图' : '损益图' }}
              </button>
            </div>
          </div>
          <div class="flex gap-2">
            <button
              v-if="r.status === 'pending_confirm' && !r.buyer_confirmed_at"
              class="btn-primary text-sm"
              type="button"
              @click="confirm(r.id)"
            >
              确认
            </button>
            <button
              v-if="canExercise(r)"
              class="btn-primary text-sm"
              type="button"
              @click="exercise(r.id)"
            >
              行权
            </button>
          </div>
        </div>
        <svg
          v-if="expanded === r.id && r.analytics?.payoff?.points?.length"
          class="mt-3 w-full max-w-md rounded border border-slate-800 bg-slate-950/60"
          viewBox="0 0 280 100"
          role="img"
          aria-label="权益损益图"
        >
          <line
            :y1="zeroLine(r.analytics.payoff.points)"
            :y2="zeroLine(r.analytics.payoff.points)"
            x1="0"
            x2="280"
            stroke="#334155"
            stroke-dasharray="4 3"
          />
          <path
            :d="payoffPath(r.analytics.payoff.points)"
            fill="none"
            stroke="#f59e0b"
            stroke-width="2"
          />
        </svg>
      </div>
      <p v-if="!list.length" class="text-sm text-slate-500">暂无权益持仓</p>
    </div>
  </div>
</template>

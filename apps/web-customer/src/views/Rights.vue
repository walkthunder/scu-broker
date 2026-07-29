<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';

const list = ref([]);
const err = ref('');
const expanded = ref(null);

const today = computed(() =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
);

function canExercise(r) {
  return r.status === 'open' && r.window_start <= today.value && r.window_end >= today.value;
}

async function load() {
  try {
    list.value = (await api('/frd/rights/mine')).data || [];
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
    <p class="page-desc">30 天认购（优先使用权）/ 认沽（回售保障）· 服务协议形态</p>
    <p v-if="err" class="mt-4 text-sm text-rose-400">{{ err }}</p>
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
              Δ≈{{ r.analytics.delta }} · 盈亏平衡 {{ r.analytics.payoff?.breakeven }}
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
        <p
          v-if="expanded === r.id && !r.analytics?.payoff?.points?.length"
          class="mt-2 text-xs text-slate-500"
        >
          暂无损益点数据
        </p>
      </div>
      <p v-if="!list.length" class="text-sm text-slate-500">暂无权益持仓</p>
    </div>
  </div>
</template>

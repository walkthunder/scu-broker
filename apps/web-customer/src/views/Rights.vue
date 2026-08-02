<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import {
  buildPayoffChart,
  fmtNum,
  fmtSigned,
  moneynessLabel,
} from '../lib/payoff-chart';

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

/** 展开项：直接消费 API analytics.payoff，几何交给 lib */
const chart = computed(() => {
  const row = list.value.find((r) => r.id === expanded.value);
  if (!row?.analytics?.payoff) return null;
  return buildPayoffChart(row.analytics.payoff, { kind: row.kind, qty: row.qty });
});

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
            <option v-for="reg in regions" :key="reg.code" :value="reg.code">{{ reg.name || reg.code }}</option>
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
              #{{ r.id }} · {{ r.kind_label || (r.kind === 'call' ? '认购（使用权）' : '认沽（保障）') }} ·
              {{ r.sku?.name }}
            </div>
            <div class="mt-1 text-xs text-slate-500">
              行权价 {{ r.strike }} · 权利金 {{ r.premium }} · {{ r.window_start }} → {{ r.window_end }}
              · {{ r.status_label || r.status }}
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

        <div
          v-if="expanded === r.id && chart"
          class="mt-3 rounded border border-slate-800 bg-slate-950/70 p-3"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div class="text-sm font-medium text-slate-200">到期损益示意（单位权利）</div>
              <p class="mt-0.5 text-[11px] text-slate-500">
                横轴结算价 S · 纵轴已扣权利金后的单位损益 · 非实时盯市
              </p>
            </div>
            <div class="flex flex-wrap gap-3 text-[11px] text-slate-500">
              <span class="inline-flex items-center gap-1"><span class="inline-block h-0.5 w-3 bg-amber-500"></span> 曲线</span>
              <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-0.5 bg-sky-400"></span> K</span>
              <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-0.5 bg-emerald-400"></span> BE</span>
              <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-0.5 bg-violet-400"></span> S</span>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="rounded border border-slate-800/80 bg-slate-900/50 px-2.5 py-2">
              <div class="text-[10px] uppercase tracking-wide text-slate-500">最大亏损</div>
              <div class="mt-0.5 font-mono text-sm text-rose-300">{{ fmtNum(chart.maxLoss) }}</div>
              <div class="text-[10px] text-slate-600">权利金 / 单位</div>
            </div>
            <div class="rounded border border-slate-800/80 bg-slate-900/50 px-2.5 py-2">
              <div class="text-[10px] uppercase tracking-wide text-slate-500">盈亏平衡</div>
              <div class="mt-0.5 font-mono text-sm text-emerald-300">{{ fmtNum(chart.breakeven) }}</div>
              <div class="text-[10px] text-slate-600">{{ chart.beFormula }}</div>
            </div>
            <div class="rounded border border-slate-800/80 bg-slate-900/50 px-2.5 py-2">
              <div class="text-[10px] uppercase tracking-wide text-slate-500">当前现货 S</div>
              <div class="mt-0.5 font-mono text-sm text-violet-300">{{ fmtNum(chart.spot) }}</div>
              <div class="text-[10px] text-slate-600">
                {{ moneynessLabel(chart.moneyness) }} · K {{ fmtNum(chart.strike) }}
              </div>
            </div>
            <div class="rounded border border-slate-800/80 bg-slate-900/50 px-2.5 py-2">
              <div class="text-[10px] uppercase tracking-wide text-slate-500">当前隐含损益</div>
              <div class="mt-0.5 font-mono text-sm" :class="chart.pnlClass">
                {{ fmtSigned(chart.currentPnl) }}
                <span class="text-[10px] font-sans text-slate-500">/ 单位</span>
              </div>
              <div class="text-[10px] text-slate-600">
                合计 {{ chart.total == null ? '—' : fmtSigned(chart.total) }}（×{{ chart.qty }}）
              </div>
            </div>
          </div>

          <svg class="mt-3 w-full" :viewBox="chart.viewBox" role="img" :aria-label="chart.aria">
            <defs>
              <linearGradient :id="'pg-' + r.id" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#34d399" stop-opacity="0.14" />
                <stop offset="100%" stop-color="#34d399" stop-opacity="0.02" />
              </linearGradient>
              <linearGradient :id="'lg-' + r.id" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#fb7185" stop-opacity="0.02" />
                <stop offset="100%" stop-color="#fb7185" stop-opacity="0.14" />
              </linearGradient>
            </defs>
            <path :d="chart.profitZone" :fill="'url(#pg-' + r.id + ')'" />
            <path :d="chart.lossZone" :fill="'url(#lg-' + r.id + ')'" />
            <line
              :x1="chart.padL"
              :x2="chart.w - chart.padR"
              :y1="chart.zero"
              :y2="chart.zero"
              stroke="#475569"
              stroke-dasharray="4 3"
            />
            <text :x="chart.padL - 4" :y="chart.zero + 3" text-anchor="end" fill="#64748b" font-size="9">0</text>
            <text
              v-for="t in chart.yTicks"
              :key="t.key"
              :x="chart.padL - 4"
              :y="t.y + 3"
              text-anchor="end"
              fill="#64748b"
              font-size="9"
            >
              {{ t.label }}
            </text>
            <line
              :x1="chart.kX"
              :x2="chart.kX"
              :y1="chart.padT"
              :y2="chart.h - chart.padB"
              stroke="#38bdf8"
              stroke-dasharray="3 2"
            />
            <text :x="chart.kX" :y="chart.padT - 4" text-anchor="middle" fill="#38bdf8" font-size="9">
              K {{ fmtNum(chart.strike) }}
            </text>
            <template v-if="chart.beX != null">
              <line
                :x1="chart.beX"
                :x2="chart.beX"
                :y1="chart.padT"
                :y2="chart.h - chart.padB"
                stroke="#34d399"
                stroke-dasharray="3 2"
              />
              <text :x="chart.beX" :y="chart.padT + 10" text-anchor="middle" fill="#34d399" font-size="9">
                BE {{ fmtNum(chart.breakeven) }}
              </text>
            </template>
            <template v-if="chart.spotX != null">
              <line
                :x1="chart.spotX"
                :x2="chart.spotX"
                :y1="chart.padT"
                :y2="chart.h - chart.padB"
                stroke="#a78bfa"
                stroke-width="1.5"
              />
              <circle
                v-if="chart.spotY != null"
                :cx="chart.spotX"
                :cy="chart.spotY"
                r="3.5"
                fill="#a78bfa"
                stroke="#0f172a"
              />
              <text
                :x="chart.spotLabelX"
                :y="(chart.spotY != null ? chart.spotY : chart.h / 2) - 6"
                :text-anchor="chart.spotLabelAnchor"
                fill="#a78bfa"
                font-size="9"
              >
                S {{ fmtNum(chart.spot) }}
              </text>
            </template>
            <path
              :d="chart.path"
              fill="none"
              stroke="#f59e0b"
              stroke-width="2.25"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            <template v-for="t in chart.xTicks" :key="t.key">
              <line
                :x1="t.x"
                :x2="t.x"
                :y1="chart.h - chart.padB"
                :y2="chart.h - chart.padB + 4"
                stroke="#64748b"
              />
              <text :x="t.x" :y="chart.h - 6" text-anchor="middle" fill="#64748b" font-size="9">
                {{ t.label }}
              </text>
            </template>
            <text :x="chart.w / 2" :y="chart.h - 1" text-anchor="middle" fill="#475569" font-size="8">
              结算价 S
            </text>
            <text
              :x="12"
              :y="chart.h / 2"
              text-anchor="middle"
              fill="#475569"
              font-size="8"
              :transform="chart.rotateY"
            >
              单位损益
            </text>
          </svg>

          <p class="mt-2 text-xs leading-relaxed text-slate-400">{{ chart.insight }}</p>
          <p class="mt-1 text-[11px] text-slate-600">
            曲线为到期结算损益示意；IV / TV / Δ 为简化参考，不构成报价或要约。
          </p>
        </div>
      </div>
      <p v-if="!list.length" class="text-sm text-slate-500">暂无权益持仓</p>
    </div>
  </div>
</template>

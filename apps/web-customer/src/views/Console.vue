<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const data = ref(null);
const err = ref('');
const loading = ref(true);

onMounted(async () => {
  loading.value = true;
  try {
    data.value = (await api('/frd/console/me')).data;
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
});

const ledger = computed(() => data.value?.ledger);
const todos = computed(() => data.value?.todos || []);
const rights = computed(() => data.value?.rights || []);
const forwards = computed(() => data.value?.forwards || []);
const spotOpen = computed(() => data.value?.spot_open || []);
const mtm = computed(() => data.value?.mtm_statements || []);
const market = computed(() => data.value?.market || { date: null, national: [] });
const forwardMtm = computed(() => Number(data.value?.pnl?.forward_mtm || 0));

function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return fmtMoney(n);
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
}

function signedClass(v) {
  const n = Number(v);
  if (n > 0) return 'text-[var(--up)]';
  if (n < 0) return 'text-[var(--down)]';
  return 'text-slate-200';
}

function signedText(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const s = fmtMoney(n);
  return n > 0 ? `+${s}` : s;
}

const REGION = { shanghai: '上海', neimeng: '内蒙', guizhou: '贵州' };
function regionLabel(code) {
  return REGION[code] || code || '—';
}

function intentLabel(intent) {
  if (intent === 'physical') return '实物交割';
  if (intent === 'cash') return '现金结算';
  return '未设置（默认现金）';
}

function mtmKind(s) {
  return { forward: '预售', right: '权益', spot: '现货' }[s.ref_type] || '持仓';
}

function go(path) {
  router.push(path);
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">控制台</h1>
        <p class="page-desc">资金 · 待办 · 持仓 · 结算价</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary !py-1.5 !text-xs" @click="go('/spot')">现货</button>
        <button type="button" class="btn-secondary !py-1.5 !text-xs" @click="go('/forwards')">预售</button>
        <button type="button" class="btn-primary !py-1.5 !text-xs" @click="go('/rfq')">询价</button>
      </div>
    </div>

    <p v-if="err" class="mt-4 text-sm text-[var(--up)]">{{ err }}</p>
    <p v-else-if="loading" class="mt-8 font-mono text-sm text-slate-500">加载账户…</p>

    <template v-else>
      <section
        class="mt-6 grid gap-px overflow-hidden border border-slate-700 bg-slate-700 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div class="bg-slate-900 px-4 py-4">
          <div class="font-mono text-[10px] uppercase tracking-wider text-slate-500">可用资金</div>
          <div class="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-400">
            {{ fmtMoney(ledger?.available) }}
          </div>
        </div>
        <div class="bg-slate-900 px-4 py-4">
          <div class="font-mono text-[10px] uppercase tracking-wider text-slate-500">冻结资金</div>
          <div class="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-100">
            {{ fmtMoney(ledger?.frozen) }}
          </div>
        </div>
        <div class="bg-slate-900 px-4 py-4">
          <div class="font-mono text-[10px] uppercase tracking-wider text-slate-500">预售浮动盈亏</div>
          <div class="mt-2 font-mono text-2xl font-semibold tabular-nums" :class="signedClass(forwardMtm)">
            {{ signedText(forwardMtm) }}
          </div>
          <p class="mt-1 text-[11px] text-slate-600">按近结 S 估算，非最终结算</p>
        </div>
        <div class="bg-slate-900 px-4 py-4">
          <div class="font-mono text-[10px] uppercase tracking-wider text-slate-500">待办</div>
          <div class="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-100">
            {{ todos.length }}
          </div>
        </div>
      </section>

      <!-- 待办 -->
      <section class="panel mt-6 overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">需要处理</h2>
          <span class="font-mono text-[11px] text-slate-600">{{ todos.length }} 项</span>
        </div>
        <ul v-if="todos.length" class="divide-y divide-slate-800">
          <li
            v-for="t in todos"
            :key="`${t.type}-${t.id}`"
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="rounded-sm px-1.5 py-0.5 font-mono text-[10px]"
                  :class="
                    t.priority === 1
                      ? 'bg-[var(--up)]/15 text-[var(--up)]'
                      : 'bg-amber-500/10 text-amber-400'
                  "
                >
                  {{ t.priority === 1 ? '紧急' : '待办' }}
                </span>
                <span class="text-sm font-medium text-slate-100">{{ t.title }}</span>
              </div>
              <p class="mt-1 text-xs text-slate-500">{{ t.detail }}</p>
            </div>
            <button
              type="button"
              class="btn-primary !min-h-0 shrink-0 !px-3 !py-1.5 !text-xs"
              @click="go(t.href)"
            >
              {{ t.cta || '前往' }}
            </button>
          </li>
        </ul>
        <p v-else class="px-4 py-8 text-center text-sm text-slate-500">暂无待办</p>
      </section>

      <!-- 持仓 -->
      <section class="mt-6 grid gap-4 lg:grid-cols-3">
        <div class="panel overflow-hidden">
          <div class="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">预售 / 远期</h2>
            <button type="button" class="text-[11px] text-amber-400/90 hover:underline" @click="go('/forwards')">
              全部
            </button>
          </div>
          <ul v-if="forwards.length" class="divide-y divide-slate-800">
            <li v-for="f in forwards.slice(0, 8)" :key="f.id" class="px-4 py-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-mono text-xs text-slate-200">
                    {{ f.contract_code || `合约 #${f.id}` }}
                  </p>
                  <p class="mt-1 text-[11px] text-slate-500">
                    {{ f.index?.sku?.name || f.index?.name || f.index?.code || '标的' }}
                    · {{ regionLabel(f.region || f.index?.region) }}
                  </p>
                </div>
                <span class="shrink-0 rounded-sm bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                  {{ f.lifecycle_label || '—' }}
                </span>
              </div>
              <div class="mt-2 flex flex-wrap justify-between gap-2 font-mono text-xs text-slate-500">
                <span>
                  锁价 X <span class="text-amber-400">{{ fmtPrice(f.strike_price) }}</span>
                </span>
                <span>到期 {{ f.expiry_date || '—' }}</span>
              </div>
              <div class="mt-1 flex flex-wrap justify-between gap-2 text-[11px]">
                <span class="text-slate-600">交割：{{ intentLabel(f.delivery_intent) }}</span>
                <span v-if="f.mtm" class="font-mono tabular-nums" :class="signedClass(f.mtm.signed_amount)">
                  浮动 {{ signedText(f.mtm.signed_amount) }}
                </span>
              </div>
            </li>
          </ul>
          <p v-else class="px-4 py-8 text-center text-sm text-slate-500">暂无预售持仓</p>
        </div>

        <div class="panel overflow-hidden">
          <div class="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">权益</h2>
            <button type="button" class="text-[11px] text-amber-400/90 hover:underline" @click="go('/rights')">
              全部
            </button>
          </div>
          <ul v-if="rights.length" class="divide-y divide-slate-800">
            <li v-for="r in rights.slice(0, 8)" :key="r.id" class="px-4 py-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-sm text-slate-100">{{ r.kind_label || '权益' }}</p>
                  <p class="mt-1 text-[11px] text-slate-500">
                    #{{ r.id }} · {{ regionLabel(r.region) }} · 数量 {{ fmtPrice(r.qty) }}
                  </p>
                </div>
                <span class="shrink-0 rounded-sm bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                  {{ r.status_label || '—' }}
                </span>
              </div>
              <div class="mt-2 font-mono text-xs text-slate-500">
                行权价 <span class="text-amber-400">{{ fmtPrice(r.strike) }}</span>
                <span class="mx-2 text-slate-700">·</span>
                权利金 {{ fmtMoney(r.premium) }}
              </div>
              <p v-if="r.window_end" class="mt-1 text-[11px] text-slate-600">
                窗口至 {{ r.window_end }}
              </p>
            </li>
          </ul>
          <p v-else class="px-4 py-8 text-center text-sm text-slate-500">暂无权益持仓</p>
        </div>

        <div class="panel overflow-hidden">
          <div class="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">现货挂单</h2>
            <button type="button" class="text-[11px] text-amber-400/90 hover:underline" @click="go('/spot')">
              交易台
            </button>
          </div>
          <ul v-if="spotOpen.length" class="divide-y divide-slate-800">
            <li v-for="o in spotOpen.slice(0, 8)" :key="o.id" class="px-4 py-3">
              <div class="flex items-center justify-between gap-2">
                <span
                  class="text-sm font-medium"
                  :class="o.side === 'buy' ? 'text-[var(--up)]' : 'text-[var(--down)]'"
                >
                  {{ o.side === 'buy' ? '买入' : '卖出' }}
                  {{ o.sku?.name || '' }}
                </span>
                <span class="text-[10px] text-slate-500">
                  {{ o.status === 'partial' ? '部分成交' : '等待成交' }}
                </span>
              </div>
              <div class="mt-2 font-mono text-xs text-slate-400">
                {{ fmtPrice(o.price) }} × {{ fmtPrice(o.qty) }}
                <span class="ml-2 text-slate-600">{{ regionLabel(o.region) }}</span>
              </div>
            </li>
          </ul>
          <p v-else class="px-4 py-8 text-center text-sm text-slate-500">暂无未完成挂单</p>
        </div>
      </section>

      <!-- 结算价：全国综合，不再前端滤公告行 -->
      <section class="panel mt-6 overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
          <div>
            <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">结算价速览</h2>
            <p class="mt-0.5 text-[11px] text-slate-600">
              {{ market.date || '—' }} · 全国综合价（预售结算参考）
            </p>
          </div>
          <router-link to="/indices" class="text-[11px] text-amber-400/90 hover:underline">指数详情</router-link>
        </div>
        <div
          v-if="market.national?.length"
          class="grid gap-px bg-slate-800 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div v-for="n in market.national" :key="n.sku" class="bg-slate-900 px-4 py-3">
            <p class="truncate text-xs text-slate-400">{{ n.sku }}</p>
            <p class="mt-1.5 font-mono text-lg tabular-nums text-amber-400">
              {{ fmtPrice(n.national_price) }}
            </p>
          </div>
        </div>
        <p v-else class="px-4 py-8 text-center text-sm text-slate-500">暂无已发布结算价</p>
      </section>

      <section class="panel mt-6 overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <h2 class="text-xs font-medium uppercase tracking-wider text-slate-400">盯市快照</h2>
        </div>
        <div v-if="mtm.length" class="overflow-x-auto">
          <table class="w-full min-w-[420px] text-left text-sm">
            <thead class="border-b border-slate-800 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th class="px-4 py-2 font-medium">日期</th>
                <th class="px-4 py-2 font-medium">类型</th>
                <th class="px-4 py-2 font-medium text-right">金额</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/80">
              <tr v-for="s in mtm.slice(0, 10)" :key="s.id" class="text-slate-400">
                <td class="px-4 py-2.5 font-mono text-xs">{{ s.date }}</td>
                <td class="px-4 py-2.5 text-xs">{{ mtmKind(s) }} #{{ s.ref_id }}</td>
                <td
                  class="px-4 py-2.5 text-right font-mono text-xs tabular-nums"
                  :class="signedClass(s.mtm_amount)"
                >
                  {{ signedText(s.mtm_amount) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="px-4 py-8 text-center text-sm text-slate-500">暂无盯市记录</p>
      </section>
    </template>
  </div>
</template>

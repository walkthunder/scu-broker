<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const consoleData = ref(null);
const err = ref('');
const bulletin = ref(null);
const national = ref([]);

onMounted(async () => {
  try {
    consoleData.value = (await api('/frd/console/me')).data;
    try {
      bulletin.value = (await api('/frd/price-bulletins/latest')).data;
    } catch (e) {
      bulletin.value = null;
      void e;
    }
    try {
      national.value = (await api('/frd/national-composite')).data || [];
    } catch (e) {
      national.value = [];
      void e;
    }
  } catch (e) {
    err.value = e.message;
  }
});

const ledger = computed(() => consoleData.value?.ledger);

function todoLabel(t) {
  return t.label || `${t.type} #${t.id}`;
}

function goTodo(t) {
  if (t.href) router.push(t.href);
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="page-title">控制台</h1>
    <p class="page-desc">持仓、资金分账、浮动盈亏、待办与价格公告</p>
    <p v-if="err" class="mt-4 text-sm text-rose-400">{{ err }}</p>
    <div v-if="ledger" class="mt-6 grid gap-4 sm:grid-cols-4">
      <div class="panel p-4">
        <div class="text-xs text-slate-500">可用资金</div>
        <div class="mt-1 text-2xl font-semibold text-amber-400">
          {{ Number(ledger.available).toLocaleString() }}
        </div>
      </div>
      <div class="panel p-4">
        <div class="text-xs text-slate-500">冻结保证金</div>
        <div class="mt-1 text-2xl font-semibold">{{ Number(ledger.frozen).toLocaleString() }}</div>
      </div>
      <div class="panel p-4">
        <div class="text-xs text-slate-500">远期浮动盈亏</div>
        <div class="mt-1 text-2xl font-semibold">
          {{ Number(consoleData?.pnl?.forward_mtm || 0).toLocaleString() }}
        </div>
      </div>
      <div class="panel p-4">
        <div class="text-xs text-slate-500">待办</div>
        <div class="mt-1 text-2xl font-semibold">{{ consoleData?.todos?.length || 0 }}</div>
      </div>
    </div>
    <div v-if="ledger?.buckets" class="panel mt-4 p-4 text-xs text-slate-500">
      分账：权利金累计 {{ Number(ledger.buckets.premium_paid || 0).toLocaleString() }} · 结算净额
      {{ Number(ledger.buckets.settle_net || 0).toLocaleString() }} · 入金
      {{ Number(ledger.buckets.deposits || 0).toLocaleString() }}
    </div>
    <div v-if="(consoleData?.todos || []).length" class="panel mt-4 p-4">
      <h2 class="mb-2 text-sm text-slate-300">待办（点击跳转）</h2>
      <ul class="space-y-1 text-sm">
        <li v-for="(t, i) in consoleData.todos" :key="i">
          <button
            type="button"
            class="text-left text-amber-400/90 underline-offset-2 hover:underline"
            @click="goTodo(t)"
          >
            {{ todoLabel(t) }}
          </button>
        </li>
      </ul>
    </div>
    <div v-if="bulletin" class="panel mt-6 p-4">
      <h2 class="text-sm font-medium text-slate-300">最新算力价格公告 · {{ bulletin.date }}</h2>
      <ul class="mt-3 space-y-1 text-sm text-slate-400">
        <li v-for="line in (bulletin.payload?.lines || bulletin.snapshot?.lines || []).slice(0, 8)" :key="line.code">
          {{ line.code }} · S={{ line.settle_price }}
          <span v-if="line.is_reference" class="text-amber-500/80">（参考价）</span>
          · 预售参考 {{ line.presale_ref }}
        </li>
      </ul>
      <ul v-if="national.length" class="mt-3 border-t border-slate-800 pt-3 text-sm text-slate-400">
        <li v-for="n in national" :key="n.sku">全国综合 · {{ n.sku }} = {{ n.national_price }}</li>
      </ul>
    </div>
    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <div class="panel p-4">
        <h2 class="mb-3 text-sm text-slate-300">权益持仓</h2>
        <p v-for="r in consoleData?.rights || []" :key="'r' + r.id" class="text-sm text-slate-400">
          #{{ r.id }} {{ r.kind }} · {{ r.status }} · strike {{ r.strike }}
        </p>
        <p v-if="!(consoleData?.rights || []).length" class="text-sm text-slate-500">暂无</p>
      </div>
      <div class="panel p-4">
        <h2 class="mb-3 text-sm text-slate-300">预售/远期</h2>
        <p v-for="f in consoleData?.forwards || []" :key="'f' + f.id" class="text-sm text-slate-400">
          #{{ f.id }} {{ f.contract_code || f.status }} · X={{ f.strike_price }}
          <span v-if="f.delivery_intent && f.delivery_intent !== 'unset'">
            · 意愿 {{ f.delivery_intent }}
          </span>
        </p>
        <p v-if="!(consoleData?.forwards || []).length" class="text-sm text-slate-500">暂无</p>
      </div>
    </div>
    <div class="panel mt-6 p-4">
      <h2 class="mb-3 text-sm text-slate-300">每日盯市结算单</h2>
      <div
        v-for="s in consoleData?.mtm_statements || []"
        :key="s.id"
        class="mb-2 border-b border-slate-800 pb-2 text-sm text-slate-400 last:border-0"
      >
        <div class="flex flex-wrap justify-between gap-2">
          <span>{{ s.date }} · {{ s.ref_type }}#{{ s.ref_id }}</span>
          <span class="font-mono">{{ Number(s.mtm_amount || 0).toLocaleString() }}</span>
        </div>
        <div v-if="s.note" class="mt-0.5 text-xs text-slate-500">{{ s.note }}</div>
      </div>
      <p v-if="!(consoleData?.mtm_statements || []).length" class="text-sm text-slate-500">暂无结算单</p>
    </div>
  </div>
</template>

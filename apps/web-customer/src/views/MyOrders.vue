<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api } from '../api';

const rfqs = ref([]);
const orders = ref([]);
const err = ref('');
const loading = ref(true);
const now = ref(Date.now());
let clockTimer;
let pollTimer;

const statusLabel = {
  pending: '待处理',
  quoted: '已报价',
  confirmed: '已确认',
  rejected: '已拒绝',
};

async function load({ silent = false } = {}) {
  if (!silent) loading.value = true;
  try {
    const [r, o] = await Promise.all([api('/customer/rfqs'), api('/customer/orders')]);
    rfqs.value = r.data || [];
    orders.value = o.data || [];
    err.value = '';
  } catch (e) {
    if (!silent) err.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    load({ silent: true });
  }, 30_000);
  await load();
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
  if (pollTimer) clearInterval(pollTimer);
});

function remainSeconds(quote) {
  if (!quote?.expiry_time) return quote?.remaining_seconds ?? 0;
  return Math.max(0, Math.floor((new Date(quote.expiry_time) - now.value) / 1000));
}

const todos = computed(() =>
  rfqs.value.filter((r) => r.quote?.status === 'pending' && remainSeconds(r.quote) > 0),
);

function fmtRemain(sec) {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtTime(v) {
  return v?.slice(0, 16)?.replace('T', ' ') || '—';
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="page-title">我的工作台</h1>
    <p class="page-desc">跟进询价、确认报价、查看订单进度。报价剩余时间每秒刷新，列表约 30 秒自动同步。</p>

    <p v-if="err" class="mt-5 border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{{ err }}</p>
    <p v-else-if="loading" class="mt-5 text-sm text-slate-500">加载中…</p>

    <template v-else>
      <section v-if="todos.length" class="mt-6 border border-amber-500/40 bg-amber-500/5 p-4">
        <h2 class="text-sm font-medium text-amber-500">待确认报价</h2>
        <ul class="mt-3 space-y-2">
          <li v-for="t in todos" :key="t.id" class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <router-link :to="`/rfqs/${t.id}`" class="text-slate-200 hover:text-amber-400">
              #{{ t.id }} {{ t.sku?.name }} · ¥{{ Number(t.quote.price).toLocaleString('zh-CN') }}
            </router-link>
            <span class="font-mono text-amber-500">剩余 {{ fmtRemain(remainSeconds(t.quote)) }}</span>
          </li>
        </ul>
      </section>

      <section class="mt-8">
        <h2 class="text-sm font-medium uppercase tracking-wider text-slate-400">询价</h2>
        <div class="panel mt-3 overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>SKU</th>
                <th>数量</th>
                <th>时长</th>
                <th>状态</th>
                <th>提交时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in rfqs"
                :key="r.id"
                class="cursor-pointer hover:bg-slate-800/60"
                @click="$router.push(`/rfqs/${r.id}`)"
              >
                <td class="font-mono">{{ r.id }}</td>
                <td>{{ r.sku?.name }}</td>
                <td class="mono-num">{{ r.quantity }}</td>
                <td>{{ r.duration || '—' }}</td>
                <td>{{ statusLabel[r.status] || r.status }}</td>
                <td class="font-mono text-xs text-slate-500">{{ fmtTime(r.createdAt || r.created_at) }}</td>
              </tr>
              <tr v-if="!rfqs.length">
                <td colspan="6" class="py-8 text-center text-slate-500">
                  暂无询价。
                  <router-link to="/" class="text-amber-500 hover:underline">去行情大厅</router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mt-8">
        <h2 class="text-sm font-medium uppercase tracking-wider text-slate-400">订单</h2>
        <div class="panel mt-3 overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>SKU</th>
                <th>金额</th>
                <th>状态</th>
                <th>供应商</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in orders"
                :key="o.id"
                class="cursor-pointer hover:bg-slate-800/60"
                @click="$router.push(`/orders/${o.id}`)"
              >
                <td class="font-mono">{{ o.id }}</td>
                <td>{{ o.sku?.name }}</td>
                <td class="mono-num accent">{{ Number(o.price).toLocaleString('zh-CN') }}</td>
                <td>{{ o.status }}</td>
                <td>{{ o.supplier_display || '—' }}</td>
              </tr>
              <tr v-if="!orders.length">
                <td colspan="5" class="py-8 text-center text-slate-500">暂无订单</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

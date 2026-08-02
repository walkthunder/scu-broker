<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const STEPS = ['待签约', '待交付', '待验收', '待结算', '已完成'];
const route = useRoute();
const order = ref(null);
const err = ref('');

onMounted(async () => {
  try {
    const res = await api(`/customer/orders/${route.params.id}`);
    order.value = res.data;
  } catch (e) {
    err.value = e.message;
  }
});

const stepIndex = computed(() => {
  if (!order.value) return -1;
  if (['已取消', '已赔付'].includes(order.value.status)) return -1;
  return STEPS.indexOf(order.value.status);
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:py-8">
    <div v-if="order">
      <p class="font-mono text-xs uppercase tracking-wide text-slate-500">ORDER</p>
      <h1 class="page-title mt-1">订单 #{{ order.id }}</h1>
      <p class="page-desc font-mono">
        {{ order.sku?.name }}
        <span class="text-slate-600">·</span>
        {{ order.supplier_display || '—' }}
      </p>

      <ol class="mt-8 flex flex-wrap border border-slate-700 bg-slate-900">
        <li
          v-for="(s, i) in STEPS"
          :key="s"
          class="border-r border-slate-700 px-3 py-2 text-xs last:border-r-0"
          :class="i <= stepIndex ? 'bg-amber-500 font-medium text-slate-950' : 'text-slate-500'"
        >
          <span class="font-mono text-[10px] opacity-70">{{ String(i + 1).padStart(2, '0') }}</span>
          {{ s }}
        </li>
      </ol>

      <div v-if="['已取消', '已赔付'].includes(order.status)" class="mt-3 text-sm text-slate-400">
        当前状态：{{ order.status }}
      </div>

      <dl class="panel mt-5 grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt class="field-label">状态</dt>
          <dd class="mt-1">{{ order.status }}</dd>
        </div>
        <div>
          <dt class="field-label">成交价</dt>
          <dd class="mono-num mt-1 text-xl font-semibold text-amber-500">
            {{ Number(order.price).toLocaleString('zh-CN') }}
          </dd>
        </div>
        <div>
          <dt class="field-label">报价交付日</dt>
          <dd class="mt-1 font-mono text-slate-300">{{ order.quote?.delivery_date || '—' }}</dd>
        </div>
      </dl>

      <div v-if="order.logs?.length" class="mt-6">
        <h2 class="text-xs font-medium uppercase tracking-wider text-slate-500">进度留言</h2>
        <ul class="panel mt-2 divide-y divide-slate-700 text-sm">
          <li v-for="log in order.logs" :key="log.id" class="px-4 py-3">
            <p class="text-slate-200">{{ log.note || `${log.from_status || '—'} → ${log.to_status}` }}</p>
            <p class="mt-1 font-mono text-xs text-slate-500">{{ log.created_at?.replace('T', ' ').slice(0, 19) }}</p>
          </li>
        </ul>
      </div>
    </div>
    <p v-else-if="err" class="text-sm text-red-400">{{ err }}</p>
  </div>
</template>

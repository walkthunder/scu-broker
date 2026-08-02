<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const sku = ref(null);
const err = ref('');

onMounted(async () => {
  try {
    const res = await api(`/customer/skus/${route.params.id}`);
    sku.value = res.data;
  } catch (e) {
    err.value = e.message;
  }
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
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:py-8">
    <p v-if="err" class="text-sm text-red-400">{{ err }}</p>
    <template v-else-if="sku">
      <p class="font-mono text-xs uppercase tracking-wider text-slate-500">{{ sku.type }} · {{ sku.unit }}</p>
      <h1 class="page-title mt-1 font-mono text-3xl">{{ sku.name }}</h1>
      <p class="page-desc">{{ sku.selling_point || sku.spec || '—' }}</p>

      <div class="mt-8 grid gap-6 lg:grid-cols-3">
        <div class="panel p-5 lg:col-span-2">
          <p class="field-label">今日参考中位</p>
          <p class="mono-num mt-2 text-4xl font-semibold text-amber-500">
            {{ fmt(sku.price_mid) }}
            <span :class="['ml-3 text-sm font-normal', changeClass(sku.change_pct)]">{{ sku.change_label }}</span>
          </p>
          <p class="mt-4 font-mono text-sm text-slate-400">
            区间 {{ fmt(sku.price_low) }} – {{ fmt(sku.price_high) }}
          </p>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div class="h-full w-3/5 bg-gradient-to-r from-slate-600 to-amber-500" />
          </div>
          <dl class="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="field-label">规格</dt>
              <dd class="mt-1 text-slate-200">{{ sku.spec || '—' }}</dd>
            </div>
            <div>
              <dt class="field-label">近 30 日成交</dt>
              <dd class="mono-num mt-1 text-slate-200">
                <template v-if="sku.deal_low == null">暂无</template>
                <template v-else>{{ fmt(sku.deal_low) }} – {{ fmt(sku.deal_high) }}</template>
              </dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="field-label">交期说明</dt>
              <dd class="mt-1 text-slate-300">{{ sku.delivery_note || '以 Broker 确认为准，通常 1–5 个工作日。' }}</dd>
            </div>
          </dl>
        </div>
        <div class="panel flex flex-col justify-between p-5">
          <div>
            <p class="text-sm text-slate-400">对该 SKU 提交询价，Broker 将线下撮合并回传正式报价。</p>
          </div>
          <button
            type="button"
            class="btn-primary mt-6 w-full"
            @click="router.push({ path: '/rfq', query: { sku_id: sku.id, from: 'sku' } })"
          >
            询价 {{ sku.name }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

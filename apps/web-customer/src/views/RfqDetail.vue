<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const rfq = ref(null);
const err = ref('');
const msg = ref('');
const acting = ref('');
const now = ref(Date.now());
let timer;

const statusLabel = {
  pending: '待处理',
  quoted: '已报价',
  confirmed: '已确认',
  rejected: '已拒绝',
};

async function load() {
  const res = await api(`/customer/rfqs/${route.params.id}`);
  rfq.value = res.data;
}

onMounted(async () => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  try {
    await load();
  } catch (e) {
    err.value = e.message;
  }
});

onUnmounted(() => clearInterval(timer));

const remainText = computed(() => {
  const exp = rfq.value?.quote?.expiry_time;
  if (!exp) return null;
  const rem = Math.max(0, Math.floor((new Date(exp) - now.value) / 1000));
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem % 3600) / 60);
  const s = rem % 60;
  return { rem, text: `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` };
});

async function act(action) {
  err.value = '';
  msg.value = '';
  acting.value = action;
  try {
    const res = await api(`/customer/quotes/${rfq.value.quote.id}/${action}`, { method: 'POST' });
    msg.value = res.message;
    if (action === 'confirm' && res.data?.order) {
      router.push(`/orders/${res.data.order.id}`);
      return;
    }
    await load();
  } catch (e) {
    err.value = e.message;
  } finally {
    acting.value = '';
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:py-8">
    <div v-if="rfq">
      <p class="font-mono text-xs uppercase tracking-wide text-slate-500">RFQ</p>
      <h1 class="page-title mt-1">询价 #{{ rfq.id }}</h1>

      <div class="panel mt-5 divide-y divide-slate-700 text-sm">
        <div class="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p class="field-label">SKU</p>
            <p class="mt-1 font-mono font-medium">{{ rfq.sku?.name }} × {{ rfq.quantity }}</p>
          </div>
          <div>
            <p class="field-label">状态</p>
            <p class="mt-1">{{ statusLabel[rfq.status] || rfq.status }}</p>
          </div>
          <div class="sm:col-span-2">
            <p class="field-label">备注</p>
            <p class="mt-1 text-slate-400">{{ rfq.note || '—' }}</p>
          </div>
        </div>

        <div v-if="rfq.quote" class="p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xs font-medium uppercase tracking-wider text-slate-500">报价</h2>
            <p v-if="rfq.quote.status === 'pending' && remainText" class="font-mono text-sm text-amber-500">
              剩余 {{ remainText.text }}
            </p>
          </div>
          <dl class="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt class="field-label">成交价</dt>
              <dd class="mono-num mt-1 text-xl font-semibold text-amber-500">
                {{ Number(rfq.quote.price).toLocaleString('zh-CN') }}
              </dd>
            </div>
            <div>
              <dt class="field-label">交付时间</dt>
              <dd class="mt-1 font-mono">{{ rfq.quote.delivery_date || '—' }}</dd>
            </div>
            <div>
              <dt class="field-label">供应商</dt>
              <dd class="mt-1">{{ rfq.quote.supplier_display || '平台优选供应商' }}</dd>
            </div>
            <div>
              <dt class="field-label">有效期至</dt>
              <dd class="mt-1 font-mono text-slate-400">
                {{ rfq.quote.expiry_time?.replace('T', ' ').slice(0, 19) || '—' }}
              </dd>
            </div>
            <div v-if="rfq.quote.customer_view_note" class="sm:col-span-2">
              <dt class="field-label">Broker 说明</dt>
              <dd class="mt-1 text-slate-300">{{ rfq.quote.customer_view_note }}</dd>
            </div>
          </dl>
          <div v-if="rfq.quote.status === 'pending' && remainText?.rem > 0" class="mt-5 flex flex-wrap gap-2">
            <button type="button" class="btn-primary" :disabled="!!acting" @click="act('confirm')">
              {{ acting === 'confirm' ? '处理中…' : '确认报价' }}
            </button>
            <button type="button" class="btn-secondary" :disabled="!!acting" @click="act('reject')">
              {{ acting === 'reject' ? '处理中…' : '拒绝' }}
            </button>
          </div>
          <p v-else-if="rfq.quote.status === 'pending'" class="mt-4 text-sm text-slate-500">
            报价已过期，请联系 Broker 重新报价。
          </p>
          <p v-else-if="rfq.quote.status === 'confirmed'" class="mt-4 text-sm text-slate-400">已确认此报价</p>
          <p v-else-if="rfq.quote.status === 'rejected'" class="mt-4 text-sm text-slate-400">已拒绝此报价</p>
        </div>
        <div v-else class="p-5 text-slate-500">暂无报价，请等待 Broker 反馈。</div>
      </div>

      <p v-if="msg" class="mt-3 text-sm text-slate-400">{{ msg }}</p>
      <p v-if="err" class="mt-3 text-sm text-red-400">{{ err }}</p>
    </div>
    <p v-else-if="err" class="text-sm text-red-400">{{ err }}</p>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api } from '../api';

const skus = ref([]);
const regions = ref([]);
const book = ref({ bids: [], asks: [], impact: null });
const form = reactive({
  sku_id: null,
  region: 'shanghai',
  side: 'buy',
  order_type: 'limit',
  price: 0,
  qty: 1,
});
const msg = ref('');
const err = ref('');
const curve = ref([]);
const myOrders = ref([]);

async function loadMeta() {
  try {
    skus.value = (await api('/customer/skus')).data || [];
    regions.value = (await api('/frd/meta/regions')).data || [];
    if (skus.value[0]) form.sku_id = skus.value[0].id;
    await refreshBook();
    await loadOrders();
  } catch (e) {
    err.value = e.message;
  }
}

async function loadOrders() {
  try {
    myOrders.value = (await api('/frd/spot/orders/mine')).data || [];
  } catch (e) {
    void e;
  }
}

async function refreshBook() {
  if (!form.sku_id) return;
  try {
    book.value = (
      await api(`/frd/spot/book?sku_id=${form.sku_id}&region=${form.region}&qty=${form.qty}`)
    ).data;
    curve.value =
      (await api(`/frd/curves?sku_id=${form.sku_id}&region=${form.region}&kind=spot`)).data || [];
  } catch (e) {
    err.value = e.message;
  }
}

async function place() {
  err.value = '';
  msg.value = '';
  try {
    const r = await api('/frd/spot/orders', { method: 'POST', body: { ...form } });
    if (r.data?.require_rfq) {
      msg.value = r.data.message + ' → 请走询价';
      return;
    }
    msg.value = `下单成功 #${r.data?.order?.id} 状态 ${r.data?.order?.status}`;
    await refreshBook();
    await loadOrders();
  } catch (e) {
    err.value = e.message;
  }
}

async function cancel(id) {
  err.value = '';
  try {
    await api(`/frd/spot/orders/${id}/cancel`, { method: 'POST' });
    msg.value = `已取消 #${id}`;
    await refreshBook();
    await loadOrders();
  } catch (e) {
    err.value = e.message;
  }
}

onMounted(loadMeta);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="page-title">现货交易台</h1>
    <p class="page-desc">限价/市价挂单 · 盘口深度 · 大额引导 RFQ</p>
    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <div class="panel p-4">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <label>
            标的
            <select v-model="form.sku_id" class="mt-1 w-full" @change="refreshBook">
              <option v-for="s in skus" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <label>
            区域
            <select v-model="form.region" class="mt-1 w-full" @change="refreshBook">
              <option v-for="r in regions" :key="r.code" :value="r.code">{{ r.name }}</option>
            </select>
          </label>
          <label>
            方向
            <select v-model="form.side" class="mt-1 w-full">
              <option value="buy">买入</option>
              <option value="sell">卖出</option>
            </select>
          </label>
          <label>
            类型
            <select v-model="form.order_type" class="mt-1 w-full">
              <option value="limit">限价</option>
              <option value="market">市价</option>
            </select>
          </label>
          <label>
            价格
            <input v-model.number="form.price" type="number" class="mt-1 w-full" />
          </label>
          <label>
            数量
            <input v-model.number="form.qty" type="number" class="mt-1 w-full" @change="refreshBook" />
          </label>
        </div>
        <button class="btn-primary mt-4" type="button" @click="place">下单</button>
        <p v-if="msg" class="mt-2 text-sm text-emerald-400">{{ msg }}</p>
        <p v-if="err" class="mt-2 text-sm text-rose-400">{{ err }}</p>
        <p v-if="book.impact?.buy" class="mt-3 text-xs text-slate-500">
          买冲击均价 {{ book.impact.buy.avg_price }} · 未成交 {{ book.impact.buy.unfilled }}
          <span v-if="book.impact.buy.suggest_rfq"> · 建议 RFQ</span>
        </p>
      </div>
      <div class="panel p-4">
        <h2 class="mb-2 text-sm text-slate-300">盘口</h2>
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div class="mb-1 text-emerald-400">买盘</div>
            <div v-for="(b, i) in book.bids" :key="'b' + i" class="flex justify-between font-mono">
              <span>{{ b.price }}</span><span>{{ b.qty }}</span>
            </div>
          </div>
          <div>
            <div class="mb-1 text-rose-400">卖盘</div>
            <div v-for="(a, i) in book.asks" :key="'a' + i" class="flex justify-between font-mono">
              <span>{{ a.price }}</span><span>{{ a.qty }}</span>
            </div>
          </div>
        </div>
        <h2 class="mb-2 mt-6 text-sm text-slate-300">现货结算价曲线（点）</h2>
        <div class="max-h-40 overflow-auto text-xs text-slate-400">
          <div v-for="p in curve.slice(-14)" :key="p.date" class="flex justify-between font-mono">
            <span>{{ p.date }}</span>
            <span>{{ p.settle }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="panel mt-6 p-4">
      <h2 class="mb-3 text-sm text-slate-300">我的挂单</h2>
      <div
        v-for="o in myOrders.filter((x) => ['open', 'partial'].includes(x.status))"
        :key="o.id"
        class="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 text-sm last:border-0"
      >
        <span class="text-slate-400">
          #{{ o.id }} {{ o.side }} {{ o.sku?.name }} {{ o.region }} · {{ o.price }} ×
          {{ o.qty }} · {{ o.status }}
        </span>
        <button type="button" class="btn-secondary text-xs" @click="cancel(o.id)">取消</button>
      </div>
      <p
        v-if="!myOrders.filter((x) => ['open', 'partial'].includes(x.status)).length"
        class="text-sm text-slate-500"
      >
        暂无未完成挂单
      </p>
    </div>
  </div>
</template>

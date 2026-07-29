<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

const list = ref([]);
const selected = ref(null);
const prints = ref([]);
const loading = ref(true);
const err = ref('');

async function load() {
  loading.value = true;
  try {
    list.value = (await api('/customer/indices')).data || [];
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function open(row) {
  selected.value = row;
  prints.value = [];
  err.value = '';
  try {
    prints.value = (await api(`/customer/indices/${row.id}/prints`)).data || [];
  } catch (e) {
    err.value = e.message;
    prints.value = [];
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="page-title">价格指数</h1>
    <p class="page-desc">
      日结算价 S 由平台发布；未发布价格不可用于远期结算。详见
      <router-link to="/about#index-rules" class="text-amber-400 hover:underline">指数规则</router-link>。
    </p>
    <p v-if="err" class="mt-4 text-sm text-rose-400">{{ err }}</p>
    <p v-else-if="loading" class="mt-4 text-sm text-slate-500">加载中…</p>
    <div v-else class="mt-6 grid gap-6 lg:grid-cols-2">
      <div class="panel overflow-hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>标的</th>
              <th>最新 S</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in list"
              :key="row.id"
              class="cursor-pointer hover:bg-slate-800/60"
              @click="open(row)"
            >
              <td class="font-mono">{{ row.code }}</td>
              <td>{{ row.name }}</td>
              <td class="text-xs text-slate-400">
                {{ row.sku?.name || '—' }}
                <span v-if="row.sku?.unit">· {{ row.sku.unit }}</span>
              </td>
              <td>
                <template v-if="row.latest_published">
                  {{ row.latest_published.settle_price }}
                  <span class="text-xs text-slate-500">({{ row.latest_published.date }})</span>
                </template>
                <span v-else class="text-slate-500">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="panel p-4">
        <h2 class="mb-3 text-sm font-medium text-slate-300">
          {{ selected ? `${selected.code} 历史结算价` : '选择指数查看历史' }}
        </h2>
        <p v-if="selected" class="mb-3 text-xs text-slate-500">
          标的 {{ selected.sku?.name || '—' }}
          <span v-if="selected.sku?.unit">（{{ selected.sku.unit }}）</span>
        </p>
        <table v-if="selected" class="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>结算价 S</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in prints" :key="p.date">
              <td>{{ p.date }}</td>
              <td class="font-mono">{{ p.settle_price }}</td>
            </tr>
            <tr v-if="!prints.length">
              <td colspan="2" class="py-6 text-center text-slate-500">暂无已发布历史</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-slate-500">点击左侧一行</p>
      </div>
    </div>
  </div>
</template>

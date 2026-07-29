<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

const list = ref([]);
const loading = ref(true);
const err = ref('');

async function load() {
  loading.value = true;
  try {
    list.value = (await api('/customer/settlement-bills')).data || [];
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="page-title">远期结算账单</h1>
    <p class="page-desc">差价按 (S−X)×数量；方向以「应收 / 应付」标注。线下收付后由 Broker 确认。</p>
    <p v-if="err" class="mt-4 text-sm text-rose-400">{{ err }}</p>
    <div class="panel mt-6 overflow-hidden">
      <p v-if="loading" class="p-4 text-sm text-slate-500">加载中…</p>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>账单</th>
            <th>合约</th>
            <th>S / X</th>
            <th>数量</th>
            <th>金额</th>
            <th>对我</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in list" :key="row.id">
            <td class="font-mono">#{{ row.id }}</td>
            <td>#{{ row.contract_id }}</td>
            <td>{{ row.settle_price }} / {{ row.strike }}</td>
            <td>{{ row.qty }}</td>
            <td class="font-mono">{{ row.amount }}</td>
            <td>
              <span
                :class="
                  row.cashflow === 'receive'
                    ? 'text-emerald-400'
                    : row.cashflow === 'pay'
                      ? 'text-amber-400'
                      : 'text-slate-400'
                "
              >
                {{ row.cashflow_label }}
              </span>
            </td>
            <td>{{ row.pay_status === 'done' ? '已收付' : '待确认' }}</td>
          </tr>
          <tr v-if="!list.length">
            <td colspan="7" class="py-8 text-center text-slate-500">暂无账单</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

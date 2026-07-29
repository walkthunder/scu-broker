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
  <div class="mx-auto max-w-6xl px-4 py-6 sm:py-8">
    <h1 class="page-title">远期结算账单</h1>
    <p class="page-desc">
      差价按 (S−X)×数量；方向以「应收 / 应付」标注。线下收付后由 Broker 确认。规则见
      <router-link to="/about#settle-rules" class="text-amber-400 hover:underline">结算规则</router-link>。
    </p>
    <p v-if="err" class="mt-4 text-sm text-rose-400">{{ err }}</p>
    <p v-if="loading" class="mt-4 text-sm text-slate-500">加载中…</p>
    <template v-else>
      <div class="mt-6 space-y-2 md:hidden">
        <article v-for="row in list" :key="row.id" class="market-card">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-mono text-sm text-slate-100">账单 #{{ row.id }}</p>
              <p class="mt-0.5 text-xs text-slate-500">合约 #{{ row.contract_id }} · S {{ row.settle_price }} / X {{ row.strike }}</p>
            </div>
            <span class="text-xs text-slate-400">
              {{ row.pay_status === 'done' ? '已收付' : '待确认' }}
            </span>
          </div>
          <div class="mt-3 flex items-end justify-between gap-2">
            <div>
              <p class="mono-num text-lg font-semibold text-slate-100">{{ row.amount }}</p>
              <p class="text-xs text-slate-500">数量 {{ row.qty }}</p>
            </div>
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
          </div>
        </article>
        <div v-if="!list.length" class="py-10 text-center text-sm text-slate-500">
          <p>暂无结算账单</p>
          <p class="mt-2 text-xs text-slate-600">
            可先到
            <router-link to="/forwards" class="text-amber-400 hover:underline">持仓</router-link>
            查看合约状态。
          </p>
        </div>
      </div>

      <div class="panel mt-6 hidden overflow-x-auto md:block">
        <table class="data-table">
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
              <td colspan="7" class="py-10 text-center text-slate-500">
                <p>暂无结算账单</p>
                <p class="mt-2 text-xs text-slate-600">
                  合约到期现金结算后会出现在这里。可先到
                  <router-link to="/forwards" class="text-amber-400 hover:underline">持仓</router-link>
                  查看合约状态。
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

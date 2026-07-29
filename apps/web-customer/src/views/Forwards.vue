<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { currentUser } from '../api';

const list = ref([]);
const tab = ref('pending');
const loading = ref(true);
const err = ref('');
const msg = ref('');

const pending = computed(() => list.value.filter((r) => r.status === 'pending_confirm'));
const openRows = computed(() => list.value.filter((r) => r.status === 'open'));
const shown = computed(() => (tab.value === 'pending' ? pending.value : openRows.value));

async function load() {
  loading.value = true;
  err.value = '';
  try {
    list.value = (await api('/customer/forwards')).data || [];
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
}

function mySide(row) {
  const uid = currentUser.value?.id;
  if (Number(row.buyer_id) === Number(uid)) return 'buyer';
  if (Number(row.seller_id) === Number(uid)) return 'seller';
  return null;
}

function canConfirm(row) {
  const side = mySide(row);
  if (!side || row.status !== 'pending_confirm') return false;
  if (side === 'buyer') return !row.buyer_confirmed_at;
  return !row.seller_confirmed_at;
}

async function confirm(row) {
  msg.value = '';
  try {
    await api(`/customer/forwards/${row.id}/confirm`, { method: 'POST' });
    msg.value = `合约 #${row.id} 已确认`;
    await load();
  } catch (e) {
    err.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="page-title">我的远期持仓</h1>
    <p class="page-desc">待确认需双方确认后生效；浮动盈亏按最新已发布 S 估算，非最终结算。</p>
    <p v-if="msg" class="mt-2 text-sm text-emerald-400">{{ msg }}</p>
    <p v-if="err" class="mt-2 text-sm text-rose-400">{{ err }}</p>

    <div class="mt-6 flex gap-3 text-sm">
      <button
        type="button"
        class="rounded px-3 py-1.5"
        :class="tab === 'pending' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="tab = 'pending'"
      >
        待确认 ({{ pending.length }})
      </button>
      <button
        type="button"
        class="rounded px-3 py-1.5"
        :class="tab === 'open' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="tab = 'open'"
      >
        持仓中 ({{ openRows.length }})
      </button>
    </div>

    <div class="panel mt-4 overflow-hidden">
      <p v-if="loading" class="p-4 text-sm text-slate-500">加载中…</p>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>合约</th>
            <th>指数</th>
            <th>我的角色</th>
            <th>X</th>
            <th>数量</th>
            <th>到期</th>
            <th>浮动盈亏</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in shown" :key="row.id">
            <td class="font-mono">#{{ row.id }}</td>
            <td>{{ row.index?.code }}</td>
            <td>{{ mySide(row) === 'buyer' ? '买方(多)' : '卖方(空)' }}</td>
            <td>{{ row.strike_price }}</td>
            <td>{{ row.qty }} {{ row.unit }}</td>
            <td>{{ row.expiry_date }}</td>
            <td>
              <template v-if="row.mtm">
                {{ row.mtm.signed_amount }}
                <span class="text-xs text-slate-500">· {{ row.mtm.note }}</span>
              </template>
              <span v-else>—</span>
            </td>
            <td>
              <button
                v-if="canConfirm(row)"
                type="button"
                class="btn-primary !py-1 !text-xs"
                @click="confirm(row)"
              >
                确认
              </button>
            </td>
          </tr>
          <tr v-if="!shown.length">
            <td colspan="8" class="py-8 text-center text-slate-500">暂无记录</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

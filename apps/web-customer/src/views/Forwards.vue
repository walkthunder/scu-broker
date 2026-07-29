<script setup>
import { computed, onMounted, ref } from 'vue';
import { api, currentUser } from '../api';

const list = ref([]);
const channels = ref([]);
const whitelisted = ref(false);
const tab = ref('pending');
const loading = ref(true);
const err = ref('');
const msg = ref('');
const deliveryTarget = ref(null);
const channelId = ref(null);

const pending = computed(() => list.value.filter((r) => r.status === 'pending_confirm'));
const openRows = computed(() =>
  list.value.filter((r) => ['open', 'delivery_pending', 'delivered'].includes(r.status)),
);
const doneRows = computed(() =>
  list.value.filter((r) => ['settled', 'cancelled'].includes(r.status)),
);
const shown = computed(() => {
  if (tab.value === 'pending') return pending.value;
  if (tab.value === 'done') return doneRows.value;
  return openRows.value;
});

const matchedChannels = computed(() => {
  const skuId = deliveryTarget.value?.index?.sku_id;
  if (!skuId) return channels.value;
  return channels.value.filter((c) => Number(c.sku_id) === Number(skuId));
});

async function load() {
  loading.value = true;
  err.value = '';
  try {
    const [f, wl, ch] = await Promise.all([
      api('/customer/forwards'),
      api('/customer/delivery-whitelist/me'),
      api('/customer/delivery-channels'),
    ]);
    list.value = f.data || [];
    whitelisted.value = !!wl.data?.whitelisted;
    channels.value = ch.data || [];
  } catch (e) {
    err.value = e.message;
    list.value = [];
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

function hasActiveDelivery(row) {
  return (row.delivery_orders || []).some((d) => ['pending', 'approved', 'done'].includes(d.status));
}

function canRequestDelivery(row) {
  return (
    row.can_request_delivery &&
    row.delivery_window_open &&
    whitelisted.value &&
    !hasActiveDelivery(row)
  );
}

function deliveryHint(row) {
  if (row.status !== 'open' || row.settle_mode === 'physical') return '';
  if (row.delivery_pending_review) return '';
  if (!whitelisted.value) return '未开通交割白名单';
  if (!row.delivery_window_open) return '不在交割窗口（到期前7天～到期日）';
  if (hasActiveDelivery(row)) return '';
  return '';
}

function statusText(row) {
  if (row.status === 'delivered') return '已交割';
  if (row.status === 'delivery_pending') return '交割中';
  if (row.status === 'settled') return '已结算';
  if (row.status === 'cancelled') return '已取消';
  if (row.delivery_pending_review) return '交割审核中';
  if (row.status === 'open') return '持仓中';
  return row.lifecycle_label || row.status;
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

function openDelivery(row) {
  deliveryTarget.value = row;
  const skuId = row.index?.sku_id;
  const matched = skuId
    ? channels.value.filter((c) => Number(c.sku_id) === Number(skuId))
    : channels.value;
  channelId.value = matched[0]?.id || null;
}

async function submitDelivery() {
  if (!deliveryTarget.value) return;
  if (!channelId.value) {
    err.value = matchedChannels.value.length
      ? '请选择交割通道'
      : '暂无与该标的匹配的交割通道，请联系运营';
    return;
  }
  msg.value = '';
  err.value = '';
  try {
    await api(`/customer/forwards/${deliveryTarget.value.id}/delivery-request`, {
      method: 'POST',
      body: { channel_id: channelId.value },
    });
    msg.value = `合约 #${deliveryTarget.value.id} 交割申请已提交`;
    deliveryTarget.value = null;
    tab.value = 'open';
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
    <p class="page-desc">
      待确认需双方确认后生效；浮动盈亏按最新已发布 S 估算（对本方），非最终结算。
      交割规则见
      <router-link to="/about#delivery-rules" class="text-amber-400 hover:underline">保障页摘要</router-link>。
      <span v-if="whitelisted" class="text-emerald-400">已开通实物交割白名单。</span>
      <span v-else class="text-slate-500">实物交割需运营开通白名单。</span>
    </p>
    <p v-if="msg" class="mt-2 text-sm text-emerald-400">{{ msg }}</p>
    <p v-if="err" class="mt-2 text-sm text-rose-400">{{ err }}</p>

    <div class="mt-6 flex flex-wrap gap-3 text-sm">
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
        持仓 / 交割 ({{ openRows.length }})
      </button>
      <button
        type="button"
        class="rounded px-3 py-1.5"
        :class="tab === 'done' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="tab = 'done'"
      >
        已完结 ({{ doneRows.length }})
      </button>
    </div>

    <div class="panel mt-4 overflow-hidden">
      <p v-if="loading" class="p-4 text-sm text-slate-500">加载中…</p>
      <p v-else-if="err && !list.length" class="p-4 text-sm text-rose-400">{{ err }}</p>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>合约</th>
            <th>指数</th>
            <th>角色</th>
            <th>X</th>
            <th>数量</th>
            <th>到期</th>
            <th>状态</th>
            <th>浮动盈亏</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in shown" :key="row.id">
            <td class="font-mono">#{{ row.id }}</td>
            <td>{{ row.index?.code }}</td>
            <td>{{ mySide(row) === 'buyer' ? '买方(多)' : mySide(row) === 'seller' ? '卖方(空)' : '—' }}</td>
            <td>{{ row.strike_price }}</td>
            <td>{{ row.qty }} {{ row.unit }}</td>
            <td>{{ row.expiry_date }}</td>
            <td>
              <span
                :class="{
                  'text-emerald-400': row.status === 'delivered' || row.status === 'settled',
                  'text-amber-300':
                    row.status === 'delivery_pending' || row.delivery_pending_review,
                  'text-slate-500': row.status === 'cancelled',
                }"
              >
                {{ statusText(row) }}
              </span>
            </td>
            <td>
              <template v-if="row.mtm">
                {{ row.mtm.signed_amount }}
                <span class="text-xs text-slate-500">· {{ row.mtm.note }}</span>
              </template>
              <span v-else>—</span>
            </td>
            <td class="space-x-2">
              <button
                v-if="canConfirm(row)"
                type="button"
                class="btn-primary !py-1 !text-xs"
                @click="confirm(row)"
              >
                确认
              </button>
              <button
                v-if="canRequestDelivery(row)"
                type="button"
                class="btn-ghost !py-1 !text-xs"
                @click="openDelivery(row)"
              >
                申请交割
              </button>
              <span
                v-else-if="row.status === 'open' && deliveryHint(row)"
                class="text-xs text-slate-500"
              >
                {{ deliveryHint(row) }}
              </span>
              <router-link
                v-if="row.status === 'settled'"
                to="/bills"
                class="text-xs text-amber-400 hover:underline"
              >
                看账单
              </router-link>
            </td>
          </tr>
          <tr v-if="!shown.length">
            <td colspan="9" class="py-8 text-center text-slate-500">
              <template v-if="tab === 'done'">暂无已结算/已取消合约</template>
              <template v-else>暂无记录</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="deliveryTarget"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      @click.self="deliveryTarget = null"
    >
      <div class="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5">
        <h3 class="text-sm font-medium text-slate-100">申请实物交割 · 合约 #{{ deliveryTarget.id }}</h3>
        <p class="mt-2 text-xs text-slate-400">窗口：到期日前 7 天至到期日当日。批准后不再现金结算。</p>
        <label class="mt-4 block text-xs text-slate-400">交割通道</label>
        <select
          v-model="channelId"
          class="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
        >
          <option v-for="c in matchedChannels" :key="c.id" :value="c.id">
            {{ c.name }}（{{ c.sku?.name }}）
          </option>
        </select>
        <p v-if="deliveryTarget && !matchedChannels.length" class="mt-2 text-xs text-rose-400">
          无匹配该标的的交割通道
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-ghost !py-1.5 !text-xs" @click="deliveryTarget = null">
            取消
          </button>
          <button type="button" class="btn-primary !py-1.5 !text-xs" @click="submitDelivery">
            提交申请
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

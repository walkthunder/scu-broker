<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, currentUser } from '../api';

const route = useRoute();
const list = ref([]);
const offers = ref([]);
const channels = ref([]);
const whitelisted = ref(false);
const tab = ref(
  route.query.tab === 'open' || route.query.tab === 'done' || route.query.tab === 'buy'
    ? route.query.tab
    : 'pending',
);
const loading = ref(true);
const err = ref('');
const msg = ref('');
const deliveryTarget = ref(null);
const channelId = ref(null);
const buyForm = ref({
  index_id: null,
  qty: 1,
  strike_price: null,
  tenor_months: 6,
});
const buying = ref(false);

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
    const [f, wl, ch, of] = await Promise.all([
      api('/customer/forwards'),
      api('/customer/delivery-whitelist/me'),
      api('/customer/delivery-channels'),
      api('/frd/presale/offers').catch(() => ({ data: [] })),
    ]);
    list.value = f.data || [];
    whitelisted.value = !!wl.data?.whitelisted;
    channels.value = ch.data || [];
    offers.value = of.data || [];
  } catch (e) {
    err.value = e.message;
    list.value = [];
  } finally {
    loading.value = false;
  }
}

function pickOffer(o) {
  buyForm.value = {
    index_id: o.index_id,
    qty: 1,
    strike_price: o.strike_suggest,
    tenor_months: o.tenor_months || 6,
  };
  tab.value = 'buy';
}

async function buyPresale() {
  buying.value = true;
  err.value = '';
  msg.value = '';
  try {
    const body = {
      index_id: buyForm.value.index_id,
      qty: buyForm.value.qty,
      strike_price: buyForm.value.strike_price,
      tenor_months: buyForm.value.tenor_months,
      presale: true,
    };
    const out = await api('/frd/presale/open', { method: 'POST', body });
    msg.value = `预售已提交 #${out.data?.id || ''}，请在「待确认」完成确认（保证金已按初始比例冻结）`;
    tab.value = 'pending';
    await load();
  } catch (e) {
    err.value = e.message;
  } finally {
    buying.value = false;
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

function canSetIntent(row) {
  const intentUnset = !row.delivery_intent || row.delivery_intent === 'unset';
  return (
    row.status === 'open' &&
    mySide(row) === 'buyer' &&
    intentUnset &&
    row.intent_window_open
  );
}

async function setIntent(row, intent) {
  msg.value = '';
  err.value = '';
  try {
    await api(`/frd/forwards/${row.id}/delivery-intent`, {
      method: 'POST',
      body: { intent },
    });
    msg.value = `合约 #${row.id} 交割意愿已确认为 ${intent === 'physical' ? '实物' : '现金'}`;
    await load();
  } catch (e) {
    err.value = e.message;
  }
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
      可自助买入预售（对手方为平台默认卖方）；待确认需双方确认后生效；浮动盈亏按最新已发布 S 估算（对本方），非最终结算。
      交割规则见
      <router-link to="/about#delivery-rules" class="text-amber-400 hover:underline">保障页摘要</router-link>。
      <span v-if="whitelisted" class="text-emerald-400">已开通实物交割白名单。</span>
      <span v-else class="text-slate-500">实物交割需运营开通白名单。</span>
    </p>
    <p v-if="msg" class="mt-2 text-sm text-emerald-400">{{ msg }}</p>
    <p v-if="err" class="mt-2 text-sm text-rose-400">{{ err }}</p>

    <div class="mt-6 flex gap-1 overflow-x-auto text-sm sm:flex-wrap sm:gap-3" style="-webkit-overflow-scrolling: touch">
      <button
        type="button"
        class="tap-target shrink-0 rounded px-3 py-2"
        :class="tab === 'buy' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="tab = 'buy'"
      >
        买入预售
      </button>
      <button
        type="button"
        class="tap-target shrink-0 rounded px-3 py-2"
        :class="tab === 'pending' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="tab = 'pending'"
      >
        待确认 ({{ pending.length }})
      </button>
      <button
        type="button"
        class="tap-target shrink-0 rounded px-3 py-2"
        :class="tab === 'open' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="tab = 'open'"
      >
        持仓 ({{ openRows.length }})
      </button>
      <button
        type="button"
        class="tap-target shrink-0 rounded px-3 py-2"
        :class="tab === 'done' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="tab = 'done'"
      >
        已完结 ({{ doneRows.length }})
      </button>
    </div>

    <p v-if="loading" class="mt-4 text-sm text-slate-500">加载中…</p>
    <p v-else-if="err && !list.length && tab !== 'buy'" class="mt-4 text-sm text-rose-400">{{ err }}</p>
    <template v-else-if="tab === 'buy'">
      <div class="mt-4 panel p-4">
        <h2 class="text-sm font-medium text-slate-200">今日预售挂牌</h2>
        <p class="mt-1 text-xs text-slate-500">
          建议价 = 现货结算价 × (1 + 预售基差)；折让% 相对现货。买入后进入双方确认并冻结初始保证金。
        </p>
        <div class="mt-3 space-y-2">
          <button
            v-for="o in offers"
            :key="o.index_id"
            type="button"
            class="flex w-full items-center justify-between rounded border border-slate-800 bg-slate-950/40 px-3 py-2 text-left hover:border-amber-500/40"
            @click="pickOffer(o)"
          >
            <div>
              <div class="text-sm text-slate-100">{{ o.code }} · {{ o.sku?.name }} · {{ o.region }}</div>
              <div class="mt-0.5 text-xs text-slate-500">
                现货 S {{ o.spot_settle }} · 建议 X {{ o.strike_suggest }}（{{ o.strike_low }}–{{ o.strike_high }}）·
                到期 {{ o.expiry_suggest }}
              </div>
            </div>
            <span class="shrink-0 text-sm text-emerald-400">折让 {{ o.discount_pct }}%</span>
          </button>
          <p v-if="!offers.length" class="text-sm text-slate-500">暂无挂牌（需已发布结算价）</p>
        </div>
        <div v-if="buyForm.index_id" class="mt-4 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-4">
          <label class="text-xs text-slate-500">
            数量
            <input v-model.number="buyForm.qty" type="number" min="0.01" step="0.01" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100" />
          </label>
          <label class="text-xs text-slate-500">
            锁价 X
            <input v-model.number="buyForm.strike_price" type="number" min="0.01" step="0.01" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100" />
          </label>
          <label class="text-xs text-slate-500">
            期限（月）
            <input v-model.number="buyForm.tenor_months" type="number" min="1" max="24" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100" />
          </label>
          <div class="flex items-end">
            <button type="button" class="btn-primary w-full text-sm" :disabled="buying" @click="buyPresale">
              {{ buying ? '提交中…' : '确认买入预售' }}
            </button>
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="mt-4 space-y-2 md:hidden">
        <article v-for="row in shown" :key="row.id" class="market-card">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-mono text-sm text-slate-100">#{{ row.id }} · {{ row.index?.code }}</p>
              <p class="mt-0.5 text-xs text-slate-500">
                {{ mySide(row) === 'buyer' ? '买方(多)' : mySide(row) === 'seller' ? '卖方(空)' : '—' }}
                · X {{ row.strike_price }} · {{ row.qty }} {{ row.unit }}
                <span v-if="row.discount_label" class="text-emerald-400/90"> · {{ row.discount_label }}</span>
              </p>
            </div>
            <span
              class="shrink-0 text-xs"
              :class="{
                'text-emerald-400': row.status === 'delivered' || row.status === 'settled',
                'text-amber-300':
                  row.status === 'delivery_pending' || row.delivery_pending_review,
                'text-slate-500': row.status === 'cancelled',
                'text-slate-300': row.status === 'open' || row.status === 'pending_confirm',
              }"
            >
              {{ statusText(row) }}
            </span>
          </div>
          <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>到期 {{ row.expiry_date }}</span>
            <span v-if="row.mtm" class="font-mono text-slate-300">
              MTM {{ row.mtm.signed_amount }}
            </span>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-if="canConfirm(row)"
              type="button"
              class="btn-primary !min-h-[40px] !px-3 !py-2 !text-xs"
              @click="confirm(row)"
            >
              确认
            </button>
            <button
              v-if="canSetIntent(row)"
              type="button"
              class="btn-secondary !min-h-[40px] !px-3 !py-2 !text-xs"
              @click="setIntent(row, 'cash')"
            >
              意愿·现金
            </button>
            <button
              v-if="canSetIntent(row)"
              type="button"
              class="btn-secondary !min-h-[40px] !px-3 !py-2 !text-xs"
              @click="setIntent(row, 'physical')"
            >
              意愿·实物
            </button>
            <button
              v-if="canRequestDelivery(row)"
              type="button"
              class="btn-secondary !min-h-[40px] !px-3 !py-2 !text-xs"
              @click="openDelivery(row)"
            >
              申请交割
            </button>
            <span
              v-else-if="row.status === 'open' && deliveryHint(row)"
              class="self-center text-xs text-slate-500"
            >
              {{ deliveryHint(row) }}
            </span>
            <router-link
              v-if="row.status === 'settled'"
              to="/bills"
              class="tap-target inline-flex items-center text-xs text-amber-400"
            >
              看账单
            </router-link>
          </div>
        </article>
        <p v-if="!shown.length" class="py-8 text-center text-sm text-slate-500">
          <template v-if="tab === 'done'">暂无已结算/已取消合约</template>
          <template v-else>暂无记录</template>
        </p>
      </div>

      <div class="panel mt-4 hidden overflow-x-auto md:block">
        <table class="data-table">
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
                  v-if="canSetIntent(row)"
                  type="button"
                  class="btn-ghost !py-1 !text-xs"
                  @click="setIntent(row, 'cash')"
                >
                  意愿·现金
                </button>
                <button
                  v-if="canSetIntent(row)"
                  type="button"
                  class="btn-ghost !py-1 !text-xs"
                  @click="setIntent(row, 'physical')"
                >
                  意愿·实物
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
    </template>

    <div
      v-if="deliveryTarget"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      @click.self="deliveryTarget = null"
    >
      <div
        class="w-full max-w-md rounded-t-lg border border-slate-700 bg-slate-900 p-5 sm:rounded-lg"
        style="padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px))"
      >
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

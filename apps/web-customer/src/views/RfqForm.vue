<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, currentUser } from '../api';

const DRAFT_KEY = 'comprix_rfq_draft';
const CUSTOM_DURATION = '__custom__';

/** 按时长单位给出可选档位，value 写入后端 duration */
const DURATION_PRESETS = {
  小时: [
    { value: '72小时', label: '3 天', hint: '72 小时' },
    { value: '168小时', label: '1 周', hint: '168 小时' },
    { value: '720小时', label: '约 1 月', hint: '720 小时' },
    { value: '2160小时', label: '约 3 月', hint: '2160 小时' },
  ],
  月: [
    { value: '1个月', label: '1 个月', hint: null },
    { value: '3个月', label: '3 个月', hint: null },
    { value: '6个月', label: '6 个月', hint: null },
    { value: '12个月', label: '12 个月', hint: null },
  ],
  年: [
    { value: '1年', label: '1 年', hint: null },
    { value: '2年', label: '2 年', hint: null },
    { value: '3年', label: '3 年', hint: null },
  ],
  百万token: [
    { value: '按量一次性', label: '按量一次性', hint: null },
    { value: '1个月额度', label: '1 个月额度', hint: null },
    { value: '3个月额度', label: '3 个月额度', hint: null },
    { value: '12个月额度', label: '12 个月额度', hint: null },
  ],
};

const FALLBACK_PRESETS = [
  { value: '1个月', label: '1 个月', hint: null },
  { value: '3个月', label: '3 个月', hint: null },
  { value: '6个月', label: '6 个月', hint: null },
  { value: '12个月', label: '12 个月', hint: null },
];

const route = useRoute();
const router = useRouter();
const user = currentUser;
const skus = ref([]);
const step = ref(1);
const err = ref('');
const submitting = ref(false);
const prices = ref([]);
const durationChoice = ref('');
const customDuration = ref('');
const draftHydrated = ref(false);

const form = reactive({
  sku_id: '',
  quantity: 1,
  duration: '',
  delivery_date: '',
  budget_range: '',
  note: '',
  name: user.value?.name || '',
  company_name: user.value?.company_name || '',
});

function localDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const selectedSku = computed(() => skus.value.find((s) => s.id === Number(form.sku_id)));

const durationPresets = computed(() => {
  const unit = selectedSku.value?.unit;
  if (!unit) return FALLBACK_PRESETS;
  return DURATION_PRESETS[unit] || FALLBACK_PRESETS;
});

const quantityHint = computed(() => {
  const unit = selectedSku.value?.unit;
  if (!unit) return '份';
  if (unit === '小时') return '卡时数量（卡数×小时 由报价沟通）';
  if (unit === '月') return '卡数 / 实例数';
  if (unit === '百万token') return '百万 token';
  return unit;
});

function syncDurationFromChoice() {
  if (durationChoice.value === CUSTOM_DURATION) {
    form.duration = customDuration.value.trim();
  } else {
    form.duration = durationChoice.value;
  }
}

function applyDurationFromFormValue(value) {
  if (!value) {
    durationChoice.value = durationPresets.value[0]?.value || '';
    customDuration.value = '';
    syncDurationFromChoice();
    return;
  }
  const hit = durationPresets.value.find((p) => p.value === value);
  if (hit) {
    durationChoice.value = hit.value;
    customDuration.value = '';
  } else {
    durationChoice.value = CUSTOM_DURATION;
    customDuration.value = value;
  }
  syncDurationFromChoice();
}

function applyDemandDefaults({ force = false } = {}) {
  if (force || !form.quantity || Number(form.quantity) <= 0) {
    form.quantity = 1;
  }
  if (force || !form.delivery_date) {
    form.delivery_date = localDatePlusDays(7);
  }
  if (force || !form.duration) {
    applyDurationFromFormValue(durationPresets.value[0]?.value || '');
  } else {
    applyDurationFromFormValue(form.duration);
  }
}

onMounted(async () => {
  const [skuRes, priceRes] = await Promise.all([api('/customer/skus'), api('/customer/reference-prices')]);
  skus.value = skuRes.data || [];
  prices.value = priceRes.data || [];

  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Object.assign(form, parsed);
    } catch {
      /* ignore */
    }
  }

  const pref = Number(route.query.sku_id);
  if (pref && skus.value.some((s) => s.id === pref)) form.sku_id = pref;
  else if (!form.sku_id && skus.value.length) form.sku_id = skus.value[0].id;

  form.name = form.name || user.value?.name || '';
  form.company_name = form.company_name || user.value?.company_name || '';

  applyDemandDefaults();
  draftHydrated.value = true;
});

watch(
  () => form.sku_id,
  () => {
    if (!draftHydrated.value) return;
    // 切换 SKU 后档位可能不匹配，回到该单位默认时长
    const stillValid = durationPresets.value.some((p) => p.value === form.duration);
    if (!stillValid) {
      applyDurationFromFormValue(durationPresets.value[0]?.value || '');
    } else {
      applyDurationFromFormValue(form.duration);
    }
  },
);

watch([durationChoice, customDuration], () => {
  if (!draftHydrated.value) return;
  syncDurationFromChoice();
});

watch(
  form,
  () => {
    if (!draftHydrated.value) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form }));
  },
  { deep: true },
);

const selectedPrice = computed(() => prices.value.find((p) => p.sku_id === Number(form.sku_id)));
const estimate = computed(() => {
  const mid = selectedPrice.value?.price_mid;
  const q = Number(form.quantity);
  if (!mid || !q) return null;
  return mid * q;
});

function next() {
  err.value = '';
  if (!form.sku_id || !form.quantity) {
    err.value = '请选择 SKU 并填写数量';
    return;
  }
  if (!form.duration) {
    err.value = '请选择租用时长';
    return;
  }
  if (durationChoice.value === CUSTOM_DURATION && !customDuration.value.trim()) {
    err.value = '请填写自定义时长';
    return;
  }
  step.value = 2;
}

async function submit() {
  err.value = '';
  if (!form.name || !form.company_name) {
    err.value = '请填写姓名与公司名称';
    return;
  }
  submitting.value = true;
  try {
    await api('/customer/rfqs', {
      method: 'POST',
      body: {
        ...form,
        sku_id: Number(form.sku_id),
        quantity: Number(form.quantity),
        submit_page: route.query.from || 'rfq',
      },
    });
    localStorage.removeItem(DRAFT_KEY);
    router.replace('/rfq/success');
  } catch (e) {
    err.value = e.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="page-title">提交询价</h1>
    <p class="page-desc">两步完成。参考价仅供对照，成交以正式报价为准。</p>

    <div class="mt-4 flex gap-2 text-xs font-mono uppercase tracking-wider text-slate-500">
      <span :class="step === 1 ? 'text-amber-500' : ''">01 需求</span>
      <span>/</span>
      <span :class="step === 2 ? 'text-amber-500' : ''">02 联系</span>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-3">
      <form class="panel space-y-5 p-5 lg:col-span-2" @submit.prevent="step === 1 ? next() : submit()">
        <template v-if="step === 1">
          <label class="field-label">
            SKU
            <select v-model="form.sku_id" class="mt-1.5 w-full font-mono">
              <option v-for="s in skus" :key="s.id" :value="s.id">{{ s.name }}（{{ s.unit }}）</option>
            </select>
          </label>

          <label class="field-label">
            数量
            <span class="ml-2 font-normal normal-case tracking-normal text-slate-500">{{ quantityHint }}</span>
            <input
              v-model.number="form.quantity"
              type="number"
              min="1"
              step="1"
              required
              class="mt-1.5 w-full mono-num"
            />
          </label>

          <div>
            <p class="field-label">租用时长</p>
            <p class="mt-1 text-xs text-slate-500">按 SKU 计价单位给出常用档位，避免手写含糊描述。</p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                v-for="p in durationPresets"
                :key="p.value"
                type="button"
                class="duration-chip text-left"
                :class="durationChoice === p.value ? 'duration-chip-active' : ''"
                @click="durationChoice = p.value"
              >
                <span class="block font-medium text-slate-100">{{ p.label }}</span>
                <span v-if="p.hint" class="mt-0.5 block font-mono text-xs text-slate-500">{{ p.hint }}</span>
              </button>
              <button
                type="button"
                class="duration-chip text-left"
                :class="durationChoice === CUSTOM_DURATION ? 'duration-chip-active' : ''"
                @click="durationChoice = CUSTOM_DURATION"
              >
                <span class="block font-medium text-slate-100">其他</span>
                <span class="mt-0.5 block text-xs text-slate-500">特殊周期再手填</span>
              </button>
            </div>
            <input
              v-if="durationChoice === CUSTOM_DURATION"
              v-model="customDuration"
              class="mt-3 w-full"
              placeholder="例如：45 天、到项目上线日"
              maxlength="50"
            />
          </div>

          <label class="field-label">
            期望交付日期
            <span class="ml-2 font-normal normal-case tracking-normal text-slate-500">默认 7 天后，可改</span>
            <input
              v-model="form.delivery_date"
              type="date"
              :min="localDatePlusDays(0)"
              class="mt-1.5 w-full font-mono"
            />
          </label>

          <p v-if="err" class="text-sm text-red-400">{{ err }}</p>
          <button type="submit" class="btn-primary">下一步</button>
        </template>
        <template v-else>
          <label class="field-label">
            姓名
            <input v-model="form.name" required class="mt-1.5 w-full" />
          </label>
          <label class="field-label">
            手机号
            <input :value="user?.phone || ''" disabled class="mt-1.5 w-full font-mono" />
          </label>
          <label class="field-label">
            公司名称
            <input v-model="form.company_name" required class="mt-1.5 w-full" />
          </label>
          <label class="field-label">
            预算区间（选填）
            <select v-model="form.budget_range" class="mt-1.5 w-full">
              <option value="">暂不确定</option>
              <option value="5万以内">5 万以内</option>
              <option value="5-20万">5–20 万</option>
              <option value="20-50万">20–50 万</option>
              <option value="50万以上">50 万以上</option>
            </select>
          </label>
          <label class="field-label">
            备注
            <textarea v-model="form.note" rows="3" class="mt-1.5 w-full" placeholder="集群规模、地域、合规等补充" />
          </label>
          <p v-if="err" class="text-sm text-red-400">{{ err }}</p>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary" @click="step = 1">上一步</button>
            <button type="submit" class="btn-primary" :disabled="submitting">
              {{ submitting ? '提交中…' : '提交询价' }}
            </button>
          </div>
        </template>
      </form>

      <aside class="panel h-fit p-5 text-sm">
        <p class="field-label">参考估价（非承诺）</p>
        <p class="mono-num mt-3 text-2xl text-amber-500">
          {{ estimate == null ? '—' : estimate.toLocaleString('zh-CN') }}
        </p>
        <p class="mt-2 text-xs text-slate-500">
          中位 {{ selectedPrice?.price_mid ?? '—' }} × 数量 {{ form.quantity || '—' }}
        </p>
        <dl class="mt-4 space-y-2 border-t border-slate-700 pt-4 text-xs text-slate-400">
          <div class="flex justify-between gap-3">
            <dt>SKU</dt>
            <dd class="font-mono text-slate-300">{{ selectedSku?.name || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>时长</dt>
            <dd class="text-right text-slate-300">{{ form.duration || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>期望交付</dt>
            <dd class="font-mono text-slate-300">{{ form.delivery_date || '—' }}</dd>
          </div>
        </dl>
        <p class="mt-4 text-xs leading-relaxed text-slate-500">
          草稿已自动保存在本机。刷新页面可继续填写。
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.duration-chip {
  border: 1px solid var(--border);
  background: #0f172a;
  border-radius: 2px;
  padding: 0.75rem 0.875rem;
  transition: border-color 0.15s, background 0.15s;
}
.duration-chip:hover {
  border-color: #64748b;
}
.duration-chip-active {
  border-color: var(--accent);
  background: rgba(245, 158, 11, 0.08);
  box-shadow: inset 0 0 0 1px var(--accent);
}
</style>

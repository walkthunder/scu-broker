<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, getUser } from '../api';

const router = useRouter();
const indices = ref([]);
const skus = ref([]);
const selected = ref(null);
const prints = ref([]);
const createVisible = ref(false);
const form = reactive({ code: '', name: '', sku_id: null, jump_threshold_pct: 20 });
const printForm = reactive({
  date: new Date().toISOString().slice(0, 10),
  settle_price: null,
});
const isAdmin = computed(() => getUser()?.role === 'admin');
const codeTouched = ref(false);
const nameTouched = ref(false);
const leftTableRef = ref(null);
const busy = ref(false);

const STATUS_LABEL = {
  draft: '草稿',
  pending_review: '待复核',
  published: '已发布',
};
const SOURCE_LABEL = {
  price_mid: '参考价中位',
  manual: '人工覆写',
};

async function loadIndices({ keepSelection = true } = {}) {
  try {
    const prevId = keepSelection ? selected.value?.id : null;
    indices.value = (await api('/admin/indices')).data || [];
    const pick =
      (prevId && indices.value.find((i) => i.id === prevId)) || indices.value[0] || null;
    if (pick) await selectIndex(pick);
    else {
      selected.value = null;
      prints.value = [];
    }
  } catch (e) {
    ElMessage.error(e.message || '加载指数失败');
  }
}

async function loadSkus() {
  try {
    skus.value = (await api('/admin/skus')).data || [];
  } catch (e) {
    ElMessage.error(e.message || '加载 SKU 失败');
  }
}

async function selectIndex(row) {
  if (!row) return;
  selected.value = row;
  try {
    prints.value = (await api(`/admin/indices/${row.id}/prints`)).data || [];
  } catch (e) {
    prints.value = [];
    ElMessage.error(e.message || '加载结算价失败');
  }
  await nextTick();
  leftTableRef.value?.setCurrentRow?.(row);
}

onMounted(async () => {
  await loadSkus();
  await loadIndices({ keepSelection: false });
});

function openCreate() {
  const first = skus.value.find((s) => s.status === 'active') || skus.value[0];
  codeTouched.value = false;
  nameTouched.value = false;
  Object.assign(form, {
    code: first ? `${String(first.name).replace(/\s+/g, '').toUpperCase()}-M` : '',
    name: first ? `${first.name} 结算指数` : '',
    sku_id: first?.id || null,
    jump_threshold_pct: 20,
  });
  createVisible.value = true;
}

watch(
  () => form.sku_id,
  (id) => {
    if (!createVisible.value || !id) return;
    const s = skus.value.find((x) => x.id === id);
    if (!s) return;
    const base = String(s.name).replace(/\s+/g, '').toUpperCase();
    if (!codeTouched.value) form.code = `${base}-M`;
    if (!nameTouched.value) form.name = `${s.name} 结算指数`;
  },
);

async function createIndex() {
  if (!form.code?.trim() || !form.name?.trim() || !form.sku_id) {
    ElMessage.warning('请填写代码、名称并选择锚定 SKU');
    return;
  }
  try {
    const created = (await api('/admin/indices', { method: 'POST', body: { ...form } })).data;
    ElMessage.success('已创建指数');
    createVisible.value = false;
    await loadIndices({ keepSelection: false });
    if (created?.id) {
      const row = indices.value.find((i) => i.id === created.id);
      if (row) await selectIndex(row);
    }
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function generateFromMid() {
  if (!selected.value) return;
  busy.value = true;
  try {
    await api(`/admin/indices/${selected.value.id}/prints`, {
      method: 'POST',
      body: { date: printForm.date || undefined },
    });
    ElMessage.success('已从参考价中位生成草稿，请确认后发布');
    printForm.settle_price = null;
    await selectIndex(selected.value);
    await loadIndices();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    busy.value = false;
  }
}

async function overridePrice() {
  if (!selected.value) return;
  if (!(Number(printForm.settle_price) > 0)) {
    ElMessage.warning('请填写大于 0 的结算价');
    return;
  }
  busy.value = true;
  try {
    await api(`/admin/indices/${selected.value.id}/prints`, {
      method: 'POST',
      body: { date: printForm.date || undefined, settle_price: printForm.settle_price },
    });
    ElMessage.success('已写入人工价格（草稿/待复核），请发布后生效');
    printForm.settle_price = null;
    await selectIndex(selected.value);
    await loadIndices();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    busy.value = false;
  }
}

async function publish(row) {
  try {
    await ElMessageBox.confirm(
      `确认发布 ${selected.value.code} 在 ${row.date} 的结算价 S=${row.settle_price}？发布后可用于远期盯市与结算。`,
      '发布结算价',
    );
    await api(`/admin/indices/${selected.value.id}/prints/${row.date}/publish`, { method: 'POST' });
    ElMessage.success('已发布');
    await selectIndex(selected.value);
    await loadIndices();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e.message || '操作失败');
  }
}

async function unpublish(row) {
  try {
    await ElMessageBox.confirm(
      `撤销 ${row.date} 的已发布状态？未用于结算时可撤销；已写入账单则不可撤销。`,
      '撤销发布',
      { type: 'warning' },
    );
    await api(`/admin/indices/${selected.value.id}/prints/${row.date}/unpublish`, {
      method: 'POST',
    });
    ElMessage.success('已撤销为草稿');
    await selectIndex(selected.value);
    await loadIndices();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e.message || '操作失败');
  }
}

function goRefPrices() {
  router.push('/prices');
}

function statusLabel(s) {
  return STATUS_LABEL[s] || s;
}
function sourceLabel(s) {
  return SOURCE_LABEL[s] || s;
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px">
      <div>
        <h2>价格指数</h2>
        <p class="page-desc">
          每个指数锚定一个 SKU，按日发布结算价 <b>S</b>。远期开仓/盯市/到期结算都依赖「已发布」的 S。
          日常：先录参考价 → 本页「从参考价生成」→「发布」。
        </p>
      </div>
      <div style="display: flex; gap: 8px; flex-shrink: 0">
        <el-button @click="goRefPrices">去录参考价</el-button>
        <el-button v-if="isAdmin" type="primary" @click="openCreate">新建指数</el-button>
      </div>
    </div>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="9">
        <el-table
          ref="leftTableRef"
          :data="indices"
          highlight-current-row
          row-key="id"
          height="560"
          @current-change="(r) => r && selectIndex(r)"
        >
          <el-table-column prop="code" label="代码" width="96" />
          <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
          <el-table-column label="锚定 SKU" width="100" show-overflow-tooltip>
            <template #default="{ row }">{{ row.sku?.name || '—' }}</template>
          </el-table-column>
          <el-table-column label="最新已发布 S" min-width="110">
            <template #default="{ row }">
              <template v-if="row.latest_published">
                <span class="stat-value" style="font-size: 14px">{{
                  row.latest_published.settle_price
                }}</span>
                <div class="page-desc" style="margin: 0">{{ row.latest_published.date }}</div>
              </template>
              <span v-else class="page-desc">未发布</span>
            </template>
          </el-table-column>
        </el-table>
      </el-col>

      <el-col :span="15">
        <template v-if="selected">
          <div class="page-head" style="margin-bottom: 12px">
            <h2 style="font-size: 16px; margin: 0">
              {{ selected.code }} · {{ selected.name }}
            </h2>
            <p class="page-desc">
              锚定 {{ selected.sku?.name || '—' }}（{{ selected.sku?.unit || '—' }}）· 跳变阈值
              ±{{ Number(selected.jump_threshold_pct) }}%
              <template v-if="selected.latest_published">
                · 当前已发布 S=<b>{{ selected.latest_published.settle_price }}</b>
                （{{ selected.latest_published.date }}）
              </template>
            </p>
          </div>

          <el-card class="stat-card" shadow="never" style="margin-bottom: 14px">
            <div class="stat-label" style="margin-bottom: 10px">写入某日结算价（写入后需点「发布」才对客生效）</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
              <el-date-picker
                v-model="printForm.date"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="日期（默认今日）"
              />
              <el-button type="primary" :loading="busy" @click="generateFromMid">
                从参考价中位生成
              </el-button>
              <el-input-number
                v-model="printForm.settle_price"
                :min="0.01"
                :precision="2"
                placeholder="人工价"
                controls-position="right"
              />
              <el-button type="warning" :loading="busy" @click="overridePrice">人工覆写</el-button>
            </div>
            <p class="page-desc" style="margin-top: 10px; margin-bottom: 0">
              「从参考价中位生成」= 取该 SKU 当日参考价的<strong>中间价</strong>作为 S。若提示无参考价，请先点右上角「去录参考价」。
            </p>
          </el-card>

          <el-table :data="prints" empty-text="暂无日结算价，请先生成或覆写">
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column label="结算价 S" width="120">
              <template #default="{ row }">
                <span style="font-family: 'IBM Plex Mono', monospace">{{ row.settle_price }}</span>
              </template>
            </el-table-column>
            <el-table-column label="来源" width="110">
              <template #default="{ row }">{{ sourceLabel(row.source) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="
                    row.status === 'published'
                      ? 'success'
                      : row.status === 'pending_review'
                        ? 'warning'
                        : 'info'
                  "
                >
                  {{ statusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="160">
              <template #default="{ row }">
                <el-button
                  v-if="row.status !== 'published'"
                  link
                  type="primary"
                  @click="publish(row)"
                >
                  {{ row.status === 'pending_review' ? '复核并发布' : '发布' }}
                </el-button>
                <el-button v-else link type="danger" @click="unpublish(row)">撤销发布</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
        <el-empty v-else description="请从左侧选择一个指数" />
      </el-col>
    </el-row>

    <el-dialog v-model="createVisible" title="新建指数" width="480px" destroy-on-close>
      <p class="page-desc" style="margin: 0 0 12px">
        指数 = 对某个 SKU 的「官方日结算价」容器。选 SKU 后自动生成代码/名称，可改。
      </p>
      <el-form label-width="100px">
        <el-form-item label="锚定 SKU" required>
          <el-select v-model="form.sku_id" filterable style="width: 100%">
            <el-option v-for="s in skus" :key="s.id" :label="`${s.name}（${s.unit}）`" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="代码" required>
          <el-input v-model="form.code" placeholder="H100-M" @input="codeTouched = true" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" @input="nameTouched = true" />
        </el-form-item>
        <el-form-item label="跳变阈值%">
          <el-input-number v-model="form.jump_threshold_pct" :min="1" :max="100" />
          <span class="page-desc" style="margin-left: 8px">相对上次已发布 S 超此幅度需复核</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="createIndex">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

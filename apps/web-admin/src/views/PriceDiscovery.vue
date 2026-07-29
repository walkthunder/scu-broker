<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api, getToken } from '../api';

const regions = ref([]);
const deals = ref([]);
const bulletins = ref([]);
const config = ref({});
const curve = ref(null);
const form = reactive({
  sku_id: null,
  region: 'shanghai',
  qty: 1,
  unit_price: 0,
  deal_status: 'filled',
});
const curveQ = reactive({
  sku_id: null,
  region: 'shanghai',
  kind: 'spot',
  granularity: 'day',
});
const configEdit = reactive({});
const csvText = ref('');
const skus = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    regions.value = (await api('/frd/meta/regions')).data || [];
    skus.value = (await api('/admin/skus')).data || [];
    deals.value = (await api('/frd/channel-deals')).data || [];
    bulletins.value = (await api('/frd/price-bulletins')).data || [];
    config.value = (await api('/frd/platform-config')).data || {};
    Object.assign(configEdit, config.value);
    if (!form.sku_id && skus.value[0]) form.sku_id = skus.value[0].id;
    if (!curveQ.sku_id && skus.value[0]) curveQ.sku_id = skus.value[0].id;
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

async function addDeal() {
  try {
    await api('/frd/channel-deals', { method: 'POST', body: form });
    ElMessage.success('已录入');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function importCsv() {
  try {
    const out = await api('/frd/channel-deals/import', {
      method: 'POST',
      body: { csv: csvText.value },
    });
    ElMessage.success(`导入 ${out.data?.length || 0} 条`);
    csvText.value = '';
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function voidDeal(row) {
  try {
    const reason = window.prompt('作废原因', '录入错误') || '作废';
    await api(`/frd/channel-deals/${row.id}/void`, { method: 'POST', body: { reason } });
    ElMessage.success('已作废');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function confirmDeal(row) {
  try {
    await api(`/frd/channel-deals/${row.id}/confirm`, { method: 'POST', body: {} });
    ElMessage.success('已确认计入指数');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function uploadVoucher(row, ev) {
  const file = ev.target?.files?.[0];
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const base = import.meta.env.VITE_API_BASE || '/api';
    const res = await fetch(`${base}/frd/channel-deals/${row.id}/voucher`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const json = await res.json();
    if (!res.ok || json.code !== 0) throw new Error(json.message || '上传失败');
    ElMessage.success('凭证已上传');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    ev.target.value = '';
  }
}

async function saveConfig() {
  try {
    for (const [key, value] of Object.entries(configEdit)) {
      if (String(config.value[key] ?? '') === String(value ?? '')) continue;
      await api(`/frd/platform-config/${key}`, { method: 'PUT', body: { value } });
    }
    ElMessage.success('参数已保存');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function loadCurve() {
  try {
    const q = new URLSearchParams({
      sku_id: String(curveQ.sku_id),
      region: curveQ.region,
      kind: curveQ.kind,
      granularity: curveQ.granularity,
    });
    curve.value = (await api(`/frd/curves?${q}`)).data;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function runEngine() {
  try {
    await api('/frd/index-engine/run', { method: 'POST', body: {} });
    ElMessage.success('测算完成');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function submitBulletin() {
  try {
    await api('/frd/price-bulletins/submit', { method: 'POST', body: {} });
    ElMessage.success('已提交复核');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function publish(date) {
  try {
    await api(`/frd/price-bulletins/${date}/publish`, { method: 'POST' });
    ElMessage.success('已发布');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-head">
      <h2>价格发现（FRD）</h2>
      <p class="page-desc">渠道成交采集 → 指数测算 → 双人复核发布 · 曲线日/周/月</p>
    </div>
    <el-row :gutter="16">
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>录入渠道成交</template>
          <el-form label-width="90px">
            <el-form-item label="SKU">
              <el-select v-model="form.sku_id" filterable style="width: 100%">
                <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="区域">
              <el-select v-model="form.region">
                <el-option v-for="r in regions" :key="r.code" :label="r.name" :value="r.code" />
              </el-select>
            </el-form-item>
            <el-form-item label="数量"><el-input-number v-model="form.qty" :min="0.01" /></el-form-item>
            <el-form-item label="单价"><el-input-number v-model="form.unit_price" :min="0" :precision="2" /></el-form-item>
            <el-button type="primary" @click="addDeal">提交</el-button>
          </el-form>
        </el-card>
        <el-card shadow="never" style="margin-top: 16px">
          <template #header>CSV 批量导入</template>
          <p style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 8px">
            表头：sku_id,region,qty,unit_price,deal_status,note
          </p>
          <el-input v-model="csvText" type="textarea" :rows="4" placeholder="粘贴 CSV…" />
          <el-button style="margin-top: 8px" type="primary" plain @click="importCsv">导入</el-button>
        </el-card>
        <el-card shadow="never" style="margin-top: 16px">
          <template #header>平台参数</template>
          <el-form label-width="140px" size="small">
            <el-form-item v-for="(v, k) in configEdit" :key="k" :label="k">
              <el-input v-model="configEdit[k]" />
            </el-form-item>
            <el-button type="primary" @click="saveConfig">保存参数</el-button>
          </el-form>
        </el-card>
        <el-card shadow="never" style="margin-top: 16px">
          <template #header>发布作业</template>
          <el-button @click="runEngine">运行测算引擎</el-button>
          <el-button @click="submitBulletin">提交双人复核</el-button>
          <p style="margin-top: 12px; color: var(--el-text-color-secondary); font-size: 12px">
            双人复核：提交人与「复核发布」须为<strong>不同账号</strong>（测算人 ≠ 复核人）。
          </p>
        </el-card>
      </el-col>
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>最近成交样本</template>
          <el-table :data="deals.slice(0, 40)" size="small" v-loading="loading">
            <el-table-column prop="id" width="60" label="ID" />
            <el-table-column label="SKU" width="100">
              <template #default="{ row }">{{ row.sku?.name }}</template>
            </el-table-column>
            <el-table-column prop="region" width="90" />
            <el-table-column prop="unit_price" label="单价" />
            <el-table-column prop="qty" label="量" width="70" />
            <el-table-column prop="deal_status" width="90" />
            <el-table-column label="操作" width="240">
              <template #default="{ row }">
                <template v-if="!row.voided_at">
                  <el-button
                    v-if="row.deal_status !== 'filled'"
                    link
                    type="success"
                    @click="confirmDeal(row)"
                  >
                    确认成交
                  </el-button>
                  <el-button link type="danger" @click="voidDeal(row)">作废</el-button>
                  <label class="el-button el-button--primary is-link" style="cursor: pointer">
                    凭证
                    <input type="file" accept="image/*,.pdf" hidden @change="uploadVoucher(row, $event)" />
                  </label>
                </template>
                <span v-else style="color: var(--el-text-color-secondary)">已作废</span>
                <span v-if="row.voucher_path" style="margin-left: 6px; font-size: 12px">📎</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card shadow="never" style="margin-top: 16px">
          <template #header>价格曲线</template>
          <el-form inline size="small">
            <el-form-item label="SKU">
              <el-select v-model="curveQ.sku_id" style="width: 140px">
                <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="区域">
              <el-select v-model="curveQ.region" style="width: 110px">
                <el-option v-for="r in regions" :key="r.code" :label="r.name" :value="r.code" />
              </el-select>
            </el-form-item>
            <el-form-item label="粒度">
              <el-select v-model="curveQ.granularity" style="width: 100px">
                <el-option label="日" value="day" />
                <el-option label="周" value="week" />
                <el-option label="月" value="month" />
              </el-select>
            </el-form-item>
            <el-button type="primary" @click="loadCurve">查询</el-button>
          </el-form>
          <el-table
            v-if="Array.isArray(curve) && curve.length"
            :data="curve.slice(-30)"
            size="small"
          >
            <el-table-column prop="date" label="日期/区间" />
            <el-table-column label="价">
              <template #default="{ row }">{{ row.settle ?? row.price ?? row.premium }}</template>
            </el-table-column>
            <el-table-column prop="sample_count" label="样本" width="80" />
          </el-table>
          <p v-else style="color: var(--el-text-color-secondary); font-size: 12px">选择条件后查询</p>
        </el-card>
        <el-card shadow="never" style="margin-top: 16px">
          <template #header>价格公告</template>
          <el-table :data="bulletins" size="small">
            <el-table-column prop="date" width="120" />
            <el-table-column prop="status" width="120" />
            <el-table-column label="权益参考" width="100">
              <template #default="{ row }">
                {{ row.payload?.rights_ref?.length || 0 }}
              </template>
            </el-table-column>
            <el-table-column label="操作">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'pending_review'"
                  link
                  type="primary"
                  @click="publish(row.date)"
                >
                  复核发布
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

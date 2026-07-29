<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const status = ref('');
const list = ref([]);
const brokers = ref([]);
const suppliers = ref([]);
const drawer = ref(false);
const current = ref(null);
const quoteForm = reactive({
  supplier_id: null,
  price: null,
  delivery_date: '',
  note: '',
});
const assignId = ref(null);
const fileInput = ref(null);

async function load() {
  const q = status.value ? `?status=${status.value}` : '';
  list.value = (await api(`/admin/rfqs${q}`)).data;
}

onMounted(async () => {
  brokers.value = (await api('/admin/brokers')).data;
  suppliers.value = (await api('/admin/suppliers')).data;
  await load();
});

function open(row) {
  current.value = row;
  assignId.value = row.broker_id;
  quoteForm.supplier_id = row.quote?.supplier_id || suppliers.value[0]?.id;
  quoteForm.price = row.quote ? Number(row.quote.price) : null;
  quoteForm.delivery_date =
    row.quote?.delivery_date || row.delivery_date || '';
  quoteForm.note = row.quote?.note || '';
  drawer.value = true;
}

async function assign() {
  try {
    await api(`/admin/rfqs/${current.value.id}/assign`, {
      method: 'PUT',
      body: { broker_id: assignId.value },
    });
    ElMessage.success('已分配');
    await load();
    current.value = list.value.find((r) => r.id === current.value.id);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function saveQuote() {
  if (!quoteForm.supplier_id) throw new Error('请选择供应商');
  if (!(Number(quoteForm.price) > 0)) throw new Error('成交价须大于 0');
  if (!quoteForm.delivery_date) throw new Error('请选择交付日期');
  const res = await api('/admin/quotes', {
    method: 'POST',
    body: { rfq_id: current.value.id, ...quoteForm, price: Number(quoteForm.price) },
  });
  current.value = { ...current.value, quote: res.data };
  await load();
  const refreshed = list.value.find((r) => r.id === current.value.id);
  if (refreshed) current.value = refreshed;
  return res.data;
}

async function sendQuote() {
  try {
    let qid = current.value.quote?.id;
    if (!qid) {
      const draft = await saveQuote();
      qid = draft.id;
      ElMessage.success('报价已保存');
    } else if (current.value.quote?.status === 'draft' || !current.value.quote?.status) {
      await saveQuote();
      qid = current.value.quote?.id || qid;
    }
    if (!qid) throw new Error('请先保存报价');
    await api(`/admin/quotes/${qid}/send`, { method: 'PUT' });
    ElMessage.success('已发送给客户');
    await load();
    const row = list.value.find((r) => r.id === current.value.id);
    if (row) open(row);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function saveQuoteOnly() {
  try {
    await saveQuote();
    ElMessage.success('报价已保存（草稿）');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function uploadFile(ev) {
  const file = ev.target.files?.[0];
  if (!file || !current.value.quote?.id) {
    ElMessage.warning('请先保存报价再上传附件');
    return;
  }
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api(`/admin/quotes/${current.value.quote.id}/attachments`, { method: 'POST', body: fd });
    ElMessage.success('附件已上传');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

const tags = [
  { label: '全部', value: '' },
  { label: '待处理', value: 'pending' },
  { label: '已报价', value: 'quoted' },
  { label: '已确认', value: 'confirmed' },
  { label: '已拒绝', value: 'rejected' },
];
const statusLabel = {
  pending: '待处理',
  quoted: '已报价',
  confirmed: '已确认',
  rejected: '已拒绝',
  cancelled: '已取消',
};
</script>

<template>
  <div>
    <h2>询价管理</h2>
    <p class="page-desc">点行打开详情；报价须填成交价与交付日，默认带出客户期望交付日。</p>
    <div style="margin: 12px 0; display: flex; gap: 8px">
      <el-tag
        v-for="t in tags"
        :key="t.value"
        :type="status === t.value ? 'primary' : 'info'"
        style="cursor: pointer"
        @click="status = t.value; load()"
      >
        {{ t.label }}
      </el-tag>
    </div>
    <el-table :data="list" @row-click="open" style="cursor: pointer">
      <el-table-column prop="id" label="询价号" width="90" />
      <el-table-column label="客户公司" :formatter="(row) => row.customer?.company_name || '-'" />
      <el-table-column label="SKU" :formatter="(row) => row.sku?.name" />
      <el-table-column prop="quantity" label="数量" width="90" />
      <el-table-column prop="created_at" label="提交时间" />
      <el-table-column label="Broker" :formatter="(row) => row.broker?.name || '-'" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">{{ statusLabel[row.status] || row.status }}</template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="drawer" title="询价详情" size="480px">
      <template v-if="current">
        <p>客户：{{ current.customer?.company_name }} / {{ current.customer?.name }}</p>
        <p>电话：{{ current.customer?.phone }}</p>
        <p>需求：{{ current.sku?.name }} × {{ current.quantity }}，时长 {{ current.duration || '—' }}</p>
        <p>期望交付：{{ current.delivery_date || '—' }}</p>
        <p>预算：{{ current.budget_range || '—' }}</p>
        <p>备注：{{ current.note || '—' }}</p>
        <el-divider />
        <div style="display: flex; gap: 8px; align-items: center">
          <span>分配 Broker</span>
          <el-select v-model="assignId" style="flex: 1">
            <el-option v-for="b in brokers" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
          <el-button @click="assign">分配</el-button>
        </div>
        <el-divider>录入报价</el-divider>
        <el-form label-width="90px">
          <el-form-item label="供应商" required>
            <el-select v-model="quoteForm.supplier_id" style="width: 100%">
              <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="成交价" required>
            <el-input-number
              v-model="quoteForm.price"
              :min="0.01"
              :precision="2"
              style="width: 100%"
              placeholder="须大于 0"
            />
          </el-form-item>
          <el-form-item label="交付日期" required>
            <el-date-picker
              v-model="quoteForm.delivery_date"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="quoteForm.note" type="textarea" placeholder="可选" />
          </el-form-item>
        </el-form>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <el-button @click="saveQuoteOnly">保存报价</el-button>
          <el-button type="primary" @click="sendQuote">发送报价</el-button>
          <el-button @click="fileInput?.click()">上传附件</el-button>
          <input ref="fileInput" type="file" hidden @change="uploadFile" />
        </div>
      </template>
    </el-drawer>
  </div>
</template>

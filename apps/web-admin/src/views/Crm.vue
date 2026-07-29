<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const leads = ref([]);
const noteDraft = ref({});
const form = ref({
  company_name: '',
  contact_name: '',
  phone: '',
  source: 'sales',
  stage: 'lead',
  intent_sku: 'H100',
  intent_region: 'shanghai',
  note: '',
});

const STAGES = [
  { value: 'lead', label: '线索' },
  { value: 'qualified', label: '合格' },
  { value: 'negotiating', label: '洽谈' },
  { value: 'won', label: '成交' },
  { value: 'lost', label: '丢失' },
];

async function load() {
  leads.value = (await api('/frd/crm/leads')).data || [];
}

async function create() {
  try {
    await api('/frd/crm/leads', { method: 'POST', body: form.value });
    ElMessage.success('已创建');
    form.value.company_name = '';
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function setStage(row, stage) {
  try {
    await api(`/frd/crm/leads/${row.id}`, { method: 'PUT', body: { stage } });
    ElMessage.success('阶段已更新');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function addNote(row) {
  const content = (noteDraft.value[row.id] || '').trim();
  if (!content) return;
  try {
    await api(`/frd/crm/leads/${row.id}/notes`, { method: 'POST', body: { content } });
    noteDraft.value[row.id] = '';
    ElMessage.success('笔记已添加');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function markWon(row) {
  try {
    const userId = window.prompt('关联客户用户 ID（users.id，可空）', row.user_id || '');
    const body = { stage: 'won' };
    if (userId && String(userId).trim()) body.user_id = Number(userId);
    await api(`/frd/crm/leads/${row.id}`, { method: 'PUT', body });
    ElMessage.success('已标记成交');
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
      <h2>销售 CRM</h2>
      <p class="page-desc">客户来源、漏斗阶段与跟进笔记</p>
    </div>
    <el-card shadow="never" style="margin-bottom: 16px">
      <el-form inline>
        <el-form-item label="公司"><el-input v-model="form.company_name" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contact_name" /></el-form-item>
        <el-form-item label="来源">
          <el-select v-model="form.source">
            <el-option label="朋友" value="friend" />
            <el-option label="伙伴" value="partner" />
            <el-option label="销售" value="sales" />
            <el-option label="活动" value="event" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-button type="primary" @click="create">新建线索</el-button>
      </el-form>
    </el-card>
    <el-table :data="leads" size="small">
      <el-table-column prop="id" width="60" />
      <el-table-column prop="company_name" label="公司" min-width="120" />
      <el-table-column prop="source" width="90" />
      <el-table-column label="阶段" width="140">
        <template #default="{ row }">
          <el-select :model-value="row.stage" size="small" @change="(v) => setStage(row, v)">
            <el-option v-for="s in STAGES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column prop="intent_sku" label="意向" width="90" />
      <el-table-column label="客户" width="80">
        <template #default="{ row }">{{ row.user_id || '—' }}</template>
      </el-table-column>
      <el-table-column prop="note" label="备注" min-width="100" />
      <el-table-column label="跟进笔记" min-width="220">
        <template #default="{ row }">
          <div v-for="n in (row.notes || []).slice(-3)" :key="n.id" style="font-size: 12px; color: #888">
            {{ n.content }}
          </div>
          <div style="display: flex; gap: 6px; margin-top: 4px">
            <el-input v-model="noteDraft[row.id]" size="small" placeholder="写笔记…" />
            <el-button size="small" @click="addNote(row)">添加</el-button>
            <el-button
              v-if="row.stage !== 'won'"
              size="small"
              type="success"
              plain
              @click="markWon(row)"
            >
              成交
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

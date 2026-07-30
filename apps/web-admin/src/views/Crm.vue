<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const leads = ref([]);
const regions = ref([]);
const noteDraft = ref({});

const emptyForm = () => ({
  company_name: '',
  contact_name: '',
  phone: '',
  source: 'sales',
  stage: 'lead',
  intent_sku: 'H100',
  intent_region: 'shanghai',
  intent_qty: '',
  note: '',
});

const form = ref(emptyForm());

const SOURCES = [
  { value: 'friend', label: '朋友推荐' },
  { value: 'partner', label: '合作伙伴' },
  { value: 'sales', label: '销售触达' },
  { value: 'event', label: '活动/展会' },
  { value: 'other', label: '其他' },
];

const STAGES = [
  { value: 'lead', label: '线索' },
  { value: 'qualified', label: '合格' },
  { value: 'negotiating', label: '洽谈' },
  { value: 'won', label: '成交' },
  { value: 'lost', label: '流失' },
];

const SKU_PRESETS = ['H100', 'H800', 'A100', 'A800', 'H100 包月', 'GPT Token', 'DeepSeek Token'];

function regionLabel(code) {
  return regions.value.find((r) => r.code === code)?.name || code || '—';
}

function recentNotes(row) {
  return (row.notes || []).slice(-3);
}

async function load() {
  try {
    const [leadRes, regionRes] = await Promise.all([
      api('/frd/crm/leads'),
      api('/frd/meta/regions'),
    ]);
    leads.value = leadRes.data || [];
    regions.value = regionRes.data || [];
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function create() {
  if (!form.value.company_name?.trim() && !form.value.contact_name?.trim()) {
    ElMessage.warning('请填写公司或联系人');
    return;
  }
  try {
    const body = { ...form.value };
    if (!body.intent_qty) delete body.intent_qty;
    if (!body.note) delete body.note;
    if (!body.phone) delete body.phone;
    await api('/frd/crm/leads', { method: 'POST', body });
    ElMessage.success('已创建');
    form.value = emptyForm();
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function patchLead(row, body) {
  try {
    await api(`/frd/crm/leads/${row.id}`, { method: 'PUT', body });
    ElMessage.success('已更新');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function setStage(row, stage) {
  await patchLead(row, { stage });
}

async function setSource(row, source) {
  await patchLead(row, { source });
}

async function addNote(row) {
  const content = (noteDraft.value[row.id] || '').trim();
  if (!content) {
    ElMessage.warning('请输入跟进笔记');
    return;
  }
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
        <el-form-item label="公司">
          <el-input v-model="form.company_name" placeholder="公司名称" style="width: 140px" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contact_name" placeholder="联系人" style="width: 100px" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" placeholder="手机/电话" style="width: 120px" />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="form.source" style="width: 120px">
            <el-option v-for="s in SOURCES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="阶段">
          <el-select v-model="form.stage" style="width: 100px">
            <el-option v-for="s in STAGES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="意向SKU">
          <el-select v-model="form.intent_sku" filterable allow-create style="width: 130px">
            <el-option v-for="n in SKU_PRESETS" :key="n" :label="n" :value="n" />
          </el-select>
        </el-form-item>
        <el-form-item label="区域">
          <el-select v-model="form.intent_region" style="width: 100px">
            <el-option v-for="r in regions" :key="r.code" :label="r.name" :value="r.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input v-model="form.intent_qty" placeholder="意向数量" style="width: 90px" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" placeholder="备注" style="width: 140px" />
        </el-form-item>
        <el-button type="primary" @click="create">新建线索</el-button>
      </el-form>
    </el-card>
    <el-table :data="leads" size="small">
      <el-table-column prop="id" width="60" />
      <el-table-column prop="company_name" label="公司" min-width="120" />
      <el-table-column prop="contact_name" label="联系人" width="90" />
      <el-table-column prop="phone" label="电话" width="110" />
      <el-table-column label="来源" width="130">
        <template #default="{ row }">
          <el-select :model-value="row.source" size="small" @change="(v) => setSource(row, v)">
            <el-option v-for="s in SOURCES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="阶段" width="130">
        <template #default="{ row }">
          <el-select :model-value="row.stage" size="small" @change="(v) => setStage(row, v)">
            <el-option v-for="s in STAGES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="意向" min-width="120">
        <template #default="{ row }">
          <span>{{ row.intent_sku || '—' }}</span>
          <span v-if="row.intent_region" style="color: #888; margin-left: 4px">
            · {{ regionLabel(row.intent_region) }}
          </span>
          <span v-if="row.intent_qty" style="color: #888; margin-left: 4px">×{{ row.intent_qty }}</span>
        </template>
      </el-table-column>
      <el-table-column label="客户" width="100">
        <template #default="{ row }">
          <span v-if="row.user">{{ row.user.name || row.user.company_name || row.user_id }}</span>
          <span v-else>{{ row.user_id || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="负责人" width="90">
        <template #default="{ row }">{{ row.owner?.name || row.owner_id || '—' }}</template>
      </el-table-column>
      <el-table-column prop="note" label="备注" min-width="100" show-overflow-tooltip />
      <el-table-column label="跟进笔记" min-width="260">
        <template #default="{ row }">
          <div v-if="!recentNotes(row).length" style="font-size: 12px; color: #bbb">暂无</div>
          <div
            v-for="n in recentNotes(row)"
            :key="n.id"
            style="font-size: 12px; color: #666; line-height: 1.4"
          >
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

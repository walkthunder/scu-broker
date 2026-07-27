<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const drawer = ref(false);
const current = ref(null);
const form = reactive({ status: '', note: '', penalty_amount: 0, penalty_note: '' });
const fileInput = ref(null);

const NEXT = {
  待签约: '待交付',
  待交付: '待验收',
  待验收: '待结算',
  待结算: '已完成',
};

async function load() {
  list.value = (await api('/admin/orders')).data;
}
onMounted(load);

function open(row) {
  current.value = row;
  form.status = NEXT[row.status] || row.status;
  form.note = '';
  form.penalty_amount = 0;
  form.penalty_note = '';
  drawer.value = true;
}

async function updateStatus() {
  try {
    await api(`/admin/orders/${current.value.id}/status`, {
      method: 'PUT',
      body: form,
    });
    ElMessage.success('状态已更新');
    await load();
    current.value = list.value.find((o) => o.id === current.value.id);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function uploadFile(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api(`/admin/orders/${current.value.id}/attachments`, { method: 'POST', body: fd });
    ElMessage.success('附件已上传');
  } catch (e) {
    ElMessage.error(e.message);
  }
}
</script>

<template>
  <div>
    <h2>订单管理</h2>
    <el-table :data="list" style="margin-top: 12px" @row-click="open">
      <el-table-column prop="id" label="订单号" width="90" />
      <el-table-column label="客户" :formatter="(_, __, row) => row.customer?.company_name || row.customer?.name" />
      <el-table-column label="供应商" :formatter="(_, __, row) => row.supplier?.name" />
      <el-table-column prop="price" label="成交价" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="open(row)">更新状态</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="drawer" title="订单详情" size="520px">
      <template v-if="current">
        <p>订单 #{{ current.id }} · {{ current.sku?.name }}</p>
        <p>当前状态：{{ current.status }}</p>
        <p>成交价：{{ Number(current.price).toLocaleString() }}</p>
        <el-divider>状态时间轴</el-divider>
        <el-timeline>
          <el-timeline-item
            v-for="log in current.logs || []"
            :key="log.id"
            :timestamp="log.created_at"
          >
            {{ log.from_status || '—'}} → {{ log.to_status }}
            <span v-if="log.note">（{{ log.note }}）</span>
            · {{ log.operator?.name }}
          </el-timeline-item>
        </el-timeline>
        <el-divider>更新状态</el-divider>
        <el-form label-width="90px">
          <el-form-item label="目标状态">
            <el-select v-model="form.status" style="width: 100%">
              <el-option v-if="NEXT[current.status]" :value="NEXT[current.status]" />
              <el-option value="已取消" />
              <el-option value="已赔付" />
            </el-select>
          </el-form-item>
          <el-form-item label="备注"><el-input v-model="form.note" type="textarea" /></el-form-item>
          <template v-if="form.status === '已赔付'">
            <el-form-item label="赔付金额">
              <el-input-number v-model="form.penalty_amount" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="赔付说明"><el-input v-model="form.penalty_note" /></el-form-item>
          </template>
        </el-form>
        <el-button type="primary" @click="updateStatus">提交变更</el-button>
        <el-button style="margin-left: 8px" @click="fileInput?.click()">上传附件</el-button>
        <input ref="fileInput" type="file" hidden @change="uploadFile" />
      </template>
    </el-drawer>
  </div>
</template>

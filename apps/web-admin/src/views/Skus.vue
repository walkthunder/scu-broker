<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const visible = ref(false);
const form = reactive({
  id: null,
  name: '',
  type: 'gpu',
  unit: '小时',
  spec: '',
  status: 'active',
  is_public: true,
  is_hot: false,
  sort_weight: 0,
  selling_point: '',
  delivery_note: '',
});

async function load() {
  list.value = (await api('/admin/skus')).data;
}

onMounted(load);

function open(row) {
  Object.assign(
    form,
    row
      ? {
          id: row.id,
          name: row.name,
          type: row.type,
          unit: row.unit,
          spec: row.spec || '',
          status: row.status,
          is_public: row.is_public !== false,
          is_hot: !!row.is_hot,
          sort_weight: row.sort_weight || 0,
          selling_point: row.selling_point || '',
          delivery_note: row.delivery_note || '',
        }
      : {
          id: null,
          name: '',
          type: 'gpu',
          unit: '小时',
          spec: '',
          status: 'active',
          is_public: true,
          is_hot: false,
          sort_weight: 0,
          selling_point: '',
          delivery_note: '',
        },
  );
  visible.value = true;
}

async function save() {
  try {
    if (form.id) await api(`/admin/skus/${form.id}`, { method: 'PUT', body: { ...form } });
    else await api('/admin/skus', { method: 'POST', body: { ...form } });
    ElMessage.success('已保存');
    visible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <h2>SKU 管理</h2>
      <el-button type="primary" @click="open()">新增</el-button>
    </div>
    <el-table :data="list" style="margin-top: 12px">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="type" label="类型" width="80" />
      <el-table-column label="前台" width="70">
        <template #default="{ row }">{{ row.is_public !== false ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="热门" width="70">
        <template #default="{ row }">{{ row.is_hot ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column prop="sort_weight" label="权重" width="70" />
      <el-table-column prop="selling_point" label="卖点" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="90" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click="open(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="visible" title="SKU" width="560px">
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type"><el-option value="gpu" /><el-option value="token" /></el-select>
        </el-form-item>
        <el-form-item label="单位"><el-input v-model="form.unit" /></el-form-item>
        <el-form-item label="规格"><el-input v-model="form.spec" /></el-form-item>
        <el-form-item label="卖点"><el-input v-model="form.selling_point" maxlength="40" /></el-form-item>
        <el-form-item label="交期说明"><el-input v-model="form.delivery_note" type="textarea" /></el-form-item>
        <el-form-item label="排序权重"><el-input-number v-model="form.sort_weight" :min="0" /></el-form-item>
        <el-form-item label="前台可见"><el-switch v-model="form.is_public" /></el-form-item>
        <el-form-item label="首页热门"><el-switch v-model="form.is_hot" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status"><el-option value="active" /><el-option value="inactive" /></el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

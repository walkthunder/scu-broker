<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const visible = ref(false);
const form = reactive({
  id: null,
  title: '',
  content: '',
  position: 'top',
  bg_color: '#1e293b',
  text_color: '#f8fafc',
  is_active: true,
  start_time: '',
  end_time: '',
});

async function load() {
  list.value = (await api('/admin/announcements')).data;
}

onMounted(load);

function open(row) {
  Object.assign(
    form,
    row
      ? {
          id: row.id,
          title: row.title,
          content: row.content || '',
          position: row.position || 'top',
          bg_color: row.bg_color || '#1e293b',
          text_color: row.text_color || '#f8fafc',
          is_active: !!row.is_active,
          start_time: row.start_time || '',
          end_time: row.end_time || '',
        }
      : {
          id: null,
          title: '',
          content: '',
          position: 'top',
          bg_color: '#1e293b',
          text_color: '#f8fafc',
          is_active: true,
          start_time: '',
          end_time: '',
        },
  );
  visible.value = true;
}

async function save() {
  try {
    const body = { ...form };
    if (!body.start_time) body.start_time = null;
    if (!body.end_time) body.end_time = null;
    if (form.id) await api(`/admin/announcements/${form.id}`, { method: 'PUT', body });
    else await api('/admin/announcements', { method: 'POST', body });
    ElMessage.success('已保存');
    visible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm('确认删除该通告？', '提示');
    await api(`/admin/announcements/${row.id}`, { method: 'DELETE' });
    ElMessage.success('已删除');
    await load();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '已取消');
  }
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between">
      <h2>通告管理</h2>
      <el-button type="primary" @click="open()">新建通告</el-button>
    </div>
    <el-table :data="list" style="margin-top: 12px">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="title" label="标题" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">{{ row.is_active ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column prop="start_time" label="开始" />
      <el-table-column prop="end_time" label="结束" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" @click="open(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="visible" title="通告" width="560px">
      <el-form label-width="90px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="form.content" type="textarea" rows="3" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.is_active" /></el-form-item>
        <el-form-item label="背景色"><el-input v-model="form.bg_color" /></el-form-item>
        <el-form-item label="文字色"><el-input v-model="form.text_color" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

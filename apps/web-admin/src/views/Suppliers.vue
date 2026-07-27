<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const visible = ref(false);
const form = reactive({
  id: null,
  name: '',
  display_name: '',
  contact_name: '',
  contact_phone: '',
  wechat: '',
  skus: '',
  price_style: '中等',
  reliability: '一般',
  note: '',
});

async function load() {
  list.value = (await api('/admin/suppliers')).data;
}
onMounted(load);

function open(row) {
  Object.assign(
    form,
    row || {
      id: null,
      name: '',
      display_name: '',
      contact_name: '',
      contact_phone: '',
      wechat: '',
      skus: '',
      price_style: '中等',
      reliability: '一般',
      note: '',
    },
  );
  visible.value = true;
}

async function save() {
  try {
    if (form.id) await api(`/admin/suppliers/${form.id}`, { method: 'PUT', body: form });
    else await api('/admin/suppliers', { method: 'POST', body: form });
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
    <div style="display: flex; justify-content: space-between">
      <h2>供应商管理</h2>
      <el-button type="primary" @click="open()">新增</el-button>
    </div>
    <el-table :data="list" style="margin-top: 12px">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="display_name" label="脱敏名" />
      <el-table-column prop="contact_name" label="联系人" width="100" />
      <el-table-column prop="skus" label="擅长 SKU" />
      <el-table-column prop="reliability" label="靠谱程度" width="100" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click="open(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="visible" title="供应商" width="520px">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="脱敏名"><el-input v-model="form.display_name" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contact_name" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.contact_phone" /></el-form-item>
        <el-form-item label="微信"><el-input v-model="form.wechat" /></el-form-item>
        <el-form-item label="擅长 SKU"><el-input v-model="form.skus" placeholder="逗号分隔" /></el-form-item>
        <el-form-item label="报价风格">
          <el-select v-model="form.price_style">
            <el-option value="偏高" /><el-option value="中等" /><el-option value="偏低" />
          </el-select>
        </el-form-item>
        <el-form-item label="靠谱程度">
          <el-select v-model="form.reliability">
            <el-option value="靠谱" /><el-option value="一般" /><el-option value="需谨慎" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.note" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

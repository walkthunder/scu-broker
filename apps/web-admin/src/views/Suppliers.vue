<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const skuOptions = ref([]);
const visible = ref(false);
const showMore = ref(false);
const skuIds = ref([]);
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

onMounted(async () => {
  skuOptions.value = (await api('/admin/skus')).data || [];
  await load();
});

function open(row) {
  if (row) {
    Object.assign(form, {
      id: row.id,
      name: row.name,
      display_name: row.display_name || '',
      contact_name: row.contact_name || '',
      contact_phone: row.contact_phone || '',
      wechat: row.wechat || '',
      skus: row.skus || '',
      price_style: row.price_style || '中等',
      reliability: row.reliability || '一般',
      note: row.note || '',
    });
    skuIds.value = String(row.skus || '')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => skuOptions.value.find((s) => s.name === name)?.id)
      .filter(Boolean);
    showMore.value = !!(row.contact_name || row.contact_phone || row.wechat || row.note);
  } else {
    Object.assign(form, {
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
    skuIds.value = [];
    showMore.value = false;
  }
  visible.value = true;
}

async function save() {
  if (!String(form.name || '').trim()) {
    ElMessage.warning('请填写供应商名称');
    return;
  }
  const names = skuIds.value
    .map((id) => skuOptions.value.find((s) => s.id === id)?.name)
    .filter(Boolean);
  const body = {
    ...form,
    name: String(form.name).trim(),
    display_name: String(form.display_name || form.name).trim(),
    skus: names.join(','),
  };
  try {
    if (form.id) await api(`/admin/suppliers/${form.id}`, { method: 'PUT', body });
    else await api('/admin/suppliers', { method: 'POST', body });
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
      <div>
        <h2>供应商管理</h2>
        <p class="page-desc">新建只需名称；脱敏名默认与名称相同，联系方式可后补。</p>
      </div>
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
    <el-dialog v-model="visible" :title="form.id ? '编辑供应商' : '新增供应商'" width="520px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="内部名称" />
        </el-form-item>
        <el-form-item label="脱敏名">
          <el-input
            v-model="form.display_name"
            :placeholder="form.name ? `默认：${form.name}` : '对客展示名，默认同名称'"
          />
        </el-form-item>
        <el-form-item label="擅长 SKU">
          <el-select v-model="skuIds" multiple filterable style="width: 100%" placeholder="可选">
            <el-option v-for="s in skuOptions" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="报价风格">
          <el-select v-model="form.price_style" style="width: 160px">
            <el-option label="偏高" value="偏高" />
            <el-option label="中等" value="中等" />
            <el-option label="偏低" value="偏低" />
          </el-select>
        </el-form-item>
        <el-form-item label="靠谱程度">
          <el-select v-model="form.reliability" style="width: 160px">
            <el-option label="靠谱" value="靠谱" />
            <el-option label="一般" value="一般" />
            <el-option label="需谨慎" value="需谨慎" />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">
          <el-button link type="primary" @click="showMore = !showMore">
            {{ showMore ? '收起联系信息' : '展开联系信息（可选）' }}
          </el-button>
        </el-divider>
        <template v-if="showMore">
          <el-form-item label="联系人"><el-input v-model="form.contact_name" /></el-form-item>
          <el-form-item label="电话"><el-input v-model="form.contact_phone" /></el-form-item>
          <el-form-item label="微信"><el-input v-model="form.wechat" /></el-form-item>
          <el-form-item label="备注"><el-input v-model="form.note" type="textarea" /></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

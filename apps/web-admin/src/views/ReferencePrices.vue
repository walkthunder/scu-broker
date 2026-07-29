<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const skus = ref([]);
const date = ref(new Date().toISOString().slice(0, 10));
const visible = ref(false);
const form = reactive({
  sku_id: null,
  date: date.value,
  price_low: 0,
  price_mid: 0,
  price_high: 0,
});

async function load() {
  list.value = (await api(`/admin/reference-prices?date=${date.value}`)).data;
}
onMounted(async () => {
  skus.value = (await api('/admin/skus')).data;
  await load();
});

function open(row) {
  Object.assign(
    form,
    row
      ? {
          sku_id: row.sku_id,
          date: row.date,
          price_low: Number(row.price_low),
          price_mid: Number(row.price_mid),
          price_high: Number(row.price_high),
        }
      : { sku_id: skus.value[0]?.id, date: date.value, price_low: 0, price_mid: 0, price_high: 0 },
  );
  visible.value = true;
}

async function save() {
  try {
    await api('/admin/reference-prices', { method: 'POST', body: form });
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
    <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between">
      <h2>参考价管理</h2>
      <div style="display: flex; gap: 8px">
        <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" @change="load" />
        <el-button type="primary" @click="open()">录入</el-button>
      </div>
    </div>
    <el-table :data="list" style="margin-top: 12px">
      <el-table-column label="SKU" :formatter="(row) => row.sku?.name" />
      <el-table-column prop="date" label="日期" width="120" />
      <el-table-column prop="price_low" label="低" />
      <el-table-column prop="price_mid" label="中" />
      <el-table-column prop="price_high" label="高" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click="open(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="visible" title="参考价" width="420px">
      <el-form label-width="80px">
        <el-form-item label="SKU">
          <el-select v-model="form.sku_id" style="width: 100%">
            <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="低"><el-input-number v-model="form.price_low" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="中"><el-input-number v-model="form.price_mid" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="高"><el-input-number v-model="form.price_high" :min="0" :precision="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

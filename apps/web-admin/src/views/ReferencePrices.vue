<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const skus = ref([]);
const date = ref(new Date().toISOString().slice(0, 10));
const visible = ref(false);
const form = reactive({
  sku_id: null,
  date: date.value,
  price_low: null,
  price_mid: null,
  price_high: null,
});
const midTouched = ref(false);

async function load() {
  list.value = (await api(`/admin/reference-prices?date=${date.value}`)).data;
}
onMounted(async () => {
  skus.value = (await api('/admin/skus')).data;
  await load();
});

watch(
  () => [form.price_low, form.price_high],
  ([low, high]) => {
    if (midTouched.value) return;
    if (low != null && high != null && Number(low) > 0 && Number(high) > 0) {
      form.price_mid = Math.round(((Number(low) + Number(high)) / 2) * 100) / 100;
    }
  },
);

function open(row) {
  midTouched.value = !!row;
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
      : {
          sku_id: skus.value.find((s) => s.status === 'active')?.id || skus.value[0]?.id,
          date: date.value,
          price_low: null,
          price_mid: null,
          price_high: null,
        },
  );
  visible.value = true;
}

async function save() {
  const low = Number(form.price_low);
  const mid = Number(form.price_mid);
  const high = Number(form.price_high);
  if (!form.sku_id || !form.date) {
    ElMessage.warning('请选择 SKU 与日期');
    return;
  }
  if (!(low > 0) || !(mid > 0) || !(high > 0)) {
    ElMessage.warning('低/中/高价须大于 0');
    return;
  }
  if (!(low <= mid && mid <= high)) {
    ElMessage.warning('须满足：低 ≤ 中 ≤ 高');
    return;
  }
  try {
    await api('/admin/reference-prices', {
      method: 'POST',
      body: { ...form, price_low: low, price_mid: mid, price_high: high },
    });
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
      <div>
        <h2>参考价管理</h2>
        <p class="page-desc">录入低/高后自动算中价；须低 ≤ 中 ≤ 高，且均大于 0。</p>
      </div>
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
    <el-dialog v-model="visible" title="参考价" width="440px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="SKU" required>
          <el-select v-model="form.sku_id" style="width: 100%" filterable>
            <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="低" required>
          <el-input-number v-model="form.price_low" :min="0" :precision="2" controls-position="right" />
        </el-form-item>
        <el-form-item label="高" required>
          <el-input-number v-model="form.price_high" :min="0" :precision="2" controls-position="right" />
        </el-form-item>
        <el-form-item label="中" required>
          <el-input-number
            v-model="form.price_mid"
            :min="0"
            :precision="2"
            controls-position="right"
            @change="midTouched = true"
          />
          <span class="page-desc" style="margin-left: 8px">默认同（低+高）/2，可改</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

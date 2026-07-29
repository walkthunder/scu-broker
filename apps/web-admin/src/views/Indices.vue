<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const indices = ref([]);
const skus = ref([]);
const selected = ref(null);
const prints = ref([]);
const createVisible = ref(false);
const form = reactive({ code: '', name: '', sku_id: null, jump_threshold_pct: 20 });
const printForm = reactive({ date: '', settle_price: null });

async function loadIndices() {
  indices.value = (await api('/admin/indices')).data || [];
  if (!selected.value && indices.value.length) {
    await selectIndex(indices.value[0]);
  }
}

async function loadSkus() {
  skus.value = (await api('/admin/skus')).data || [];
}

async function selectIndex(row) {
  selected.value = row;
  prints.value = (await api(`/admin/indices/${row.id}/prints`)).data || [];
}

onMounted(async () => {
  await loadSkus();
  await loadIndices();
});

async function createIndex() {
  try {
    await api('/admin/indices', { method: 'POST', body: { ...form } });
    ElMessage.success('已创建');
    createVisible.value = false;
    await loadIndices();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function generateFromMid() {
  if (!selected.value) return;
  try {
    await api(`/admin/indices/${selected.value.id}/prints`, {
      method: 'POST',
      body: { date: printForm.date || undefined },
    });
    ElMessage.success('已生成');
    await selectIndex(selected.value);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function overridePrice() {
  if (!selected.value || printForm.settle_price == null) return;
  try {
    await api(`/admin/indices/${selected.value.id}/prints`, {
      method: 'POST',
      body: { date: printForm.date || undefined, settle_price: printForm.settle_price },
    });
    ElMessage.success('已覆写');
    await selectIndex(selected.value);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function publish(row) {
  try {
    await api(`/admin/indices/${selected.value.id}/prints/${row.date}/publish`, { method: 'POST' });
    ElMessage.success('已发布');
    await selectIndex(selected.value);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function unpublish(row) {
  try {
    await api(`/admin/indices/${selected.value.id}/prints/${row.date}/unpublish`, { method: 'POST' });
    ElMessage.success('已撤销');
    await selectIndex(selected.value);
  } catch (e) {
    ElMessage.error(e.message);
  }
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <h2>价格指数</h2>
      <el-button type="primary" @click="createVisible = true">新建指数</el-button>
    </div>
    <el-row :gutter="16" style="margin-top: 12px">
      <el-col :span="8">
        <el-table
          :data="indices"
          highlight-current-row
          @current-change="(r) => r && selectIndex(r)"
        >
          <el-table-column prop="code" label="代码" width="100" />
          <el-table-column prop="name" label="名称" />
          <el-table-column label="SKU" :formatter="(_, __, r) => r.sku?.name" />
        </el-table>
      </el-col>
      <el-col :span="16">
        <template v-if="selected">
          <h3>{{ selected.code }} · {{ selected.name }}</h3>
          <div style="display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap">
            <el-date-picker v-model="printForm.date" type="date" value-format="YYYY-MM-DD" placeholder="日期(默认今日)" />
            <el-button @click="generateFromMid">从 mid 生成</el-button>
            <el-input-number v-model="printForm.settle_price" :min="0" :precision="2" placeholder="覆写价" />
            <el-button type="warning" @click="overridePrice">人工覆写</el-button>
          </div>
          <el-table :data="prints">
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column prop="settle_price" label="结算价 S" />
            <el-table-column prop="source" label="来源" width="100" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button
                  v-if="row.status !== 'published'"
                  link
                  type="primary"
                  @click="publish(row)"
                >发布</el-button>
                <el-button
                  v-else
                  link
                  type="danger"
                  @click="unpublish(row)"
                >撤销</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
        <el-empty v-else description="请选择指数" />
      </el-col>
    </el-row>

    <el-dialog v-model="createVisible" title="新建指数" width="480px">
      <el-form label-width="100px">
        <el-form-item label="代码"><el-input v-model="form.code" placeholder="H100-M" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="锚定 SKU">
          <el-select v-model="form.sku_id" filterable style="width: 100%">
            <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="跳变阈值%">
          <el-input-number v-model="form.jump_threshold_pct" :min="1" :max="100" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="createIndex">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

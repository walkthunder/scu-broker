<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const publishVisible = ref(false);
const form = reactive({
  id: null,
  region: '东部',
  sku_name: '',
  deal_type: '时租',
});

const regions = ['东部', '南部', '西部', '北部', '海外'];
const dealTypes = ['时租', '包月', '包年', 'Token包'];

async function load() {
  list.value = (await api('/admin/deal-feeds')).data || [];
}

onMounted(load);

function openPublish(row) {
  Object.assign(form, {
    id: row.id,
    region: row.region || '东部',
    sku_name: row.sku_name || '',
    deal_type: row.deal_type || '时租',
  });
  publishVisible.value = true;
}

async function publish() {
  try {
    await api(`/admin/deal-feeds/${form.id}/publish`, {
      method: 'POST',
      body: {
        region: form.region,
        sku_name: form.sku_name,
        deal_type: form.deal_type,
      },
    });
    ElMessage.success('已发布到前台');
    publishVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm('确认删除该成交动态？', '提示');
    await api(`/admin/deal-feeds/${row.id}`, { method: 'DELETE' });
    ElMessage.success('已删除');
    await load();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '已取消');
  }
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <div>
        <h2 style="margin: 0">成交动态</h2>
        <p style="margin: 6px 0 0; color: #64748b; font-size: 13px">
          订单完成后自动生成草稿；发布前可改区域 / SKU 显示名 / 类型，禁止写价格。
        </p>
      </div>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-table :data="list" style="margin-top: 12px">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="order_id" label="订单" width="80" />
      <el-table-column prop="region" label="区域" width="90" />
      <el-table-column prop="sku_name" label="SKU 显示名" />
      <el-table-column prop="deal_type" label="类型" width="100" />
      <el-table-column prop="deal_date" label="日期" width="120" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.is_published ? 'success' : 'info'" size="small">
            {{ row.is_published ? '已发布' : '草稿' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="published_at" label="发布时间" width="180" />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row.is_published" link type="primary" @click="openPublish(row)">发布</el-button>
          <el-button v-else link type="primary" @click="openPublish(row)">再发布/改文案</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="publishVisible" title="发布成交动态" width="480px">
      <el-form label-width="100px">
        <el-form-item label="区域">
          <el-select v-model="form.region" style="width: 100%">
            <el-option v-for="r in regions" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="SKU 显示名">
          <el-input v-model="form.sku_name" maxlength="100" />
        </el-form-item>
        <el-form-item label="成交类型">
          <el-select v-model="form.deal_type" style="width: 100%">
            <el-option v-for="t in dealTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishVisible = false">取消</el-button>
        <el-button type="primary" @click="publish">确认发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

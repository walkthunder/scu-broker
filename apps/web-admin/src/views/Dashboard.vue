<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

const data = ref(null);

onMounted(async () => {
  const res = await api('/admin/dashboard');
  data.value = res.data;
});
</script>

<template>
  <div v-if="data">
    <h2>Dashboard</h2>
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="6"><el-card shadow="hover">今日询价<br /><b style="font-size: 28px">{{ data.today_rfqs }}</b></el-card></el-col>
      <el-col :span="6"><el-card shadow="hover">待处理询价<br /><b style="font-size: 28px">{{ data.pending_rfqs }}</b></el-card></el-col>
      <el-col :span="6"><el-card shadow="hover">本月成交单量<br /><b style="font-size: 28px">{{ data.month_orders }}</b></el-card></el-col>
      <el-col :span="6"><el-card shadow="hover">本月成交额<br /><b style="font-size: 28px">{{ Number(data.month_amount).toLocaleString() }}</b></el-card></el-col>
    </el-row>
    <h3 style="margin-top: 24px">最近待处理询价</h3>
    <el-table :data="data.recent_pending" style="margin-top: 8px">
      <el-table-column prop="id" label="询价号" width="90" />
      <el-table-column label="客户" :formatter="(_, __, row) => row.customer?.company_name || row.customer?.name" />
      <el-table-column label="SKU" :formatter="(_, __, row) => row.sku?.name" />
      <el-table-column prop="created_at" label="提交时间" />
    </el-table>
  </div>
</template>

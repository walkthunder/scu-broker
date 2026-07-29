<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const data = ref(null);
const err = ref('');

onMounted(async () => {
  try {
    const res = await api('/admin/dashboard');
    data.value = res.data;
  } catch (e) {
    err.value = e.message || '加载失败';
    ElMessage.error(err.value);
  }
});
</script>

<template>
  <div>
    <h2>Dashboard</h2>
    <p v-if="err" style="color: #f56c6c">{{ err }}</p>
    <template v-if="data">
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="6"><el-card shadow="hover">今日询价<br /><b style="font-size: 28px">{{ data.today_rfqs }}</b></el-card></el-col>
        <el-col :span="6"><el-card shadow="hover">待处理询价<br /><b style="font-size: 28px">{{ data.pending_rfqs }}</b></el-card></el-col>
        <el-col :span="6"><el-card shadow="hover">本月成交单量<br /><b style="font-size: 28px">{{ data.month_orders }}</b></el-card></el-col>
        <el-col :span="6"><el-card shadow="hover">本月成交额<br /><b style="font-size: 28px">{{ Number(data.month_amount).toLocaleString() }}</b></el-card></el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="8"><el-card shadow="hover">现金结算完结合约（北星）<br /><b style="font-size: 28px">{{ data.settled_contracts ?? 0 }}</b></el-card></el-col>
        <el-col :span="8"><el-card shadow="hover">远期待确认<br /><b style="font-size: 28px">{{ data.pending_confirms ?? 0 }}</b></el-card></el-col>
        <el-col :span="8"><el-card shadow="hover">今日待发布指数<br /><b style="font-size: 28px">{{ data.pending_index_prints ?? 0 }}</b></el-card></el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="8"><el-card shadow="hover">实物交割完结合约<br /><b style="font-size: 28px">{{ data.delivered_contracts ?? 0 }}</b></el-card></el-col>
        <el-col :span="8"><el-card shadow="hover">实物交割占比 %<br /><b style="font-size: 28px">{{ data.physical_ratio_pct ?? 0 }}</b></el-card></el-col>
      </el-row>
      <h3 style="margin-top: 24px">最近待处理询价</h3>
      <el-table :data="data.recent_pending" style="margin-top: 8px">
        <el-table-column prop="id" label="询价号" width="90" />
        <el-table-column label="客户" :formatter="(row) => row.customer?.company_name || row.customer?.name" />
        <el-table-column label="SKU" :formatter="(row) => row.sku?.name" />
        <el-table-column prop="created_at" label="提交时间" />
      </el-table>
    </template>
  </div>
</template>

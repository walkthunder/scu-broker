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
    <div class="page-head">
      <h2>Dashboard</h2>
      <p class="page-desc">现货询价、远期结算与交割北星一览。</p>
    </div>
    <p v-if="err" style="color: var(--cx-danger)">{{ err }}</p>
    <template v-if="data">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">今日询价</div>
            <div class="stat-value">{{ data.today_rfqs }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">待处理询价</div>
            <div class="stat-value accent">{{ data.pending_rfqs }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">本月成交单量</div>
            <div class="stat-value">{{ data.month_orders }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">本月成交额</div>
            <div class="stat-value">{{ Number(data.month_amount).toLocaleString() }}</div>
          </el-card>
        </el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="8">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">现金结算完结合约（北星）</div>
            <div class="stat-value accent">{{ data.settled_contracts ?? 0 }}</div>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">远期待确认</div>
            <div class="stat-value">{{ data.pending_confirms ?? 0 }}</div>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">今日待发布指数</div>
            <div class="stat-value">{{ data.pending_index_prints ?? 0 }}</div>
          </el-card>
        </el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="8">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">实物交割完结合约</div>
            <div class="stat-value">{{ data.delivered_contracts ?? 0 }}</div>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card class="stat-card" shadow="never">
            <div class="stat-label">实物交割占比 %</div>
            <div class="stat-value">{{ data.physical_ratio_pct ?? 0 }}</div>
          </el-card>
        </el-col>
      </el-row>
      <div class="page-head" style="margin-top: 28px; margin-bottom: 10px">
        <h2 style="font-size: 16px">最近待处理询价</h2>
      </div>
      <el-table :data="data.recent_pending">
        <el-table-column prop="id" label="询价号" width="90" />
        <el-table-column
          label="客户"
          :formatter="(row) => row.customer?.company_name || row.customer?.name"
        />
        <el-table-column label="SKU" :formatter="(row) => row.sku?.name" />
        <el-table-column prop="created_at" label="提交时间" />
      </el-table>
    </template>
  </div>
</template>

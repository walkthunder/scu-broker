<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);

async function load() {
  list.value = (await api('/admin/settlement-bills')).data || [];
}

onMounted(load);

async function confirmPay(row) {
  try {
    await api(`/admin/settlement-bills/${row.id}/confirm-pay`, { method: 'POST' });
    ElMessage.success('已确认收付');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function dirLabel(d) {
  if (d === 'seller_to_buyer') return '卖方→买方';
  if (d === 'buyer_to_seller') return '买方→卖方';
  return '无收付';
}
</script>

<template>
  <div>
    <h2>远期结算账单</h2>
    <el-table :data="list" style="margin-top: 12px">
      <el-table-column prop="id" label="账单" width="70" />
      <el-table-column prop="contract_id" label="合约" width="80" />
      <el-table-column prop="settle_date" label="结算日" width="120" />
      <el-table-column prop="settle_price" label="S" width="90" />
      <el-table-column prop="settle_price_date" label="S 日期" width="120" />
      <el-table-column prop="strike" label="X" width="90" />
      <el-table-column prop="qty" label="数量" width="80" />
      <el-table-column prop="amount" label="差价绝对值" width="110" />
      <el-table-column label="方向" width="120">
        <template #default="{ row }">{{ dirLabel(row.pay_direction) }}</template>
      </el-table-column>
      <el-table-column prop="pay_status" label="收付" width="90" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
            v-if="row.pay_status === 'pending'"
            link
            type="primary"
            @click="confirmPay(row)"
          >确认收付</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

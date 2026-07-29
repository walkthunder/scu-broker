<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const customers = ref([]);
const skus = ref([]);
const regions = ref([]);
const pool = ref(null);
const form = reactive({
  kind: 'call',
  buyer_id: null,
  sku_id: null,
  region: 'shanghai',
  qty: 1,
  strike: 0,
  premium: 0,
});

async function load() {
  try {
    list.value = (await api('/frd/rights')).data || [];
    customers.value = (await api('/admin/customers')).data || [];
    skus.value = (await api('/admin/skus')).data || [];
    regions.value = (await api('/frd/meta/regions')).data || [];
    pool.value = (await api('/frd/rights/put-pool')).data;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function create() {
  try {
    await api('/frd/rights', { method: 'POST', body: { ...form } });
    ElMessage.success('已开仓');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function confirmFee(id) {
  try {
    await api(`/frd/rights/${id}/confirm-fee`, { method: 'POST' });
    ElMessage.success('已确认权利金');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-head">
      <h2>认购 / 认沽权益</h2>
      <p class="page-desc">
        使用权/保障服务协议形态。认沽资金池覆盖倍数
        {{
          pool?.coverage == null
            ? '—'
            : Number(pool.coverage).toFixed(2)
        }}
        （余额 {{ pool ? Number(pool.pool_balance).toLocaleString() : '—' }}）
      </p>
    </div>
    <el-card shadow="never" style="margin-bottom: 16px">
      <el-form inline>
        <el-form-item label="类型">
          <el-select v-model="form.kind" style="width: 100px">
            <el-option label="认购" value="call" />
            <el-option label="认沽" value="put" />
          </el-select>
        </el-form-item>
        <el-form-item label="买方">
          <el-select v-model="form.buyer_id" filterable style="width: 180px">
            <el-option
              v-for="u in customers"
              :key="u.id"
              :label="u.company_name || u.name || u.email"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="SKU">
          <el-select v-model="form.sku_id" style="width: 140px">
            <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="区域">
          <el-select v-model="form.region" style="width: 100px">
            <el-option v-for="r in regions" :key="r.code" :label="r.name" :value="r.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="行权价"><el-input-number v-model="form.strike" :min="0" /></el-form-item>
        <el-form-item label="权利金"><el-input-number v-model="form.premium" :min="0" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="form.qty" :min="0.01" /></el-form-item>
        <el-button type="primary" @click="create">开仓</el-button>
      </el-form>
    </el-card>
    <el-table :data="list" size="small">
      <el-table-column prop="id" width="60" />
      <el-table-column prop="kind" width="70" />
      <el-table-column label="买方" width="120">
        <template #default="{ row }">{{ row.buyer?.company_name || row.buyer?.name }}</template>
      </el-table-column>
      <el-table-column label="标的"><template #default="{ row }">{{ row.sku?.name }}</template></el-table-column>
      <el-table-column prop="strike" label="行权价" />
      <el-table-column prop="premium" label="权利金" />
      <el-table-column prop="status" width="120" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending_confirm' && row.buyer_confirmed_at"
            link
            type="primary"
            @click="confirmFee(row.id)"
          >
            确认收费
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

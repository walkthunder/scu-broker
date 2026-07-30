<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api, clearAuth, getToken, getUser } from '../api';

const router = useRouter();
const caps = ref([]);
const deliveries = ref([]);
const skus = ref([]);
const regions = ref([]);
const deal = reactive({
  sku_id: null,
  region: 'shanghai',
  qty: 1,
  unit_price: 0,
  deal_status: 'filled',
});
const user = getUser();

async function load() {
  try {
    caps.value = (await api('/frd/partner/capacities/mine')).data || [];
    deliveries.value = (await api('/frd/partner/deliveries')).data || [];
    regions.value = (await api('/frd/meta/regions')).data || [];
    // skus from capacities
    const map = {};
    for (const c of caps.value) {
      if (c.sku) map[c.sku.id] = c.sku;
    }
    skus.value = Object.values(map);
    if (skus.value[0]) deal.sku_id = skus.value[0].id;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function reportDeal() {
  try {
    await api('/frd/partner/channel-deals', { method: 'POST', body: { ...deal } });
    ElMessage.success('已上报意向成交，待运营确认后计入指数');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function saveCap(row) {
  try {
    await api(`/frd/partner/capacities/${row.id}`, {
      method: 'PUT',
      body: {
        quote_bid: row.quote_bid,
        quote_ask: row.quote_ask,
      },
    });
    ElMessage.success('报价已更新（产能余量由运营维护）');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function uploadVoucher(row, file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const base = import.meta.env.VITE_API_BASE || '/api';
    const res = await fetch(`${base}/frd/partner/deliveries/${row.id}/voucher`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const json = await res.json();
    if (!res.ok || json.code !== 0) throw new Error(json.message || '上传失败');
    ElMessage.success('凭证已上传');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function logout() {
  clearAuth();
  router.push('/login');
}

onMounted(load);
</script>

<template>
  <div style="max-width: 1100px; margin: 0 auto; padding: 24px">
    <div style="display: flex; justify-content: space-between; align-items: center">
      <div>
        <h1 style="margin: 0; font-size: 22px">伙伴工作台</h1>
        <p style="color: #64748b; margin: 4px 0 0">
          {{ user?.company_name || user?.name }} · 产能 / 双边报价 / 意向成交 / 交割凭证
        </p>
      </div>
      <el-button link type="primary" @click="logout">退出</el-button>
    </div>

    <el-card shadow="never" style="margin-top: 20px">
      <template #header>产能余量（只读）与双边报价</template>
      <el-table :data="caps" size="small">
        <el-table-column label="SKU" :formatter="(r) => r.sku?.name" />
        <el-table-column prop="region" label="区域" width="100" />
        <el-table-column prop="spot_qty" label="现货余量" width="100" />
        <el-table-column prop="forward_qty" label="预售余量" width="100" />
        <el-table-column prop="rights_qty" label="权益余量" width="100" />
        <el-table-column label="Bid" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.quote_bid" :min="0" :precision="2" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="Ask" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.quote_ask" :min="0" :precision="2" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="saveCap(row)">保存报价</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>上报渠道成交价</template>
      <el-form inline>
        <el-form-item label="SKU">
          <el-select v-model="deal.sku_id" style="width: 140px">
            <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="区域">
          <el-select v-model="deal.region" style="width: 110px">
            <el-option v-for="r in regions" :key="r.code" :label="r.name" :value="r.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量"><el-input-number v-model="deal.qty" :min="0.01" /></el-form-item>
        <el-form-item label="单价"><el-input-number v-model="deal.unit_price" :min="0" /></el-form-item>
        <el-button type="primary" @click="reportDeal">提交</el-button>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>交割工单与凭证</template>
      <el-table :data="deliveries.slice(0, 50)" size="small">
        <el-table-column prop="id" width="70" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column prop="voucher_path" label="凭证" />
        <el-table-column label="上传" width="160">
          <template #default="{ row }">
            <input
              type="file"
              accept="image/*,.pdf"
              @change="(e) => uploadVoucher(row, e.target.files?.[0])"
            />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

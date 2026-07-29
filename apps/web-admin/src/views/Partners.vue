<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const apps = ref([]);
const caps = ref([]);
const suppliers = ref([]);
const skus = ref([]);
const regions = ref([]);
const capForm = reactive({
  supplier_id: null,
  sku_id: null,
  region: 'shanghai',
  spot_qty: 100,
  forward_qty: 50,
  rights_qty: 20,
});

async function load() {
  try {
    apps.value = (await api('/frd/partner/applications')).data || [];
    caps.value = (await api('/frd/partner-capacities')).data || [];
    suppliers.value = (await api('/admin/suppliers')).data || [];
    skus.value = (await api('/admin/skus')).data || [];
    regions.value = (await api('/frd/meta/regions')).data || [];
    if (!capForm.supplier_id && suppliers.value[0]) capForm.supplier_id = suppliers.value[0].id;
    if (!capForm.sku_id && skus.value[0]) capForm.sku_id = skus.value[0].id;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function review(row, approve) {
  try {
    const r = await api(`/frd/partner/applications/${row.id}/review`, {
      method: 'POST',
      body: { approve, review_note: approve ? '同意入驻' : '驳回' },
    });
    if (approve && r.data?.login_hint) {
      ElMessage.success(
        `已开通 ${r.data.login_hint.email} / ${r.data.login_hint.initial_password || r.data.login_hint.password}`,
      );
    } else {
      ElMessage.success(approve ? '已通过' : '已驳回');
    }
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function upsertCapacity() {
  try {
    await api('/frd/partner-capacities', { method: 'POST', body: { ...capForm } });
    ElMessage.success('产能已保存');
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
      <h2>伙伴入驻与产能</h2>
      <p class="page-desc">审核伙伴申请、录入/调整产能余量（伙伴门户可自助改余量）</p>
    </div>
    <el-card shadow="never">
      <template #header>入驻申请</template>
      <el-table :data="apps" size="small">
        <el-table-column prop="id" width="60" />
        <el-table-column prop="company_name" label="公司" />
        <el-table-column prop="contact_name" label="联系人" />
        <el-table-column prop="phone" label="电话" />
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button link type="primary" @click="review(row, true)">通过</el-button>
              <el-button link type="danger" @click="review(row, false)">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>产能录入 / 调整</template>
      <el-form inline>
        <el-form-item label="供应商">
          <el-select v-model="capForm.supplier_id" filterable style="width: 180px">
            <el-option
              v-for="s in suppliers"
              :key="s.id"
              :label="s.display_name || s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="SKU">
          <el-select v-model="capForm.sku_id" style="width: 140px">
            <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="区域">
          <el-select v-model="capForm.region" style="width: 110px">
            <el-option v-for="r in regions" :key="r.code" :label="r.name" :value="r.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="现货"><el-input-number v-model="capForm.spot_qty" :min="0" /></el-form-item>
        <el-form-item label="预售"><el-input-number v-model="capForm.forward_qty" :min="0" /></el-form-item>
        <el-form-item label="权益"><el-input-number v-model="capForm.rights_qty" :min="0" /></el-form-item>
        <el-button type="primary" @click="upsertCapacity">保存产能</el-button>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>产能台账</template>
      <el-table :data="caps" size="small">
        <el-table-column label="伙伴" :formatter="(r) => r.supplier?.display_name || r.supplier?.name" />
        <el-table-column label="SKU" :formatter="(r) => r.sku?.name" />
        <el-table-column prop="region" label="区域" width="100" />
        <el-table-column prop="spot_qty" label="现货余量" />
        <el-table-column prop="forward_qty" label="预售余量" />
        <el-table-column prop="rights_qty" label="权益余量" />
      </el-table>
    </el-card>
  </div>
</template>

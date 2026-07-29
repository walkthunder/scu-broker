<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const indices = ref([]);
const customers = ref([]);
const visible = ref(false);
const proxyVisible = ref(false);
const proxyTarget = ref(null);
const form = reactive({
  index_id: null,
  buyer_id: null,
  seller_id: null,
  qty: 1,
  unit: '月',
  strike_price: null,
  expiry_date: '',
  note: '',
});
const proxyForm = reactive({ side: 'seller', note: '' });

const userLabel = (u) =>
  u ? `${u.company_name || u.name || '用户'} (#${u.id} ${u.email || u.phone || ''})` : '';

const selectedIndex = computed(() => indices.value.find((i) => i.id === form.index_id));
const canOpenSelected = computed(() => !!selectedIndex.value?.latest_published);

async function load() {
  try {
    const [f, i, c] = await Promise.all([
      api('/admin/forwards'),
      api('/admin/indices'),
      api('/admin/customers'),
    ]);
    list.value = f.data || [];
    indices.value = i.data || [];
    customers.value = c.data || [];
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  }
}

onMounted(load);

watch(
  () => form.index_id,
  (id) => {
    const idx = indices.value.find((i) => i.id === id);
    if (idx?.sku?.unit) form.unit = idx.sku.unit;
  },
);

function openCreate() {
  const firstReady = indices.value.find((i) => i.status === 'active' && i.latest_published);
  Object.assign(form, {
    index_id: firstReady?.id || null,
    buyer_id: null,
    seller_id: null,
    qty: 1,
    unit: firstReady?.sku?.unit || '月',
    strike_price: firstReady?.latest_published?.settle_price ?? null,
    expiry_date: '',
    note: '',
  });
  visible.value = true;
}

async function create() {
  if (!canOpenSelected.value) {
    ElMessage.warning('请选择已有已发布结算价 S 的指数');
    return;
  }
  try {
    await api('/admin/forwards', { method: 'POST', body: { ...form } });
    ElMessage.success('已开仓，待确认');
    visible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function openProxy(row) {
  proxyTarget.value = row;
  proxyForm.side = 'seller';
  proxyForm.note = '';
  proxyVisible.value = true;
}

async function doProxy() {
  if (!proxyForm.note?.trim()) {
    ElMessage.warning('请填写代理确认备注');
    return;
  }
  try {
    await api(`/admin/forwards/${proxyTarget.value.id}/proxy-confirm`, {
      method: 'POST',
      body: { ...proxyForm },
    });
    ElMessage.success('代理确认完成');
    proxyVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function cancelRow(row) {
  try {
    await ElMessageBox.confirm('确认作废该待确认合约？', '提示');
    await api(`/admin/forwards/${row.id}/cancel`, { method: 'POST', body: { reason: 'Broker 作废' } });
    ElMessage.success('已作废');
    await load();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e.message || '操作失败');
  }
}

async function settleBatch() {
  try {
    const r = await api('/admin/forwards/settle-batch', { method: 'POST', body: {} });
    const rows = r.data || [];
    const okRows = rows.filter((x) => x.ok);
    const failRows = rows.filter((x) => !x.ok);
    if (!rows.length) {
      ElMessage.info('无可结算合约');
    } else if (!failRows.length) {
      ElMessage.success(`批结算成功 ${okRows.length} 笔`);
    } else {
      const detail = failRows
        .map((x) => `#${x.contract_id}: ${x.reason || '失败'}`)
        .slice(0, 12)
        .join('\n');
      await ElMessageBox.alert(
        `成功 ${okRows.length} 笔，跳过/失败 ${failRows.length} 笔\n\n${detail}`,
        '批结算结果',
        { confirmButtonText: '知道了' },
      );
    }
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function expireConfirms() {
  try {
    const r = await api('/admin/forwards/expire-confirms', { method: 'POST' });
    ElMessage.success(`超时取消 ${r.data?.cancelled || 0} 笔`);
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

const statusLabel = computed(() => ({
  pending_confirm: '待确认',
  open: '持仓中',
  delivery_pending: '交割中',
  settled: '已结算',
  cancelled: '已取消',
  delivered: '已交割',
  draft: '草稿',
}));

function confirmMark(at) {
  return at ? '已确认' : '待确认';
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap">
      <h2>远期合约台</h2>
      <div style="display: flex; gap: 8px">
        <el-button @click="expireConfirms">扫描超时确认</el-button>
        <el-button type="warning" @click="settleBatch">到期批结算</el-button>
        <el-button type="primary" @click="openCreate">开仓登记</el-button>
      </div>
    </div>
    <el-table :data="list" style="margin-top: 12px">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="指数" :formatter="(r) => r.index?.code" width="100" />
      <el-table-column label="买方" :formatter="(r) => userLabel(r.buyer)" min-width="140" />
      <el-table-column label="卖方" :formatter="(r) => userLabel(r.seller)" min-width="140" />
      <el-table-column prop="strike_price" label="X" width="90" />
      <el-table-column prop="qty" label="数量" width="80" />
      <el-table-column prop="expiry_date" label="到期日" width="120" />
      <el-table-column label="买方确认" width="90">
        <template #default="{ row }">{{ confirmMark(row.buyer_confirmed_at) }}</template>
      </el-table-column>
      <el-table-column label="卖方确认" width="90">
        <template #default="{ row }">{{ confirmMark(row.seller_confirmed_at) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">{{ statusLabel[row.status] || row.status }}</template>
      </el-table-column>
      <el-table-column label="浮动盈亏" min-width="140">
        <template #default="{ row }">
          <span v-if="row.mtm">{{ row.mtm.signed_amount }}（{{ row.mtm.note }}）</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending_confirm'">
            <el-button link type="primary" @click="openProxy(row)">代理确认</el-button>
            <el-button link type="danger" @click="cancelRow(row)">作废</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" title="开仓登记" width="560px">
      <el-form label-width="100px">
        <el-form-item label="指数">
          <el-select v-model="form.index_id" style="width: 100%">
            <el-option
              v-for="i in indices"
              :key="i.id"
              :label="
                i.latest_published
                  ? `${i.code} ${i.name}（S=${i.latest_published.settle_price}）`
                  : `${i.code} ${i.name}（无已发布 S）`
              "
              :value="i.id"
              :disabled="i.status !== 'active' || !i.latest_published"
            />
          </el-select>
          <div v-if="form.index_id && !canOpenSelected" style="color: #f56c6c; font-size: 12px; margin-top: 4px">
            该指数尚无已发布结算价，请先到「价格指数」发布后再开仓
          </div>
        </el-form-item>
        <el-form-item label="买方">
          <el-select v-model="form.buyer_id" filterable style="width: 100%">
            <el-option v-for="u in customers" :key="u.id" :label="userLabel(u)" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="卖方">
          <el-select v-model="form.seller_id" filterable style="width: 100%">
            <el-option v-for="u in customers" :key="'s' + u.id" :label="userLabel(u)" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="锁价 X"><el-input-number v-model="form.strike_price" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="form.qty" :min="0.0001" :precision="4" /></el-form-item>
        <el-form-item label="单位"><el-input v-model="form.unit" /></el-form-item>
        <el-form-item label="到期日">
          <el-date-picker v-model="form.expiry_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.note" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="!canOpenSelected" @click="create">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="proxyVisible" title="代理确认" width="440px">
      <el-form label-width="90px">
        <el-form-item label="代谁确认">
          <el-radio-group v-model="proxyForm.side">
            <el-radio label="buyer">买方</el-radio>
            <el-radio label="seller">卖方</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="proxyForm.note" type="textarea" placeholder="必填：线下沟通依据" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="proxyVisible = false">取消</el-button>
        <el-button type="primary" @click="doProxy">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

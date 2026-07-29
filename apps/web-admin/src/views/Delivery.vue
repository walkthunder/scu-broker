<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api, getUser } from '../api';

const tab = ref('orders');
const channels = ref([]);
const whitelists = ref([]);
const orders = ref([]);
const customers = ref([]);
const suppliers = ref([]);
const skus = ref([]);

const channelForm = reactive({ name: '', supplier_id: null, sku_id: null });
const channelVisible = ref(false);
const wlForm = reactive({ user_id: null, active: true, note: '' });
const wlVisible = ref(false);
const isAdmin = computed(() => getUser()?.role === 'admin');

const orderStatusLabel = {
  pending: '待审核',
  approved: '已批准',
  in_delivery: '交割中',
  done: '已交割',
  reconciled: '已对账',
  rejected: '已驳回',
  cancelled: '已取消',
};

async function load() {
  try {
    const [c, w, o, u, s, sk] = await Promise.all([
      api('/admin/delivery-channels'),
      api('/admin/delivery-whitelists'),
      api('/admin/delivery-orders'),
      api('/admin/customers'),
      api('/admin/suppliers'),
      api('/admin/skus'),
    ]);
    channels.value = c.data || [];
    whitelists.value = w.data || [];
    orders.value = o.data || [];
    customers.value = u.data || [];
    suppliers.value = s.data || [];
    skus.value = sk.data || [];
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  }
}

onMounted(load);

function suggestChannelName() {
  const sup = suppliers.value.find((s) => s.id === channelForm.supplier_id);
  const sku = skus.value.find((s) => s.id === channelForm.sku_id);
  if (!sup || !sku) return;
  const left = sup.display_name || sup.name;
  channelForm.name = `${left}·${sku.name}`;
}

function openChannel() {
  Object.assign(channelForm, {
    name: '',
    supplier_id: suppliers.value[0]?.id || null,
    sku_id: skus.value.find((s) => s.status === 'active')?.id || skus.value[0]?.id || null,
  });
  suggestChannelName();
  channelVisible.value = true;
}

function openWl() {
  Object.assign(wlForm, {
    user_id: customers.value[0]?.id || null,
    active: true,
    note: '试运行白名单',
  });
  wlVisible.value = true;
}

async function saveChannel() {
  if (!channelForm.supplier_id || !channelForm.sku_id || !String(channelForm.name || '').trim()) {
    ElMessage.warning('请填写名称并选择供应商、SKU');
    return;
  }
  try {
    await api('/admin/delivery-channels', { method: 'POST', body: { ...channelForm } });
    ElMessage.success('通道已创建');
    channelVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function toggleChannel(row) {
  try {
    await api(`/admin/delivery-channels/${row.id}`, {
      method: 'PUT',
      body: { active: !row.active },
    });
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function saveWl() {
  if (!wlForm.user_id) {
    ElMessage.warning('请选择账户');
    return;
  }
  try {
    await api('/admin/delivery-whitelists', { method: 'POST', body: { ...wlForm } });
    ElMessage.success('白名单已更新');
    wlVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function approve(row) {
  try {
    await api(`/admin/delivery-orders/${row.id}/approve`, { method: 'POST', body: {} });
    ElMessage.success('已批准');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function reject(row) {
  try {
    await api(`/admin/delivery-orders/${row.id}/reject`, {
      method: 'POST',
      body: { reason: '运营驳回' },
    });
    ElMessage.success('已驳回');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function complete(row) {
  try {
    await api(`/admin/delivery-orders/${row.id}/complete`, { method: 'POST' });
    ElMessage.success('交割完成');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function start(row) {
  try {
    await api(`/admin/delivery-orders/${row.id}/start`, { method: 'POST', body: {} });
    ElMessage.success('已进入交割中');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function reconcile(row) {
  try {
    await api(`/admin/delivery-orders/${row.id}/reconcile`, {
      method: 'POST',
      body: { partner_pay_amount: 0 },
    });
    ElMessage.success('已对账');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function markDefault(row) {
  try {
    await api(`/admin/delivery-orders/${row.id}/default`, {
      method: 'POST',
      body: { reason: '运营标记违约', blacklist: false },
    });
    ElMessage.success('已违约处置');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

const userLabel = (u) =>
  u ? `${u.company_name || u.name || '用户'} (#${u.id})` : '';
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <h2>实物交割</h2>
      <el-radio-group v-model="tab" size="small">
        <el-radio-button label="orders">工单</el-radio-button>
        <el-radio-button label="channels">通道</el-radio-button>
        <el-radio-button label="whitelist">白名单</el-radio-button>
      </el-radio-group>
    </div>

    <template v-if="tab === 'orders'">
      <el-table :data="orders" style="margin-top: 12px">
        <el-table-column prop="id" label="工单" width="70" />
        <el-table-column prop="contract_id" label="合约" width="80" />
        <el-table-column label="通道" :formatter="(r) => r.channel?.name" />
        <el-table-column label="申请人" :formatter="(r) => userLabel(r.requester)" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ orderStatusLabel[row.status] || row.status }}</template>
        </el-table-column>
        <el-table-column label="操作" width="320">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button link type="primary" @click="approve(row)">批准</el-button>
              <el-button link type="danger" @click="reject(row)">驳回</el-button>
            </template>
            <el-button
              v-if="row.status === 'approved'"
              link
              type="warning"
              @click="start(row)"
            >开始交割</el-button>
            <el-button
              v-if="row.status === 'approved' || row.status === 'in_delivery'"
              link
              type="success"
              @click="complete(row)"
            >完成交割</el-button>
            <el-button
              v-if="row.status === 'done' || row.status === 'in_delivery'"
              link
              @click="reconcile(row)"
            >对账</el-button>
            <el-button
              v-if="isAdmin && !['reconciled', 'rejected'].includes(row.status)"
              link
              type="danger"
              @click="markDefault(row)"
            >违约</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else-if="tab === 'channels'">
      <el-button
        v-if="isAdmin"
        type="primary"
        style="margin-top: 12px"
        @click="openChannel"
      >新建通道</el-button>
      <el-table :data="channels" style="margin-top: 12px">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="名称" />
        <el-table-column label="供应商" :formatter="(r) => r.supplier?.display_name || r.supplier?.name" />
        <el-table-column label="SKU" :formatter="(r) => r.sku?.name" />
        <el-table-column label="启用" width="80">
          <template #default="{ row }">{{ row.active ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button v-if="isAdmin" link @click="toggleChannel(row)">{{ row.active ? '停用' : '启用' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else>
      <el-button type="primary" style="margin-top: 12px" @click="openWl">开通白名单</el-button>
      <el-table :data="whitelists" style="margin-top: 12px">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="账户" :formatter="(r) => userLabel(r.user)" />
        <el-table-column label="启用" width="80">
          <template #default="{ row }">{{ row.active ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column prop="note" label="备注" />
      </el-table>
    </template>

    <el-dialog v-model="channelVisible" title="新建交割通道" width="480px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="供应商" required>
          <el-select
            v-model="channelForm.supplier_id"
            filterable
            style="width: 100%"
            @change="suggestChannelName"
          >
            <el-option v-for="s in suppliers" :key="s.id" :label="s.display_name || s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="SKU" required>
          <el-select
            v-model="channelForm.sku_id"
            filterable
            style="width: 100%"
            @change="suggestChannelName"
          >
            <el-option v-for="s in skus" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="channelForm.name" placeholder="自动生成，可改" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="channelVisible = false">取消</el-button>
        <el-button type="primary" @click="saveChannel">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="wlVisible" title="开通白名单" width="480px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="账户" required>
          <el-select v-model="wlForm.user_id" filterable style="width: 100%">
            <el-option v-for="u in customers" :key="u.id" :label="userLabel(u)" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用"><el-switch v-model="wlForm.active" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="wlForm.note" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="wlVisible = false">取消</el-button>
        <el-button type="primary" @click="saveWl">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref([]);
const customers = ref([]);
const visible = ref(false);
const form = reactive({
  order_id: null,
  type: '客户付款',
  amount: 0,
  method: '对公',
  note: '',
});
const deposit = reactive({
  user_id: null,
  amount: 100000,
  note: '运营入金',
});
const ledgerPreview = ref(null);

async function load() {
  list.value = (await api('/admin/payments')).data;
  customers.value = (await api('/admin/customers')).data || [];
}
onMounted(load);

function openPay(row, type) {
  form.order_id = row.order_id;
  form.type = type;
  form.amount = type === '赔付' ? 0 : row.receivable;
  form.method = '对公';
  form.note = '';
  visible.value = true;
}

async function save() {
  try {
    await api('/admin/payments', { method: 'POST', body: form });
    ElMessage.success('已记账');
    visible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function loadLedger() {
  if (!deposit.user_id) {
    ledgerPreview.value = null;
    return;
  }
  try {
    ledgerPreview.value = (await api(`/frd/ledger/${deposit.user_id}`)).data;
  } catch (e) {
    ledgerPreview.value = null;
    ElMessage.error(e.message);
  }
}

async function doDeposit() {
  try {
    if (!deposit.user_id || !(deposit.amount > 0)) {
      ElMessage.warning('请选择客户并填写金额');
      return;
    }
    await api('/frd/ledger/deposit', {
      method: 'POST',
      body: {
        user_id: deposit.user_id,
        amount: deposit.amount,
        note: deposit.note,
      },
    });
    ElMessage.success('入金成功（FRD 账本）');
    await loadLedger();
  } catch (e) {
    ElMessage.error(e.message);
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>财务管理</h2>
      <p class="page-desc">RFQ 订单收付款 · FRD 衍生品账本入金（挂单/预售/权益资金）</p>
    </div>

    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>FRD 账本入金</template>
      <el-form inline>
        <el-form-item label="客户">
          <el-select
            v-model="deposit.user_id"
            filterable
            style="width: 220px"
            placeholder="选择客户"
            @change="loadLedger"
          >
            <el-option
              v-for="c in customers"
              :key="c.id"
              :label="`${c.company_name || c.name || c.email} (#${c.id})`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="deposit.amount" :min="1" :precision="2" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="deposit.note" style="width: 160px" /></el-form-item>
        <el-button type="primary" @click="doDeposit">入金</el-button>
      </el-form>
      <p v-if="ledgerPreview" style="margin: 8px 0 0; color: var(--el-text-color-secondary); font-size: 13px">
        可用 {{ Number(ledgerPreview.available || 0).toLocaleString() }} · 冻结
        {{ Number(ledgerPreview.frozen || 0).toLocaleString() }}
      </p>
    </el-card>

    <el-card shadow="never">
      <template #header>RFQ 订单收付款</template>
      <el-table :data="list" size="small">
        <el-table-column prop="order_id" label="订单号" width="90" />
        <el-table-column label="客户" :formatter="(row) => row.customer?.company_name || row.customer?.name" />
        <el-table-column prop="receivable" label="应收客户" />
        <el-table-column prop="payable" label="应付供应商" />
        <el-table-column prop="received" label="实收" />
        <el-table-column prop="paid" label="实付" />
        <el-table-column prop="penalty" label="赔付" />
        <el-table-column prop="order_status" label="订单状态" width="100" />
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <el-button link type="primary" @click="openPay(row, '客户付款')">收款</el-button>
            <el-button link type="primary" @click="openPay(row, '供应商放款')">放款</el-button>
            <el-button link type="danger" @click="openPay(row, '赔付')">赔付</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="visible" title="记一笔" width="420px">
      <el-form label-width="90px">
        <el-form-item label="订单">#{{ form.order_id }}</el-form-item>
        <el-form-item label="类型"><el-input v-model="form.type" disabled /></el-form-item>
        <el-form-item label="金额"><el-input-number v-model="form.amount" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="方式">
          <el-select v-model="form.method">
            <el-option value="对公" /><el-option value="支付宝" /><el-option value="微信" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.note" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

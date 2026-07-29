<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api, getToken } from '../api';

const data = ref(null);
const loading = ref(false);
const params = ref({});

async function load() {
  loading.value = true;
  try {
    data.value = (await api('/frd/risk/overview')).data;
    const raw = { ...(data.value?.params || {}) };
    for (const k of Object.keys(raw)) {
      const n = Number(raw[k]);
      raw[k] = Number.isFinite(n) && String(raw[k]).trim() !== '' ? n : raw[k];
    }
    params.value = raw;
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

async function saveParams() {
  try {
    for (const [key, value] of Object.entries(params.value)) {
      if (String(data.value?.params?.[key] ?? '') === String(value ?? '')) continue;
      await api(`/frd/platform-config/${key}`, { method: 'PUT', body: { value } });
    }
    ElMessage.success('风控参数已保存');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function runJobs(kind) {
  try {
    await api(`/frd/jobs/${kind}`, { method: 'POST', body: {} });
    ElMessage.success('已执行');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function exportBulletin() {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const base = import.meta.env.VITE_API_BASE || '/api';
  fetch(`${base}/frd/price-bulletins/${date}/export.html`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('导出失败');
      return r.text();
    })
    .then((html) => {
      const w = window.open('', '_blank');
      if (!w) throw new Error('请允许弹窗以查看公告');
      w.document.write(html);
      w.document.close();
    })
    .catch((e) => ElMessage.error(e.message));
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <div class="page-head">
      <h2>风控与作业</h2>
      <p class="page-desc">认沽资金池、追保缺口、平台限额；定时发布预备与过期清理</p>
    </div>
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>认沽资金池</template>
          <p>余额 {{ data?.put_pool?.pool_balance?.toLocaleString?.() || '—' }}</p>
          <p>名义敞口 {{ data?.put_pool?.notional?.toLocaleString?.() || '—' }}</p>
          <p>
            覆盖倍数
            {{ data?.put_pool?.coverage == null ? '—' : Number(data.put_pool.coverage).toFixed(2) }}
          </p>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>限额 / 开关</template>
          <p>单客名义上限 {{ data?.limits?.customer_limit_notional?.toLocaleString?.() }}</p>
          <p>全平台名义上限 {{ data?.limits?.platform_limit_notional?.toLocaleString?.() }}</p>
          <el-form label-width="120px" size="small" style="margin-top: 8px">
            <el-form-item label="维持保证金%">
              <el-input v-model="params.margin_maintain_pct" />
            </el-form-item>
            <el-form-item label="初始保证金%">
              <el-input v-model="params.margin_initial_pct" />
            </el-form-item>
            <el-form-item label="权益开关">
              <el-select v-model="params.rights_enabled">
                <el-option :value="1" label="开启" />
                <el-option :value="0" label="关闭" />
              </el-select>
            </el-form-item>
            <el-button type="primary" size="small" @click="saveParams">保存</el-button>
          </el-form>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>作业</template>
          <el-button size="small" @click="runJobs('daily-publish-prep')">发布预备</el-button>
          <el-button size="small" @click="runJobs('margin-monitor')">盯市追保</el-button>
          <el-button size="small" @click="runJobs('mtm-statements')">生成盯市单</el-button>
          <el-button size="small" @click="runJobs('expire-all')">过期清理</el-button>
          <el-button size="small" @click="exportBulletin">导出今日公告</el-button>
        </el-card>
      </el-col>
    </el-row>
    <el-card shadow="never" style="margin-top: 16px">
      <template #header>欠保合约</template>
      <el-table :data="data?.under_margin || []" size="small">
        <el-table-column prop="contract_id" label="合约" width="80" />
        <el-table-column prop="buyer_id" label="买方" width="80" />
        <el-table-column prop="equity" label="权益" />
        <el-table-column prop="maintain" label="维持" />
        <el-table-column prop="shortfall" label="缺口" />
        <el-table-column prop="available" label="可用" />
      </el-table>
    </el-card>
  </div>
</template>

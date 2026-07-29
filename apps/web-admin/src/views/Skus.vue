<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const UNIT_BY_TYPE = {
  gpu: '小时',
  token: '百万token',
};
const UNIT_OPTIONS = {
  gpu: ['小时', '月'],
  token: ['百万token', '千token'],
};
const NAME_PRESETS = ['H100', 'H800', 'A100', 'A800', 'H100 包月', 'GPT Token', 'DeepSeek Token'];

const list = ref([]);
const visible = ref(false);
const showMore = ref(false);
const form = reactive({
  id: null,
  name: '',
  type: 'gpu',
  unit: '小时',
  spec: '',
  status: 'active',
  is_public: true,
  is_hot: false,
  sort_weight: 0,
  selling_point: '',
  delivery_note: '',
});

const unitOptions = computed(() => UNIT_OPTIONS[form.type] || UNIT_OPTIONS.gpu);

async function load() {
  list.value = (await api('/admin/skus')).data;
}

onMounted(load);

watch(
  () => form.type,
  (t) => {
    if (!visible.value) return;
    const opts = UNIT_OPTIONS[t] || [];
    if (!opts.includes(form.unit)) form.unit = UNIT_BY_TYPE[t] || '小时';
  },
);

function resetForm() {
  Object.assign(form, {
    id: null,
    name: '',
    type: 'gpu',
    unit: '小时',
    spec: '',
    status: 'active',
    is_public: true,
    is_hot: false,
    sort_weight: 0,
    selling_point: '',
    delivery_note: '',
  });
  showMore.value = false;
}

function open(row) {
  if (row) {
    Object.assign(form, {
      id: row.id,
      name: row.name,
      type: row.type || 'gpu',
      unit: row.unit || UNIT_BY_TYPE[row.type] || '小时',
      spec: row.spec || '',
      status: row.status || 'active',
      is_public: row.is_public !== false,
      is_hot: !!row.is_hot,
      sort_weight: row.sort_weight || 0,
      selling_point: row.selling_point || '',
      delivery_note: row.delivery_note || '',
    });
    showMore.value = !!(row.selling_point || row.delivery_note || row.is_hot || row.sort_weight);
  } else {
    resetForm();
  }
  visible.value = true;
}

function applyPreset(name) {
  form.name = name;
  if (/token/i.test(name) || /GPT|DeepSeek/i.test(name)) {
    form.type = 'token';
    form.unit = '百万token';
  } else {
    form.type = 'gpu';
    form.unit = /包月|月/.test(name) ? '月' : '小时';
  }
}

async function save() {
  if (!String(form.name || '').trim()) {
    ElMessage.warning('请填写 SKU 名称');
    return;
  }
  try {
    const body = { ...form, name: String(form.name).trim() };
    let saved;
    if (form.id) {
      saved = (await api(`/admin/skus/${form.id}`, { method: 'PUT', body })).data;
    } else {
      saved = (await api('/admin/skus', { method: 'POST', body })).data;
    }
    ElMessage.success('已保存');
    visible.value = false;
    // 先用返回体更新列表，避免 CDN/缓存导致 load 仍是旧数据
    if (saved?.id) {
      const idx = list.value.findIndex((r) => r.id === saved.id);
      if (idx >= 0) list.value.splice(idx, 1, saved);
      else list.value = [...list.value, saved];
    }
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function typeLabel(t) {
  return t === 'token' ? 'Token' : 'GPU';
}
function statusLabel(s) {
  return s === 'inactive' ? '停用' : '启用';
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <div>
        <h2>SKU 管理</h2>
        <p class="page-desc">新建只需名称；类型与单位会自动匹配，运营信息可后补。</p>
      </div>
      <el-button type="primary" @click="open()">新增 SKU</el-button>
    </div>
    <el-table :data="list" style="margin-top: 12px">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="name" label="名称" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ typeLabel(row.type) }}</template>
      </el-table-column>
      <el-table-column prop="unit" label="单位" width="100" />
      <el-table-column label="前台" width="70">
        <template #default="{ row }">{{ row.is_public !== false ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="热门" width="70">
        <template #default="{ row }">{{ row.is_hot ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column prop="sort_weight" label="权重" width="70" />
      <el-table-column prop="selling_point" label="卖点" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">{{ statusLabel(row.status) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click="open(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="visible"
      :title="form.id ? '编辑 SKU' : '新增 SKU'"
      width="560px"
      destroy-on-close
    >
      <p class="page-desc" style="margin-top: 0; margin-bottom: 14px">
        标 * 为必填。其余有默认值，可不填。
      </p>
      <el-form label-width="100px" @submit.prevent>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如 H100、GPT Token" maxlength="80" />
          <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px">
            <el-button
              v-for="p in NAME_PRESETS"
              :key="p"
              size="small"
              @click="applyPreset(p)"
            >
              {{ p }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio-button value="gpu">GPU 算力</el-radio-button>
            <el-radio-button value="token">Token</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="单位">
          <el-select v-model="form.unit" style="width: 100%" allow-create filterable>
            <el-option v-for="u in unitOptions" :key="u" :label="u" :value="u" />
          </el-select>
        </el-form-item>
        <el-form-item label="规格">
          <el-input v-model="form.spec" placeholder="可选，如 80GB HBM3" />
        </el-form-item>

        <el-divider content-position="left">
          <el-button link type="primary" @click="showMore = !showMore">
            {{ showMore ? '收起运营选项' : '展开运营选项（卖点 / 热门 / 排序…）' }}
          </el-button>
        </el-divider>

        <template v-if="showMore">
          <el-form-item label="卖点">
            <el-input v-model="form.selling_point" maxlength="40" placeholder="可选，前台展示短句" />
          </el-form-item>
          <el-form-item label="交期说明">
            <el-input v-model="form.delivery_note" type="textarea" placeholder="可选" :rows="2" />
          </el-form-item>
          <el-form-item label="排序权重">
            <el-input-number v-model="form.sort_weight" :min="0" />
            <span class="page-desc" style="margin-left: 8px">越大越靠前，默认 0</span>
          </el-form-item>
          <el-form-item label="前台可见">
            <el-switch v-model="form.is_public" />
            <span class="page-desc" style="margin-left: 8px">默认开</span>
          </el-form-item>
          <el-form-item label="首页热门">
            <el-switch v-model="form.is_hot" />
            <span class="page-desc" style="margin-left: 8px">默认关</span>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status" style="width: 160px">
              <el-option label="启用" value="active" />
              <el-option label="停用" value="inactive" />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

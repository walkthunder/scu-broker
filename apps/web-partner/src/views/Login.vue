<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api, setAuth } from '../api';

const router = useRouter();
const form = reactive({ phone: '13900002001', password: 'partner123' });
const apply = reactive({
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  regions: 'shanghai,neimeng,guizhou',
  skus: 'H100,H200,PPU,算力 Token',
  note: '',
});
const loading = ref(false);
const tab = ref('login');

async function submit() {
  loading.value = true;
  try {
    const res = await api('/admin/login', { method: 'POST', body: form });
    if (res.data.user?.role !== 'partner' && res.data.user?.role !== 'admin') {
      throw new Error('请使用伙伴账号登录');
    }
    setAuth(res.data.token, res.data.user);
    ElMessage.success('登录成功');
    router.replace('/');
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

async function submitApply() {
  loading.value = true;
  try {
    await api('/frd/partner/applications', { method: 'POST', body: { ...apply } });
    ElMessage.success('申请已提交，等待运营审核');
    tab.value = 'login';
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card" style="max-width: 440px">
      <div class="login-brand">
        <span class="admin-brand-mark" aria-hidden="true" />
        <div class="login-brand-name">CompriX Partner</div>
      </div>
      <h1 class="login-title">供给伙伴门户</h1>
      <el-radio-group v-model="tab" size="small" style="margin-bottom: 16px">
        <el-radio-button label="login">登录</el-radio-button>
        <el-radio-button label="apply">入驻申请</el-radio-button>
      </el-radio-group>
      <template v-if="tab === 'login'">
        <el-form label-position="top" @submit.prevent="submit">
          <el-form-item label="手机号 / 邮箱">
            <el-input v-model="form.phone" size="large" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" show-password size="large" />
          </el-form-item>
          <el-button type="primary" size="large" :loading="loading" style="width: 100%" @click="submit">
            登录
          </el-button>
        </el-form>
      </template>
      <template v-else>
        <el-form label-position="top">
          <el-form-item label="公司名称" required>
            <el-input v-model="apply.company_name" />
          </el-form-item>
          <el-form-item label="联系人"><el-input v-model="apply.contact_name" /></el-form-item>
          <el-form-item label="电话"><el-input v-model="apply.phone" /></el-form-item>
          <el-form-item label="邮箱"><el-input v-model="apply.email" /></el-form-item>
          <el-form-item label="区域"><el-input v-model="apply.regions" /></el-form-item>
          <el-form-item label="标的"><el-input v-model="apply.skus" /></el-form-item>
          <el-button type="primary" :loading="loading" style="width: 100%" @click="submitApply">
            提交申请
          </el-button>
        </el-form>
      </template>
    </div>
  </div>
</template>

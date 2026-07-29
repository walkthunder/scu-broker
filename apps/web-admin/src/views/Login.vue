<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api, setAuth } from '../api';

const router = useRouter();
const form = reactive({ phone: '13800000000', password: 'admin123' });
const loading = ref(false);

async function submit() {
  loading.value = true;
  try {
    const res = await api('/admin/login', { method: 'POST', body: form });
    setAuth(res.data.token, res.data.user);
    ElMessage.success('登录成功');
    router.replace('/');
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span class="admin-brand-mark" aria-hidden="true" />
        <div class="login-brand-name">CompriX</div>
      </div>
      <h1 class="login-title">管理后台</h1>
      <p class="login-desc">Broker / Admin 登录。线下谈价，系统记录状态与账务。</p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="手机号 / 邮箱">
          <el-input
            v-model="form.phone"
            placeholder="13800000000 或 admin@comprix.local"
            size="large"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password size="large" />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          :loading="loading"
          style="width: 100%; margin-top: 8px"
          @click="submit"
        >
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

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
  <div style="min-height: 100vh; display: grid; place-items: center; background: #f5f7fa">
    <el-card style="width: 380px">
      <h2 style="margin: 0 0 16px">CompriX 管理后台</h2>
      <el-form @submit.prevent="submit">
        <el-form-item label="手机号">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-button type="primary" :loading="loading" style="width: 100%" @click="submit">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

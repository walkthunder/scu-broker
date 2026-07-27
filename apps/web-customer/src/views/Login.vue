<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, setAuth, isLoggedIn } from '../api';

const route = useRoute();
const router = useRouter();
const phone = ref('');
const code = ref('');
const name = ref('');
const company_name = ref('');
const msg = ref('');
const err = ref('');
const sending = ref(false);
const loggingIn = ref(false);

onMounted(() => {
  if (isLoggedIn.value) {
    router.replace(route.query.redirect || '/mine');
  }
});

async function sendOtp() {
  err.value = '';
  msg.value = '';
  if (!/^1\d{10}$/.test(phone.value.trim())) {
    err.value = '请输入正确的11位手机号';
    return;
  }
  sending.value = true;
  try {
    const res = await api('/customer/otp', { method: 'POST', body: { phone: phone.value.trim() } });
    msg.value = res.data?.dev_otp
      ? `验证码已发送（开发环境：${res.data.dev_otp}）`
      : '验证码已发送';
  } catch (e) {
    err.value = e.message;
  } finally {
    sending.value = false;
  }
}

async function login() {
  err.value = '';
  if (!phone.value.trim() || !code.value.trim()) {
    err.value = '请填写手机号和验证码';
    return;
  }
  loggingIn.value = true;
  try {
    const res = await api('/customer/login', {
      method: 'POST',
      body: {
        phone: phone.value.trim(),
        code: code.value.trim(),
        name: name.value || undefined,
        company_name: company_name.value || undefined,
      },
    });
    setAuth(res.data.token, res.data.user);
    router.replace(route.query.redirect || '/mine');
  } catch (e) {
    err.value = e.message;
  } finally {
    loggingIn.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="border-b border-slate-300 pb-4">
      <h1 class="page-title">登录</h1>
      <p class="page-desc">手机号验证码登录，无需设置密码。</p>
    </div>
    <form class="panel mt-5 space-y-4 p-5" @submit.prevent="login">
      <label class="field-label">
        手机号
        <input v-model="phone" class="mt-1.5 w-full font-mono" maxlength="11" inputmode="numeric" autocomplete="tel" />
      </label>
      <label class="field-label">
        验证码
        <div class="mt-1.5 flex gap-2">
          <input v-model="code" class="w-full font-mono" maxlength="6" inputmode="numeric" autocomplete="one-time-code" />
          <button type="button" class="btn-secondary shrink-0 !px-3" :disabled="sending" @click="sendOtp">
            {{ sending ? '发送中…' : '获取验证码' }}
          </button>
        </div>
      </label>
      <label class="field-label">
        姓名（选填）
        <input v-model="name" class="mt-1.5 w-full" autocomplete="name" />
      </label>
      <label class="field-label">
        公司名称（选填）
        <input v-model="company_name" class="mt-1.5 w-full" autocomplete="organization" />
      </label>
      <p v-if="msg" class="text-sm text-slate-600">{{ msg }}</p>
      <p v-if="err" class="text-sm text-red-700">{{ err }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="loggingIn">
        {{ loggingIn ? '登录中…' : '登录' }}
      </button>
    </form>
  </div>
</template>

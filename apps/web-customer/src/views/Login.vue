<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, setAuth, isLoggedIn } from '../api';

const route = useRoute();
const router = useRouter();
const mode = ref('login'); // login | register | forgot
const email = ref('');
const password = ref('');
const password2 = ref('');
const code = ref('');
const name = ref('');
const company_name = ref('');
const msg = ref('');
const err = ref('');
const sending = ref(false);
const busy = ref(false);

onMounted(() => {
  if (isLoggedIn.value) {
    router.replace(route.query.redirect || '/mine');
  }
});

function switchMode(m) {
  mode.value = m;
  err.value = '';
  msg.value = '';
  code.value = '';
  password.value = '';
  password2.value = '';
}

async function sendOtp() {
  err.value = '';
  msg.value = '';
  const em = email.value.trim().toLowerCase();
  if (!em.includes('@')) {
    err.value = '请输入正确邮箱';
    return;
  }
  sending.value = true;
  try {
    const path =
      mode.value === 'forgot' ? '/customer/password/forgot-otp' : '/customer/register/otp';
    const res = await api(path, { method: 'POST', body: { email: em } });
    msg.value = res.data?.dev_otp
      ? `验证码已发送（开发环境：${res.data.dev_otp}）`
      : '验证码已发送，请查收邮箱';
  } catch (e) {
    err.value = e.message;
  } finally {
    sending.value = false;
  }
}

async function submitLogin() {
  err.value = '';
  busy.value = true;
  try {
    const account = email.value.trim();
    const body = /^1\d{10}$/.test(account)
      ? { phone: account, password: password.value }
      : { email: account.toLowerCase(), password: password.value };
    const res = await api('/customer/login', {
      method: 'POST',
      body,
    });
    setAuth(res.data.token, res.data.user);
    router.replace(route.query.redirect || '/mine');
  } catch (e) {
    err.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function submitRegister() {
  err.value = '';
  if (password.value !== password2.value) {
    err.value = '两次密码不一致';
    return;
  }
  busy.value = true;
  try {
    const res = await api('/customer/register', {
      method: 'POST',
      body: {
        email: email.value.trim().toLowerCase(),
        password: password.value,
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
    busy.value = false;
  }
}

async function submitReset() {
  err.value = '';
  if (password.value !== password2.value) {
    err.value = '两次密码不一致';
    return;
  }
  busy.value = true;
  try {
    await api('/customer/password/reset', {
      method: 'POST',
      body: {
        email: email.value.trim().toLowerCase(),
        code: code.value.trim(),
        password: password.value,
      },
    });
    msg.value = '密码已重置，请登录';
    switchMode('login');
  } catch (e) {
    err.value = e.message;
  } finally {
    busy.value = false;
  }
}

function onSubmit() {
  if (mode.value === 'login') return submitLogin();
  if (mode.value === 'register') return submitRegister();
  return submitReset();
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="border-b border-slate-300 pb-4">
      <h1 class="page-title">
        {{ mode === 'login' ? '登录' : mode === 'register' ? '注册' : '重置密码' }}
      </h1>
      <p class="page-desc">
        {{
          mode === 'login'
            ? '支持邮箱或手机号 + 密码登录。'
            : '注册/重置使用邮箱验证码。开发环境验证码见提示（默认 123456）。'
        }}
      </p>
    </div>

    <div class="mt-4 flex gap-2 text-sm">
      <button
        type="button"
        class="rounded px-3 py-1.5"
        :class="mode === 'login' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="switchMode('login')"
      >
        登录
      </button>
      <button
        type="button"
        class="rounded px-3 py-1.5"
        :class="mode === 'register' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="switchMode('register')"
      >
        注册
      </button>
      <button
        type="button"
        class="rounded px-3 py-1.5"
        :class="mode === 'forgot' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'"
        @click="switchMode('forgot')"
      >
        忘记密码
      </button>
    </div>

    <form class="panel mt-4 space-y-4 p-5" @submit.prevent="onSubmit">
      <label class="field-label">
        {{ mode === 'login' ? '邮箱或手机号' : '邮箱' }}
        <input
          v-model="email"
          :type="mode === 'login' ? 'text' : 'email'"
          class="mt-1.5 w-full font-mono"
          autocomplete="username"
          required
        />
      </label>

      <label v-if="mode !== 'login'" class="field-label">
        验证码
        <div class="mt-1.5 flex gap-2">
          <input
            v-model="code"
            class="w-full font-mono"
            maxlength="6"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
          />
          <button type="button" class="btn-secondary shrink-0 !px-3" :disabled="sending" @click="sendOtp">
            {{ sending ? '发送中…' : '获取验证码' }}
          </button>
        </div>
      </label>

      <label class="field-label">
        {{ mode === 'forgot' ? '新密码' : '密码' }}
        <input
          v-model="password"
          type="password"
          class="mt-1.5 w-full"
          autocomplete="current-password"
          minlength="8"
          required
        />
      </label>

      <label v-if="mode !== 'login'" class="field-label">
        确认密码
        <input
          v-model="password2"
          type="password"
          class="mt-1.5 w-full"
          autocomplete="new-password"
          minlength="8"
          required
        />
      </label>

      <template v-if="mode === 'register'">
        <label class="field-label">
          姓名（选填）
          <input v-model="name" class="mt-1.5 w-full" autocomplete="name" />
        </label>
        <label class="field-label">
          公司名称（选填）
          <input v-model="company_name" class="mt-1.5 w-full" autocomplete="organization" />
        </label>
      </template>

      <p v-if="msg" class="text-sm text-slate-600">{{ msg }}</p>
      <p v-if="err" class="text-sm text-red-700">{{ err }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="busy">
        {{
          busy
            ? '提交中…'
            : mode === 'login'
              ? '登录'
              : mode === 'register'
                ? '注册并登录'
                : '重置密码'
        }}
      </button>
    </form>
  </div>
</template>

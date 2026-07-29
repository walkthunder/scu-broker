<script setup>
import { ref } from 'vue';
import { api, currentUser } from '../api';

const oldPassword = ref('');
const newPassword = ref('');
const newPassword2 = ref('');
const msg = ref('');
const err = ref('');
const busy = ref(false);

async function submit() {
  err.value = '';
  msg.value = '';
  if (newPassword.value !== newPassword2.value) {
    err.value = '两次新密码不一致';
    return;
  }
  busy.value = true;
  try {
    await api('/customer/password/change', {
      method: 'POST',
      body: {
        old_password: oldPassword.value,
        new_password: newPassword.value,
      },
    });
    msg.value = '密码已修改';
    oldPassword.value = '';
    newPassword.value = '';
    newPassword2.value = '';
  } catch (e) {
    err.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-8">
    <h1 class="page-title">账号</h1>
    <p class="page-desc">
      {{ currentUser?.email || '—' }}
      <span v-if="currentUser?.name" class="text-slate-500"> · {{ currentUser.name }}</span>
    </p>

    <form class="panel mt-6 space-y-4 p-5" @submit.prevent="submit">
      <h2 class="text-sm font-medium text-slate-200">修改密码</h2>
      <label class="field-label">
        旧密码
        <input v-model="oldPassword" type="password" class="mt-1.5 w-full" required minlength="8" />
      </label>
      <label class="field-label">
        新密码
        <input v-model="newPassword" type="password" class="mt-1.5 w-full" required minlength="8" />
      </label>
      <label class="field-label">
        确认新密码
        <input v-model="newPassword2" type="password" class="mt-1.5 w-full" required minlength="8" />
      </label>
      <p v-if="msg" class="text-sm text-emerald-400">{{ msg }}</p>
      <p v-if="err" class="text-sm text-rose-400">{{ err }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="busy">
        {{ busy ? '提交中…' : '保存' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
const router = useRouter();
</script>

<template>
  <div class="mx-auto max-w-lg px-4 py-16 text-center">
    <p class="font-mono text-xs tracking-wider text-amber-500 uppercase">Submitted</p>
    <h1 class="mt-3 text-2xl font-semibold text-slate-50">询价已提交</h1>
    <p class="mt-3 text-sm text-slate-400">
      Broker 通常在 2–6 小时内联系您。正式报价发出后，您可在工作台确认（24 小时有效）。
    </p>
    <div class="mt-8 flex justify-center gap-3">
      <button type="button" class="btn-primary" @click="router.push('/mine')">查看工作台</button>
      <button type="button" class="btn-secondary" @click="router.push('/')">返回行情</button>
    </div>
  </div>
</template>

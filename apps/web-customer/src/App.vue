<script setup>
import { useRouter, useRoute } from 'vue-router';
import { currentUser, clearAuth } from './api';

const router = useRouter();
const route = useRoute();
const user = currentUser;

function logout() {
  clearAuth();
  router.push('/');
}

function navClass(name) {
  const active =
    route.name === name ||
    (name === 'mine' && ['rfq-detail', 'order-detail'].includes(route.name)) ||
    (name === 'prices' && route.name === 'sku-detail');
  return [
    'cursor-pointer whitespace-nowrap border-b-2 px-1 py-3 text-sm transition-colors',
    active ? 'border-amber-500 font-medium text-slate-100' : 'border-transparent text-slate-400 hover:text-slate-200',
  ];
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="sticky top-0 z-30 border-b border-slate-700 bg-slate-950/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-stretch justify-between gap-6 px-4">
        <div class="flex items-center gap-8">
          <router-link to="/" class="flex shrink-0 items-center gap-2 py-3">
            <span class="inline-block h-5 w-1 bg-amber-500" aria-hidden="true" />
            <span class="font-mono text-sm font-semibold tracking-[0.12em] text-slate-100 uppercase">
              CompriX
            </span>
          </router-link>
          <nav class="hidden items-center gap-5 sm:flex">
            <router-link :to="{ name: 'prices' }" :class="navClass('prices')">行情</router-link>
            <router-link :to="{ name: 'rfq' }" :class="navClass('rfq')">询价</router-link>
            <router-link :to="{ name: 'mine' }" :class="navClass('mine')">工作台</router-link>
            <router-link :to="{ name: 'about' }" :class="navClass('about')">保障</router-link>
          </nav>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <template v-if="user">
            <span class="hidden font-mono text-xs text-slate-500 sm:inline">{{ user.phone }}</span>
            <button type="button" class="btn-ghost !px-2 !py-1 text-xs" @click="logout">退出</button>
          </template>
          <router-link v-else to="/login" class="btn-primary !py-1.5 !text-xs">登录</router-link>
        </div>
      </div>
    </header>
    <main>
      <router-view :key="route.fullPath" />
    </main>
  </div>
</template>

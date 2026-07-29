<script setup>
import { useRouter, useRoute } from 'vue-router';
import { currentUser, clearAuth } from './api';

const router = useRouter();
const route = useRoute();
const user = currentUser;

/** 每个主导航互斥：子页只归属一个入口，避免双下划线 */
const NAV_MATCH = {
  prices: ['prices', 'sku-detail'],
  indices: ['indices'],
  rfq: ['rfq', 'rfq-success'],
  forwards: ['forwards'],
  bills: ['bills'],
  mine: ['mine', 'rfq-detail', 'order-detail', 'account'],
  about: ['about'],
};

function logout() {
  clearAuth();
  router.push('/');
}

function navClass(name) {
  const active = (NAV_MATCH[name] || [name]).includes(route.name);
  return [
    'cursor-pointer whitespace-nowrap border-b-2 px-1 py-3 text-sm transition-colors',
    active
      ? 'border-amber-500 font-medium text-slate-100'
      : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200',
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
          <nav class="flex max-w-[58vw] items-center gap-3 overflow-x-auto sm:max-w-none sm:gap-5">
            <router-link
              :to="{ name: 'prices' }"
              active-class=""
              exact-active-class=""
              :class="navClass('prices')"
            >
              行情
            </router-link>
            <router-link
              :to="{ name: 'indices' }"
              active-class=""
              exact-active-class=""
              :class="navClass('indices')"
            >
              指数
            </router-link>
            <router-link
              :to="{ name: 'rfq' }"
              active-class=""
              exact-active-class=""
              :class="navClass('rfq')"
            >
              询价
            </router-link>
            <router-link
              :to="{ name: 'forwards' }"
              active-class=""
              exact-active-class=""
              :class="navClass('forwards')"
            >
              持仓
            </router-link>
            <router-link
              :to="{ name: 'bills' }"
              active-class=""
              exact-active-class=""
              :class="navClass('bills')"
            >
              账单
            </router-link>
            <router-link
              :to="{ name: 'mine' }"
              active-class=""
              exact-active-class=""
              :class="navClass('mine')"
            >
              工作台
            </router-link>
            <router-link
              :to="{ name: 'about' }"
              active-class=""
              exact-active-class=""
              :class="navClass('about')"
            >
              保障
            </router-link>
          </nav>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <template v-if="user">
            <router-link
              to="/account"
              class="max-w-[9rem] truncate font-mono text-xs text-slate-500 hover:text-slate-300 sm:max-w-none"
            >
              {{ user.email || user.phone }}
            </router-link>
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

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { currentUser, clearAuth } from './api';

const router = useRouter();
const route = useRoute();
const user = currentUser;
const moreOpen = ref(false);

watch(
  () => route.fullPath,
  () => {
    moreOpen.value = false;
  },
);

/** 每个主导航互斥：子页只归属一个入口，避免双下划线 */
const NAV_MATCH = {
  prices: ['prices', 'sku-detail'],
  indices: ['indices'],
  spot: ['spot'],
  rfq: ['rfq', 'rfq-success'],
  forwards: ['forwards'],
  rights: ['rights'],
  console: ['console'],
  bills: ['bills'],
  mine: ['mine', 'rfq-detail', 'order-detail', 'account'],
  about: ['about'],
};

const BOTTOM_TABS = [
  { name: 'prices', label: '行情', to: { name: 'prices' } },
  { name: 'spot', label: '现货', to: { name: 'spot' } },
  { name: 'rfq', label: '询价', to: { name: 'rfq' } },
  { name: 'forwards', label: '预售', to: { name: 'forwards' } },
  { name: 'rights', label: '权益', to: { name: 'rights' } },
  { name: 'console', label: '控制台', to: { name: 'console' } },
];

const MORE_LINKS = [
  { to: '/indices', label: '指数' },
  { to: '/bills', label: '账单' },
  { to: '/mine', label: '订单', auth: true },
  { to: '/about', label: '保障' },
  { to: '/account', label: '账号', auth: true },
];

function isActive(name) {
  return (NAV_MATCH[name] || [name]).includes(route.name);
}

function navClass(name) {
  return [
    'tap-target cursor-pointer whitespace-nowrap border-b-2 px-1 py-3 text-sm transition-colors duration-200',
    isActive(name)
      ? 'border-amber-500 font-medium text-slate-100'
      : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200',
  ];
}

function tabClass(name) {
  return [
    'tap-target flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-200',
    isActive(name) ? 'text-amber-400' : 'text-slate-500',
  ];
}

function logout() {
  moreOpen.value = false;
  clearAuth();
  router.push('/');
}

const showBottomNav = computed(() => route.name !== 'login');
</script>

<template>
  <div class="app-shell min-h-screen bg-slate-950 text-slate-100">
    <header
      class="sticky top-0 z-30 border-b border-slate-700 bg-slate-950/95 backdrop-blur"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4">
        <div class="flex min-w-0 items-center gap-4 md:gap-8">
          <router-link to="/" class="tap-target flex shrink-0 items-center gap-2 py-3">
            <span class="inline-block h-5 w-1 bg-amber-500" aria-hidden="true" />
            <span class="font-mono text-sm font-semibold tracking-[0.12em] text-slate-100 uppercase">
              CompriX
            </span>
          </router-link>
          <!-- 桌面顶栏导航 -->
          <nav class="hidden items-center gap-5 md:flex" aria-label="主导航">
            <router-link
              v-for="t in BOTTOM_TABS"
              :key="t.name"
              :to="t.to"
              active-class=""
              exact-active-class=""
              :class="navClass(t.name)"
            >
              {{ t.label }}
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
              :to="{ name: 'about' }"
              active-class=""
              exact-active-class=""
              :class="navClass('about')"
            >
              保障
            </router-link>
          </nav>
        </div>
        <div class="flex items-center gap-2 text-sm sm:gap-3">
          <template v-if="user">
            <router-link
              to="/account"
              class="tap-target hidden max-w-[10rem] truncate font-mono text-xs text-slate-500 hover:text-slate-300 sm:inline"
            >
              {{ user.email || user.phone }}
            </router-link>
            <button type="button" class="btn-ghost tap-target !px-3 !py-2 text-xs" @click="logout">
              退出
            </button>
          </template>
          <router-link v-else to="/login" class="btn-primary tap-target !py-2 !text-xs">登录</router-link>
          <button
            type="button"
            class="tap-target inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-slate-700 text-slate-300 md:hidden"
            aria-label="更多菜单"
            :aria-expanded="moreOpen"
            @click="moreOpen = !moreOpen"
          >
            <span class="font-mono text-lg leading-none">⋯</span>
          </button>
        </div>
      </div>
      <!-- 移动端更多：账单 / 保障 / 账号 -->
      <div
        v-if="moreOpen"
        class="border-t border-slate-800 bg-slate-900 px-4 py-3 md:hidden"
      >
        <div class="flex flex-wrap gap-2">
          <router-link
            v-for="l in MORE_LINKS"
            :key="l.to"
            :to="l.to"
            class="tap-target rounded border border-slate-700 px-3 py-2 text-sm text-slate-300"
            @click="moreOpen = false"
          >
            {{ l.label }}
          </router-link>
        </div>
      </div>
    </header>

    <main class="app-main" :class="showBottomNav ? 'has-bottom-nav' : ''">
      <router-view :key="route.fullPath" />
    </main>

    <!-- 移动端底栏：≤5 主入口（ui-ux-pro-max） -->
    <nav
      v-if="showBottomNav"
      class="bottom-nav md:hidden"
      aria-label="底部导航"
    >
      <router-link
        v-for="t in BOTTOM_TABS"
        :key="t.name"
        :to="t.to"
        active-class=""
        exact-active-class=""
        :class="tabClass(t.name)"
      >
        <span
          class="h-1 w-4 rounded-full transition-colors duration-200"
          :class="isActive(t.name) ? 'bg-amber-500' : 'bg-transparent'"
          aria-hidden="true"
        />
        <span>{{ t.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

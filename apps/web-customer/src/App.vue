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

/** 移动底栏 ≤5；桌面顶栏再追加控制台/账单/保障 */
const PRIMARY_TABS = [
  { name: 'prices', label: '行情', to: { name: 'prices' } },
  { name: 'spot', label: '现货', to: { name: 'spot' } },
  { name: 'rfq', label: '询价', to: { name: 'rfq' } },
  { name: 'forwards', label: '预售', to: { name: 'forwards' } },
  { name: 'rights', label: '权益', to: { name: 'rights' } },
];

const DESKTOP_EXTRA = [
  { name: 'console', label: '控制台', to: { name: 'console' } },
  { name: 'bills', label: '账单', to: { name: 'bills' } },
  { name: 'about', label: '保障', to: { name: 'about' } },
];

const MORE_LINKS = [
  { to: '/console', label: '控制台', auth: true },
  { to: '/indices', label: '指数' },
  { to: '/bills', label: '账单', auth: true },
  { to: '/mine', label: '订单', auth: true },
  { to: '/about', label: '保障' },
  { to: '/account', label: '账号', auth: true },
];

const moreLinksVisible = computed(() =>
  MORE_LINKS.filter((l) => !l.auth || user.value),
);

function isActive(name) {
  return (NAV_MATCH[name] || [name]).includes(route.name);
}

function navClass(name) {
  return [
    'inline-flex h-14 items-center whitespace-nowrap border-b-2 px-1 text-sm transition-colors duration-200',
    isActive(name)
      ? 'border-amber-500 font-medium text-slate-100'
      : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200',
  ];
}

function tabClass(name) {
  return [
    'flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] transition-colors duration-200',
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
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <div class="flex min-w-0 items-center gap-4 lg:gap-6">
          <router-link to="/" class="flex h-14 shrink-0 items-center gap-2">
            <span class="inline-block h-5 w-1 bg-amber-500" aria-hidden="true" />
            <span class="font-mono text-sm font-semibold tracking-[0.12em] text-slate-100 uppercase">
              CompriX
            </span>
          </router-link>
          <!-- 桌面顶栏：lg 起展示，避免 md 宽度挤爆 -->
          <nav class="hidden items-center gap-4 lg:flex" aria-label="主导航">
            <router-link
              v-for="t in PRIMARY_TABS"
              :key="t.name"
              :to="t.to"
              active-class=""
              exact-active-class=""
              :class="navClass(t.name)"
            >
              {{ t.label }}
            </router-link>
            <router-link
              v-for="t in DESKTOP_EXTRA"
              :key="t.name"
              :to="t.to"
              active-class=""
              exact-active-class=""
              :class="navClass(t.name)"
            >
              {{ t.label }}
            </router-link>
          </nav>
        </div>
        <div class="flex h-14 shrink-0 items-center gap-2 sm:gap-3">
          <template v-if="user">
            <router-link
              to="/account"
              class="hidden h-11 max-w-[14rem] items-center truncate font-mono text-xs leading-none text-slate-500 hover:text-slate-300 sm:inline-flex"
              :title="user.email || user.phone || ''"
            >
              {{ user.email || user.phone }}
            </router-link>
            <button
              type="button"
              class="inline-flex h-11 items-center justify-center rounded-sm px-3 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              @click="logout"
            >
              退出
            </button>
          </template>
          <router-link
            v-else
            to="/login"
            class="inline-flex h-11 items-center justify-center rounded-sm bg-amber-500 px-3 text-xs font-medium text-slate-900 hover:bg-amber-600"
          >
            登录
          </router-link>
          <button
            type="button"
            class="inline-flex h-11 w-11 items-center justify-center rounded border border-slate-700 text-slate-300 lg:hidden"
            aria-label="更多菜单"
            :aria-expanded="moreOpen"
            @click="moreOpen = !moreOpen"
          >
            <span class="font-mono text-lg leading-none">⋯</span>
          </button>
        </div>
      </div>
      <div
        v-if="moreOpen"
        class="border-t border-slate-800 bg-slate-900 px-4 py-3 lg:hidden"
      >
        <div class="flex flex-wrap gap-2">
          <router-link
            v-for="l in moreLinksVisible"
            :key="l.to"
            :to="l.to"
            class="inline-flex min-h-[44px] items-center rounded border border-slate-700 px-3 text-sm text-slate-300"
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

    <nav
      v-if="showBottomNav"
      class="bottom-nav lg:hidden"
      aria-label="底部导航"
    >
      <router-link
        v-for="t in PRIMARY_TABS"
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
        <span class="max-w-full truncate">{{ t.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

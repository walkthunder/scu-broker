<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BrandLogo from './BrandLogo.vue';

const route = useRoute();
const openMenu = ref('');
const mobileOpen = ref(false);
const query = ref('');

/*
产品、公司、资源菜单和指数搜索先停用，模板里对应区块也停着。
import { computed } from 'vue';
import { markets } from '../data/site';
import { customerLogin } from '../links';

const menus = [
  {
    id: 'products',
    label: '产品',
    match: '/products',
    items: [
      { label: '全部产品', to: '/products', hint: '指数、曲线、询价与预售' },
      { label: '价格指数', to: '/products/index', hint: '每个交易日一条结算价 S' },
      { label: '远期曲线', to: '/products/curve', hint: '日、周、月' },
      { label: '价格发现', to: '/products/discovery', hint: '样本测算，双人公告' },
      { label: '远期与预售', to: '/products/forward', hint: '现金结算差价' },
      { label: '现货与询价', to: '/products/spot', hint: '人谈机记' },
    ],
  },
  {
    id: 'company',
    label: '公司',
    match: '/company',
    items: [
      { label: '关于硅元引擎', to: '/company', hint: '价格发现与风险管理' },
      { label: '使用场景', to: '/use-cases', hint: '机构、买方、供给伙伴' },
      { label: '联系销售', to: '/contact', hint: '协作范围由经纪确认' },
    ],
  },
  {
    id: 'resources',
    label: '资源',
    match: '/resources',
    items: [
      { label: '研究与说明', to: '/resources', hint: '结算价、远期与询价' },
      { label: '开始使用', to: '/start', hint: '进入客户前台' },
    ],
  },
];

const hits = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return markets
    .filter((item) => `${item.code} ${item.name} ${item.sku} ${item.region}`.toLowerCase().includes(q))
    .slice(0, 6);
});

function active(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`);
}

function toggle(id: string) {
  openMenu.value = openMenu.value === id ? '' : id;
}
*/

function sectionOn(hash: string) {
  if (route.path !== '/') return false;
  if (hash === '#indices') return route.hash === '' || route.hash === '#indices';
  return route.hash === hash;
}

function closeAll() {
  openMenu.value = '';
  mobileOpen.value = false;
  query.value = '';
}

watch(
  () => route.fullPath,
  () => closeAll(),
);
</script>

<template>
  <div class="sticky top-0 z-40">
    <div class="h-0.5 bg-flare" />
    <!--
    顶栏说明先隐藏。
    <div class="border-b border-line bg-panel text-xs text-mute">
      <div class="shell flex h-9 items-center justify-between gap-4">
        <p class="truncate">指数与参考价不构成要约。正式结算以双人复核后的价格公告为准。</p>
        <RouterLink to="/resources/settlement-price" class="hidden shrink-0 text-gold sm:inline">
          如何阅读结算价
        </RouterLink>
      </div>
    </div>
    -->
    <header class="border-b border-line bg-panel/95 backdrop-blur">
      <div class="shell flex h-16 items-stretch gap-6">
        <div class="flex items-center">
          <BrandLogo />
        </div>

        <nav class="hidden items-stretch gap-1 md:flex" aria-label="主导航">
          <RouterLink v-slot="{ href, navigate }" custom :to="{ path: '/', hash: '#indices' }">
            <a
              :href="href"
              class="-mb-px inline-flex items-center border-b-2 px-3 text-sm"
              :class="sectionOn('#indices') ? 'border-flare text-paper' : 'border-transparent text-dim hover:text-paper'"
              :aria-current="sectionOn('#indices') ? 'page' : undefined"
              @click="navigate"
            >
              价格指数
            </a>
          </RouterLink>
          <RouterLink v-slot="{ href, navigate }" custom :to="{ path: '/', hash: '#auctions' }">
            <a
              :href="href"
              class="-mb-px inline-flex items-center border-b-2 px-3 text-sm"
              :class="sectionOn('#auctions') ? 'border-flare text-paper' : 'border-transparent text-dim hover:text-paper'"
              :aria-current="sectionOn('#auctions') ? 'page' : undefined"
              @click="navigate"
            >
              拍卖标的
            </a>
          </RouterLink>
        </nav>
        <!--
        产品、公司、资源、行情、定价先停用。
        <nav class="hidden items-center gap-1 lg:flex" aria-label="主导航">
          <div v-for="menu in menus" :key="menu.id" class="relative" @mouseleave="openMenu = ''">
            <button
              type="button"
              class="flex h-10 items-center gap-1 rounded-lg px-3 text-sm"
              :class="active(menu.match) || openMenu === menu.id ? 'text-paper' : 'text-dim hover:text-paper'"
              :aria-expanded="openMenu === menu.id"
              @mouseenter="openMenu = menu.id"
              @click="toggle(menu.id)"
            >
              {{ menu.label }}
              <svg class="h-3 w-3 opacity-70" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" />
              </svg>
            </button>
            <div
              v-show="openMenu === menu.id"
              class="absolute left-0 top-full w-[320px] rounded-xl border border-line bg-card p-2 shadow-card"
            >
              <RouterLink
                v-for="item in menu.items"
                :key="item.to"
                :to="item.to"
                class="block rounded-lg px-3 py-2.5 hover:bg-white/[0.04]"
              >
                <span class="block text-sm text-paper">{{ item.label }}</span>
                <span class="mt-0.5 block text-xs text-mute">{{ item.hint }}</span>
              </RouterLink>
            </div>
          </div>
          <RouterLink
            to="/markets"
            class="rounded-lg px-3 py-2 text-sm"
            :class="active('/markets') ? 'text-paper' : 'text-dim hover:text-paper'"
          >
            行情
          </RouterLink>
          <RouterLink
            to="/pricing"
            class="rounded-lg px-3 py-2 text-sm"
            :class="active('/pricing') ? 'text-paper' : 'text-dim hover:text-paper'"
          >
            定价
          </RouterLink>
        </nav>
        -->

        <div class="ml-auto flex items-center gap-2 self-center">
          <!--
          指数搜索先停用。
          <div class="relative hidden md:block">
            <label class="sr-only" for="site-search">搜索指数</label>
            <input
              id="site-search"
              v-model="query"
              type="search"
              placeholder="搜索指数"
              class="h-9 w-36 rounded-lg bg-card px-3 text-sm text-paper outline-none ring-1 ring-line placeholder:text-mute focus:w-52 focus:ring-gold"
              @keydown.esc="query = ''"
            />
            <div
              v-if="query"
              class="absolute right-0 top-11 w-72 overflow-hidden rounded-xl border border-line bg-card shadow-card"
            >
              <RouterLink
                v-for="item in hits"
                :key="item.code"
                :to="`/markets/${item.code}`"
                class="block px-3 py-2.5 text-sm hover:bg-white/[0.04]"
              >
                <span class="text-paper">{{ item.code }}</span>
                <span class="mt-0.5 block text-xs text-mute">{{ item.name }}</span>
              </RouterLink>
              <p v-if="!hits.length" class="px-3 py-3 text-sm text-mute">没有匹配的指数代码</p>
            </div>
          </div>
          -->
          <!--
          登录和注册先隐藏。
          <a :href="customerLogin" class="hidden h-9 items-center px-3 text-sm text-paper hover:text-gold sm:inline-flex">
            登录
          </a>
          <RouterLink to="/start" class="btn-gold hidden h-9 sm:inline-flex">注册</RouterLink>
          -->
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-lg border border-line md:hidden"
            :aria-expanded="mobileOpen"
            aria-label="打开菜单"
            @click="mobileOpen = !mobileOpen"
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.4" />
            </svg>
          </button>
        </div>
      </div>
      <div v-if="mobileOpen" class="border-t border-line bg-panel md:hidden">
        <div class="shell space-y-3 py-4">
          <RouterLink v-slot="{ href, navigate }" custom :to="{ path: '/', hash: '#indices' }">
            <a :href="href" class="block text-sm text-paper" @click="navigate">价格指数</a>
          </RouterLink>
          <RouterLink v-slot="{ href, navigate }" custom :to="{ path: '/', hash: '#auctions' }">
            <a :href="href" class="block text-sm text-paper" @click="navigate">拍卖标的</a>
          </RouterLink>
          <!--
          登录和注册先隐藏。
          <div class="flex gap-2 pt-2">
            <a :href="customerLogin" class="btn-line flex-1">登录</a>
            <RouterLink to="/start" class="btn-gold flex-1">注册</RouterLink>
          </div>
          -->
        </div>
      </div>
      <!--
      移动端里的搜索、产品、公司和行情入口先停用。
      <div v-if="mobileOpen" class="border-t border-line bg-panel lg:hidden">
        <div class="shell space-y-4 py-4">
          <label class="sr-only" for="mobile-search">搜索指数</label>
          <input id="mobile-search" v-model="query" type="search" placeholder="搜索指数" class="field" />
          <RouterLink
            v-for="item in hits"
            :key="item.code"
            :to="`/markets/${item.code}`"
            class="block text-sm text-dim"
          >
            {{ item.code }} · {{ item.name }}
          </RouterLink>
          <div v-for="menu in menus" :key="menu.id">
            <p class="text-xs text-mute">{{ menu.label }}</p>
            <RouterLink v-for="item in menu.items" :key="item.to" :to="item.to" class="mt-2 block text-sm text-paper">
              {{ item.label }}
            </RouterLink>
          </div>
          <div class="flex gap-3 pt-2">
            <RouterLink to="/markets" class="text-sm text-paper">行情</RouterLink>
            <RouterLink to="/pricing" class="text-sm text-paper">定价</RouterLink>
          </div>
          <div class="flex gap-2">
            <a :href="customerLogin" class="btn-line flex-1">登录</a>
            <RouterLink to="/start" class="btn-gold flex-1">注册</RouterLink>
          </div>
        </div>
      </div>
      -->
    </header>
  </div>
</template>

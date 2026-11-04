<script setup>
import BrandLogo from './BrandLogo.vue';

const columns = [
  {
    title: '产品',
    links: [
      { label: '价格指数', to: '/products/index' },
      { label: '远期曲线', to: '/products/curve' },
      { label: '价格发现', to: '/products/discovery' },
      { label: '远期与预售', to: '/products/forward' },
      { label: '现货与询价', to: '/products/spot' },
      { label: '认购与认沽', to: '/products/rights' },
    ],
  },
  {
    title: '指数',
    links: [
      { label: '全部行情', to: '/markets' },
      { label: 'H100 · 上海', to: '/markets/H100-SH' },
      { label: 'H200 · 上海', to: '/markets/H200-SH' },
      { label: 'PPU · 内蒙', to: '/markets/PPU-NM' },
      { label: '算力 Token · 上海', to: '/markets/TK-SH' },
    ],
  },
  {
    title: '公司',
    links: [
      { label: '关于我们', to: '/company' },
      { label: '使用场景', to: '/use-cases' },
      { label: '定价', to: '/pricing' },
      { label: '联系销售', to: '/contact' },
    ],
  },
  {
    title: '资源',
    links: [
      { label: '研究与说明', to: '/resources' },
      { label: '开始使用', to: '/start' },
      { label: '使用条款', to: '/legal/terms' },
      { label: '隐私说明', to: '/legal/privacy' },
    ],
  },
];
</script>

<template>
  <footer class="border-t border-line bg-ink">
    <div class="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-6">
      <div class="lg:col-span-2">
        <BrandLogo label="硅元引擎首页" />
        <p class="mt-4 max-w-xs text-sm leading-6 text-mute">
          算力市场的价格发现与价格风险管理。价格指数、远期曲线和经纪成交协作放在一起。
        </p>
      </div>
      <div v-for="column in columns" :key="column.title">
        <h2 class="text-sm font-medium text-paper">{{ column.title }}</h2>
        <ul class="mt-4 space-y-2.5">
          <li v-for="link in column.links" :key="link.to">
            <RouterLink :to="link.to" class="text-sm text-mute hover:text-gold">{{ link.label }}</RouterLink>
          </li>
        </ul>
      </div>
    </div>
    <div class="border-t border-line">
      <div class="shell flex flex-col gap-2 py-5 text-xs text-mute sm:flex-row sm:items-center sm:justify-between">
        <p>© {{ new Date().getFullYear() }} 硅元引擎</p>
        <p>指数与参考价不构成要约。</p>
      </div>
    </div>
  </footer>
</template>

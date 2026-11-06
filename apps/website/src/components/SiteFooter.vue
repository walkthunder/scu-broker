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
    <div class="shell py-14">
      <div>
        <BrandLogo label="硅元引擎首页" />
        <div class="mt-4 flex gap-4 text-sm">
          <RouterLink v-slot="{ href, navigate }" custom :to="{ path: '/', hash: '#indices' }">
            <a :href="href" class="text-mute hover:text-gold" @click="navigate">价格指数</a>
          </RouterLink>
          <RouterLink v-slot="{ href, navigate }" custom :to="{ path: '/', hash: '#auctions' }">
            <a :href="href" class="text-mute hover:text-gold" @click="navigate">拍卖标的</a>
          </RouterLink>
        </div>
      </div>
      <!--
      产品、指数目录、公司和资源链接先停用。
      <div v-for="column in columns" :key="column.title">
        <h2 class="text-sm font-medium text-paper">{{ column.title }}</h2>
        <ul class="mt-4 space-y-2.5">
          <li v-for="link in column.links" :key="link.to">
            <RouterLink :to="link.to" class="text-sm text-mute hover:text-gold">{{ link.label }}</RouterLink>
          </li>
        </ul>
      </div>
      -->
    </div>
    <div class="border-t border-line">
      <div class="shell py-5 text-xs text-mute">
        <p>© {{ new Date().getFullYear() }} 硅元引擎</p>
      </div>
    </div>
  </footer>
</template>

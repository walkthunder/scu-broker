<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { findMarket, markets } from '../data/site';
import { customerUrl } from '../links';

const route = useRoute();
const market = computed(() => findMarket(route.params.code));
const siblings = computed(() =>
  markets.filter((item) => item.sku === market.value?.sku && item.code !== market.value?.code),
);
</script>

<template>
  <main>
    <section v-if="market" class="shell py-12">
      <RouterLink to="/markets" class="text-sm text-mute hover:text-gold">指数目录</RouterLink>
      <p class="mt-6 text-sm font-medium text-gold">{{ market.group === 'token' ? 'Token' : 'GPU' }} · {{ market.region }}</p>
      <h1 class="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{{ market.code }}</h1>
      <p class="mt-4 max-w-2xl text-base leading-7 text-dim">{{ market.name }}。{{ market.blurb }}</p>

      <dl class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-line bg-card p-4">
          <dt class="text-xs text-mute">标的</dt>
          <dd class="mt-2 text-sm">{{ market.sku }}</dd>
        </div>
        <div class="rounded-xl border border-line bg-card p-4">
          <dt class="text-xs text-mute">规格</dt>
          <dd class="mt-2 text-sm">{{ market.spec }}</dd>
        </div>
        <div class="rounded-xl border border-line bg-card p-4">
          <dt class="text-xs text-mute">计价单位</dt>
          <dd class="mt-2 text-sm">{{ market.unit }}</dd>
        </div>
        <div class="rounded-xl border border-line bg-card p-4">
          <dt class="text-xs text-mute">结算</dt>
          <dd class="mt-2 text-sm">每个交易日一条已发布的 S</dd>
        </div>
      </dl>

      <div class="mt-8 max-w-3xl space-y-4 text-sm leading-7 text-dim">
        <p>
          官网不刊登结算价。价格要以客户前台指数页上、经双人复核发布的公告为准。指数和参考价不构成要约。
        </p>
        <p>
          比较不同区域时，先确认代码后缀。SH、NM、GZ 分别是上海、内蒙、贵州。单位不同的指数不能直接横比。
        </p>
      </div>

      <div class="mt-8 flex flex-wrap gap-3">
        <a :href="customerUrl" class="btn-gold">打开客户前台</a>
        <RouterLink to="/products/index" class="btn-line">价格指数说明</RouterLink>
        <RouterLink to="/resources/how-to-read-index" class="btn-line">怎么阅读</RouterLink>
      </div>

      <section v-if="siblings.length" class="mt-12">
        <h2 class="text-sm text-mute">同一标的的其他区域</h2>
        <div class="mt-4 flex flex-wrap gap-2">
          <RouterLink
            v-for="item in siblings"
            :key="item.code"
            :to="`/markets/${item.code}`"
            class="rounded-lg border border-line px-3 py-2 text-sm hover:border-dim"
          >
            {{ item.code }} · {{ item.region }}
          </RouterLink>
        </div>
      </section>
    </section>
    <section v-else class="shell py-24">
      <h1 class="text-3xl font-semibold">没有这条指数</h1>
      <RouterLink to="/markets" class="btn-gold mt-6">返回行情</RouterLink>
    </section>
  </main>
</template>

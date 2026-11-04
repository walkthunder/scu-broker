<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import { findProduct, products } from '../data/site';

const route = useRoute();
const product = computed(() => findProduct(route.params.slug));
const others = computed(() => products.filter((item) => item.slug !== route.params.slug).slice(0, 3));
</script>

<template>
  <main>
    <template v-if="product">
      <PageHeader :kicker="product.kicker" :title="product.name" :lead="product.summary" />
      <section class="shell grid gap-10 py-12 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 class="text-lg font-medium">包含什么</h2>
          <ul class="mt-4 space-y-3">
            <li v-for="point in product.points" :key="point" class="rounded-xl border border-line px-4 py-3 text-sm leading-6">
              {{ point }}
            </li>
          </ul>
        </div>
        <aside class="h-fit rounded-2xl bg-card p-6">
          <h2 class="text-sm font-medium">下一步</h2>
          <p class="mt-3 text-sm leading-6 text-mute">
            已发布的结算价、询价和预售在客户前台。合作范围在联系销售里说明。
          </p>
          <div class="mt-5 flex flex-col gap-2">
            <RouterLink to="/markets" class="btn-line">查看指数目录</RouterLink>
            <RouterLink to="/start" class="btn-gold">开始使用</RouterLink>
          </div>
        </aside>
      </section>
      <section class="shell pb-16">
        <h2 class="text-sm text-mute">其他产品</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <RouterLink
            v-for="item in others"
            :key="item.slug"
            :to="`/products/${item.slug}`"
            class="rounded-xl border border-line px-4 py-3 text-sm hover:border-dim"
          >
            {{ item.name }}
          </RouterLink>
        </div>
      </section>
    </template>
    <section v-else class="shell py-24">
      <h1 class="text-3xl font-semibold">没有这项产品</h1>
      <RouterLink to="/products" class="btn-gold mt-6">返回产品</RouterLink>
    </section>
  </main>
</template>

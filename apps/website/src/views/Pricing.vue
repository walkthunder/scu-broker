<script setup>
import PageHeader from '../components/PageHeader.vue';
import { plans } from '../data/site';
import { customerUrl, partnerUrl } from '../links';

function hrefOf(plan) {
  if (plan.cta === 'customer') return customerUrl;
  if (plan.cta === 'partner') return partnerUrl;
  if (plan.cta === 'contact') return '/contact';
  return '';
}
</script>

<template>
  <main>
    <PageHeader
      kicker="定价"
      title="按协作范围开通"
      lead="官网不标出套餐价格。客户、伙伴和经纪协作的费用，在对应入口里由实际流程确认。"
    />
    <section class="shell grid gap-4 py-12 md:grid-cols-2">
      <article v-for="plan in plans" :key="plan.name" class="flex flex-col rounded-2xl border border-line bg-card p-6">
        <h2 class="text-2xl font-semibold">{{ plan.name }}</h2>
        <p class="mt-2 text-sm text-gold">{{ plan.audience }}</p>
        <ul class="mt-5 flex-1 space-y-3">
          <li v-for="item in plan.items" :key="item" class="text-sm leading-6 text-dim">{{ item }}</li>
        </ul>
        <a v-if="plan.cta && plan.cta !== 'contact'" :href="hrefOf(plan)" class="btn-gold mt-6 w-fit">进入</a>
        <RouterLink v-else-if="plan.cta === 'contact'" to="/contact" class="btn-gold mt-6 w-fit">联系销售</RouterLink>
        <p v-else class="mt-6 text-sm text-mute">直接阅读本站即可</p>
      </article>
    </section>
  </main>
</template>

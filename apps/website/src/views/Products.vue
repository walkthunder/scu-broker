<script setup>
import PageHeader from '../components/PageHeader.vue';
import { products } from '../data/site';
</script>

<template>
  <main>
    <PageHeader
      kicker="产品"
      title="算力价格的基础设施"
      lead="从每天一条结算价，到询价、预售和少数实物交割。每项能力都对应已经落地的协作，而不是单独出售的数据包。"
    />
    <section class="shell grid gap-4 py-12 md:grid-cols-2">
      <RouterLink
        v-for="item in products"
        :key="item.slug"
        :to="`/products/${item.slug}`"
        class="rounded-2xl border border-line bg-card p-6 transition hover:border-dim"
      >
        <p class="text-xs text-gold">{{ item.kicker }}</p>
        <h2 class="mt-3 text-2xl font-semibold">{{ item.name }}</h2>
        <p class="mt-3 text-sm leading-6 text-dim">{{ item.summary }}</p>
      </RouterLink>
    </section>
  </main>
</template>

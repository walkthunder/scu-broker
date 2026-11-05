<script setup>
import PageHeader from '../components/PageHeader.vue';
import { articles, readingLabel } from '../data/site';
</script>

<template>
  <main>
    <PageHeader
      kicker="资源"
      title="先读口径，再打开行情"
      lead="四篇说明对应结算价、现金结算、询价和指数代码。没有独立的市场快讯流。"
    />
    <section class="shell grid gap-4 py-12 md:grid-cols-2">
      <RouterLink
        v-for="article in articles"
        :key="article.slug"
        :to="`/resources/${article.slug}`"
        class="rounded-2xl border border-line bg-card p-6 hover:border-dim"
      >
        <p class="text-xs text-mute">{{ readingLabel(article) }}</p>
        <h2 class="mt-3 text-2xl font-semibold">{{ article.title }}</h2>
        <p class="mt-3 text-sm leading-6 text-dim">{{ article.summary }}</p>
      </RouterLink>
    </section>
  </main>
</template>

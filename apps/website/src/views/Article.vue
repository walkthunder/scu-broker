<script setup>
import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { findArticle, readingLabel } from '../data/site';

const route = useRoute();
const article = computed(() => findArticle(route.params.slug));

watchEffect(() => {
  if (article.value) document.title = `${article.value.title} — 硅元引擎`;
});
</script>

<template>
  <main class="shell py-12">
    <template v-if="article">
      <RouterLink to="/resources" class="text-sm text-mute hover:text-gold">资源</RouterLink>
      <p class="mt-6 text-sm text-gold">{{ readingLabel(article) }}</p>
      <h1 class="mt-3 max-w-3xl text-4xl font-semibold tracking-tight">{{ article.title }}</h1>
      <p class="mt-4 max-w-2xl text-dim">{{ article.summary }}</p>
      <div class="mt-8 max-w-3xl space-y-5">
        <p v-for="(paragraph, index) in article.paragraphs" :key="index" class="leading-8 text-paper/90">
          {{ paragraph }}
        </p>
      </div>
    </template>
    <template v-else>
      <h1 class="text-3xl font-semibold">没有这篇文章</h1>
      <RouterLink to="/resources" class="btn-gold mt-6">返回资源</RouterLink>
    </template>
  </main>
</template>

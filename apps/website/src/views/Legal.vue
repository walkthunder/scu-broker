<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { findLegal } from '../data/site';

const route = useRoute();
const page = computed(() => findLegal(route.params.page));

watchEffect(() => {
  if (page.value) document.title = `${page.value.title} — 硅元引擎`;
});
</script>

<template>
  <main class="shell max-w-3xl py-14">
    <template v-if="page">
      <h1 class="text-4xl font-semibold">{{ page.title }}</h1>
      <div class="mt-8 space-y-5">
        <p v-for="(paragraph, index) in page.paragraphs" :key="index" class="leading-8 text-dim">
          {{ paragraph }}
        </p>
      </div>
    </template>
    <template v-else>
      <h1 class="text-3xl font-semibold">没有这条法律信息</h1>
      <RouterLink to="/legal/terms" class="btn-gold mt-6">查看使用条款</RouterLink>
    </template>
  </main>
</template>

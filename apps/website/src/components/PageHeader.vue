<script setup lang="ts">
defineProps<{
  kicker?: string;
  title: string;
  lead?: string;
}>();
</script>

<template>
  <section>
    <div class="shell pt-12 sm:pt-16">
      <p v-if="kicker" class="text-sm font-medium text-gold">{{ kicker }}</p>
      <h1 class="mt-3 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{{ title }}</h1>
      <p v-if="lead" class="mt-4 max-w-2xl text-base leading-7 text-dim">{{ lead }}</p>
    </div>
  </section>
</template>

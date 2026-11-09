<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
  }>(),
  {
    label: '硅元引擎首页',
  },
);

const src = `${import.meta.env.BASE_URL}favicon.png`;
</script>

<template>
  <RouterLink to="/" class="inline-flex w-fit shrink-0 items-center gap-2" :aria-label="label">
    <img :src="src" alt="" class="h-7 w-7" />
    <span class="text-lg font-bold leading-none tracking-tight text-[#FF9300]">硅元引擎</span>
  </RouterLink>
</template>

<script setup>
defineProps({
  label: { type: String, default: '硅元引擎首页' },
});

const src = `${import.meta.env.BASE_URL}logo.jpg`;
</script>

<template>
  <RouterLink to="/" class="flex shrink-0 items-center gap-2.5" :aria-label="label">
    <img :src="src" alt="" class="h-9 w-9 rounded-md object-cover" width="36" height="36" />
    <span class="text-[17px] font-semibold tracking-tight">硅元引擎</span>
  </RouterLink>
</template>

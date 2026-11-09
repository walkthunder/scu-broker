<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
  }>(),
  {
    label: '硅元引擎首页',
  },
);

const src = `${import.meta.env.BASE_URL}new.jpg`;
// new.jpg 画布 1056×615。只按高度缩放，宽度用 auto，避免宽高分开写把图形拉变形。
const frame = { x: 174, y: 237, w: 655, h: 142, imgW: 1056, imgH: 615 };
const height = 36;
</script>

<template>
  <RouterLink to="/" class="inline-flex w-fit shrink-0 items-center" :aria-label="label">
    <span
      class="block overflow-hidden rounded-md"
      :style="{ width: `${(height * frame.w) / frame.h}px`, height: `${height}px` }"
    >
      <img
        :src="src"
        alt=""
        class="block max-w-none"
        :style="{
          height: `${(height * frame.imgH) / frame.h}px`,
          width: 'auto',
          marginLeft: `${(-height * frame.x) / frame.h}px`,
          marginTop: `${(-height * frame.y) / frame.h}px`,
        }"
      />
    </span>
  </RouterLink>
</template>

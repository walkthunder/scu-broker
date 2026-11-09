<script setup lang="ts">
import { RouterView } from 'vue-router';
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
</script>

<template>
  <div class="min-h-screen bg-ink">
    <SiteHeader />
    <RouterView />
    <SiteFooter />
  </div>
</template>

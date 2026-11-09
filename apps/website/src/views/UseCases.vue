<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import { audiences } from '../data/site';
</script>

<template>
  <main>
    <PageHeader
      kicker="使用场景"
      title="机构、买方、供给方读的是同一套价格"
      lead="差别在于接下来做什么：讨论结算，锁定成本，还是把产能和凭证交给协作流程。"
    />
    <section class="shell space-y-8 py-12">
      <article v-for="item in audiences" :key="item.id" class="rounded-2xl border border-line p-6 sm:p-8">
        <p class="text-sm font-medium text-gold">{{ item.index }}</p>
        <h2 class="mt-2 text-3xl font-semibold">{{ item.title }}</h2>
        <p class="mt-3 max-w-3xl leading-7 text-dim">{{ item.lead }}</p>
        <div class="mt-6 grid gap-4 md:grid-cols-3">
          <div v-for="point in item.points" :key="point.title" class="rounded-xl bg-card p-4">
            <h3 class="text-sm font-medium">{{ point.title }}</h3>
            <p class="mt-2 text-sm leading-6 text-mute">{{ point.text }}</p>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>

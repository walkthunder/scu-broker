<script setup>
import { computed, ref } from 'vue';
import { markets } from '../data/site';

const props = defineProps({
  limit: { type: Number, default: 0 },
  searchable: { type: Boolean, default: false },
});

const tab = ref(props.searchable ? 'all' : 'hot');
const query = ref('');
const tabs = computed(() => {
  const base = [
    { id: 'hot', label: '热门' },
    { id: 'gpu', label: 'GPU' },
    { id: 'token', label: 'Token' },
  ];
  return props.searchable ? [{ id: 'all', label: '全部' }, ...base] : base;
});

const rows = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = markets;
  if (q) {
    list = markets.filter((item) =>
      `${item.code} ${item.name} ${item.sku} ${item.region} ${item.spec}`.toLowerCase().includes(q),
    );
  } else if (tab.value === 'hot') {
    list = markets.filter((item) => item.hot);
  } else if (tab.value === 'gpu' || tab.value === 'token') {
    list = markets.filter((item) => item.group === tab.value);
  }
  return props.limit ? list.slice(0, props.limit) : list;
});
</script>

<template>
  <section class="min-w-0 max-w-full rounded-2xl border border-line bg-card shadow-card">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        class="rounded-md px-3 py-1.5 text-sm"
        :class="!query && tab === item.id ? 'bg-white/10 text-paper' : 'text-mute hover:text-paper'"
        @click="tab = item.id; query = ''"
      >
        {{ item.label }}
      </button>
      <RouterLink to="/markets" class="ml-auto text-xs text-mute hover:text-gold">全部行情</RouterLink>
    </div>
    <div v-if="searchable" class="border-b border-line px-4 py-3">
      <label class="sr-only" for="market-filter">筛选指数</label>
      <input id="market-filter" v-model="query" type="search" placeholder="代码、标的或区域" class="field h-10 bg-ink" />
    </div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="text-xs text-mute">
          <tr class="border-b border-line">
            <th class="px-4 py-3 font-medium">代码</th>
            <th class="px-4 py-3 font-medium">标的</th>
            <th class="px-4 py-3 font-medium">区域</th>
            <th class="px-4 py-3 font-medium">单位</th>
            <th class="px-4 py-3 font-medium">结算</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in rows" :key="item.code" class="border-b border-line/80 last:border-0 hover:bg-white/[0.03]">
            <td class="px-4 py-3.5">
              <RouterLink :to="`/markets/${item.code}`" class="font-medium text-paper hover:text-gold">
                {{ item.code }}
              </RouterLink>
            </td>
            <td class="px-4 py-3.5">
              <span class="block text-paper">{{ item.sku }}</span>
              <span class="mt-0.5 block text-xs text-mute">{{ item.spec }}</span>
            </td>
            <td class="px-4 py-3.5 text-dim">{{ item.region }}</td>
            <td class="px-4 py-3.5 text-dim">{{ item.unit }}</td>
            <td class="px-4 py-3.5 text-mute">日结算价 S</td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="5" class="px-4 py-8 text-center text-mute">没有匹配的指数</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

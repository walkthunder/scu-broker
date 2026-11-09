<script setup lang="ts">
import { computed, ref } from 'vue';
import { auctions, type Auction, type AuctionStatus } from '../data/board';

type AuctionTab = 'all' | AuctionStatus | 'within3';

const tab = ref<AuctionTab>('all');
const note = ref('');

const statusView: Record<AuctionStatus, { label: string; dot: string; text: string }> = {
  soon: { label: '即将开始', dot: 'bg-gold', text: 'text-gold' },
  live: { label: '竞价中', dot: 'bg-[#0ECB81]', text: 'text-[#0ECB81]' },
  done: { label: '已成交', dot: 'bg-mute', text: 'text-mute' },
};

const tabs = computed<{ id: AuctionTab; label: string; count: number }[]>(() => [
  { id: 'all', label: '全部', count: auctions.length },
  { id: 'live', label: '竞价中', count: auctions.filter((item) => item.status === 'live').length },
  { id: 'soon', label: '即将开始', count: auctions.filter((item) => item.status === 'soon').length },
  { id: 'within3', label: '3日内开拍', count: auctions.filter((item) => item.within3).length },
  { id: 'done', label: '已成交', count: auctions.filter((item) => item.status === 'done').length },
]);

const rows = computed(() => {
  if (tab.value === 'all') return auctions;
  if (tab.value === 'within3') return auctions.filter((item) => item.within3);
  return auctions.filter((item) => item.status === tab.value);
});

function choose(id: AuctionTab) {
  tab.value = id;
  note.value = '';
}

function openRow(row: Auction) {
  note.value = `「${row.title}」是演示记录，这里不跳转外部挂牌。`;
}
</script>

<template>
  <div class="min-w-0">
    <h2 class="text-3xl font-semibold tracking-tight">正在交易的标的</h2>

    <div class="mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="挂牌筛选">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        role="tab"
        class="shrink-0 border-b-2 px-3 py-2.5 text-sm"
        :class="tab === item.id ? 'border-gold text-paper' : 'border-transparent text-mute hover:text-paper'"
        :aria-selected="tab === item.id"
        @click="choose(item.id)"
      >
        {{ item.label }} {{ item.count }}
      </button>
    </div>

    <div class="mt-2 overflow-x-auto">
      <table class="w-full min-w-[920px] text-left text-sm">
        <thead class="text-xs text-mute">
          <tr class="border-b border-line">
            <th scope="col" class="px-3 py-3 font-medium">挂牌机构</th>
            <th scope="col" class="px-3 py-3 font-medium">标的</th>
            <th scope="col" class="px-3 py-3 font-medium">数量</th>
            <th scope="col" class="px-3 py-3 font-medium">开拍 / 结束</th>
            <th scope="col" class="px-3 py-3 font-medium">竞价方式</th>
            <th scope="col" class="px-3 py-3 font-medium">价格</th>
            <th scope="col" class="px-3 py-3 font-medium">状态</th>
            <th scope="col" class="px-3 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" class="border-b border-line/80 align-top last:border-0">
            <td class="px-3 py-4">
              <span class="block text-paper">{{ row.org }}</span>
              <span class="mt-1 block text-xs text-mute">{{ row.channel }}</span>
            </td>
            <td class="px-3 py-4">
              <span class="block max-w-xs text-paper">{{ row.title }}</span>
              <span class="mt-1 block max-w-xs text-xs leading-5 text-mute">{{ row.detail }}</span>
            </td>
            <td class="px-3 py-4 text-dim">{{ row.qty }}</td>
            <td class="px-3 py-4">
              <span class="block text-paper">{{ row.window }}</span>
              <span class="mt-1 block text-xs text-mute">{{ row.windowNote }}</span>
            </td>
            <td class="px-3 py-4 text-dim">{{ row.method }}</td>
            <td class="px-3 py-4">
              <span class="block text-paper">{{ row.price }}</span>
              <span class="mt-1 block text-xs text-mute">{{ row.priceNote }}</span>
            </td>
            <td class="px-3 py-4">
              <span class="inline-flex items-center gap-1.5" :class="statusView[row.status].text">
                <span class="h-1.5 w-1.5 rounded-full" :class="statusView[row.status].dot" />
                {{ statusView[row.status].label }}
              </span>
            </td>
            <td class="px-3 py-4">
              <button type="button" class="text-sm text-gold hover:underline" @click="openRow(row)">
                {{ row.action }}
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="8" class="px-3 py-8 text-center text-mute">这个筛选下没有演示标的</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="note" class="mt-3 text-sm text-dim" role="status">{{ note }}</p>
  </div>
</template>

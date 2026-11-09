<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import MarketBoard from '../components/MarketBoard.vue';
</script>

<template>
  <main>
    <PageHeader
      kicker="行情"
      title="指数目录"
      lead="这里列出标的、区域和计价单位。已发布的结算价在客户前台，以价格公告为准。本页不展示价格，避免把未公告数字当成行情。"
    />
    <section class="shell py-10">
      <MarketBoard searchable />
      <p class="mt-4 text-xs leading-5 text-mute">
        代码与客户前台的价格指数一致，例如 H100-SH 表示 H100、上海。H100-M 是上海地区的包月兼容口径。
      </p>
    </section>
  </main>
</template>

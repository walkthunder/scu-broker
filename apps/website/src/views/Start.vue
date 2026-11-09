<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import { customerLogin, customerUrl, partnerUrl } from '../links';

const route = useRoute();
const email = computed(() => String(route.query.email || '').trim());

const steps = [
  {
    title: '打开客户前台',
    text: '行情、指数、询价、预售和账单都在客户前台。营销站不登录、也不代持账户。',
  },
  {
    title: '注册或登录',
    text: '使用邮箱完成注册。若你在首页填过邮箱，它只出现在下面，方便你自己复制，不会被提交。',
  },
  {
    title: '先读指数，再询价',
    text: '对照代码里的标的、区域和单位，打开已发布的结算价。需要锁价时再进入预售或询价。',
  },
  {
    title: '供给方走伙伴门户',
    text: '产能、报价意向和交割凭证不在客户注册流程里，使用伙伴入口。',
  },
];
</script>

<template>
  <main>
    <PageHeader
      kicker="开始使用"
      title="从客户前台进入"
      lead="下面四步对应现有应用，不在这个网站里开通权限。"
    />
    <section class="shell grid gap-8 py-12 lg:grid-cols-[1fr_300px]">
      <ol class="space-y-4">
        <li v-for="(step, index) in steps" :key="step.title" class="rounded-2xl border border-line p-5">
          <p class="text-sm font-medium text-gold">0{{ index + 1 }}</p>
          <h2 class="mt-2 text-xl font-semibold">{{ step.title }}</h2>
          <p class="mt-2 text-sm leading-6 text-dim">{{ step.text }}</p>
        </li>
      </ol>
      <aside class="h-fit rounded-2xl bg-card p-5">
        <p v-if="email" class="text-sm leading-6">
          首页填写的邮箱
          <span class="mt-1 block break-all font-medium text-gold">{{ email }}</span>
        </p>
        <p v-else class="text-sm leading-6 text-mute">到客户前台用邮箱注册。</p>
        <div class="mt-5 flex flex-col gap-2">
          <a :href="customerLogin" class="btn-gold">登录客户前台</a>
          <a :href="customerUrl" class="btn-line">打开行情大厅</a>
          <a :href="partnerUrl" class="btn-line">打开伙伴门户</a>
        </div>
      </aside>
    </section>
  </main>
</template>

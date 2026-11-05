<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import MarketBoard from '../components/MarketBoard.vue';
import { articles, audiences, principles, products } from '../data/site';

const router = useRouter();
const email = ref('');
const productId = ref(products[0].slug);
const audienceId = ref(audiences[0].id);

const activeProduct = () => products.find((item) => item.slug === productId.value) || products[0];
const activeAudience = () => audiences.find((item) => item.id === audienceId.value) || audiences[0];

function goStart() {
  const value = email.value.trim();
  router.push({ name: 'start', query: value ? { email: value } : {} });
}
</script>

<template>
  <main>
    <section class="border-b border-line">
      <div class="shell grid min-w-0 items-start gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
        <div>
          <p class="text-sm font-medium text-gold">算力市场情报</p>
          <h1 class="mt-4 text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            把价格看清<br />再决定怎么锁
          </h1>
          <p class="mt-6 max-w-xl text-base leading-7 text-dim">
            价格指数、远期曲线和经纪成交协作。线下谈妥，系统记下状态、报价与结算。指数和参考价不构成要约。
          </p>
          <form class="mt-8 flex max-w-md gap-2" @submit.prevent="goStart">
            <label class="sr-only" for="hero-email">邮箱</label>
            <input id="hero-email" v-model="email" type="email" autocomplete="email" placeholder="邮箱" class="field" />
            <button type="submit" class="btn-gold h-12 shrink-0 px-6">注册</button>
          </form>
          <p class="mt-3 text-xs text-mute">注册在客户前台完成。此页不创建账户。</p>
          <dl class="mt-10 grid max-w-lg grid-cols-2 gap-6 border-t border-line pt-6">
            <div>
              <dt class="text-sm font-medium text-paper">日结算价</dt>
              <dd class="mt-1 text-xs leading-5 text-mute">双人复核后发布，写入账单不再回改</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-paper">现金结算</dt>
              <dd class="mt-1 text-xs leading-5 text-mute">远期主路径锁定成本，不必搬迁算力</dd>
            </div>
          </dl>
        </div>
        <MarketBoard :limit="6" />
      </div>
    </section>

    <section class="border-b border-line">
      <div class="shell grid gap-4 py-6 sm:grid-cols-3">
        <RouterLink
          v-for="article in articles.slice(0, 3)"
          :key="article.slug"
          :to="`/resources/${article.slug}`"
          class="rounded-xl px-2 py-3 hover:bg-white/[0.03]"
        >
          <p class="text-xs text-mute">说明</p>
          <p class="mt-1 text-sm leading-6 text-paper">{{ article.title }}</p>
        </RouterLink>
      </div>
    </section>

    <section class="shell py-16 lg:py-20">
      <div class="flex items-end justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-gold">产品</p>
          <h2 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">看价格，也管理价格</h2>
        </div>
        <RouterLink to="/products" class="hidden text-sm text-gold sm:inline">全部产品</RouterLink>
      </div>
      <div class="mt-8 grid gap-4 lg:grid-cols-[260px_1fr]">
        <div class="flex gap-2 overflow-auto lg:flex-col">
          <button
            v-for="item in products"
            :key="item.slug"
            type="button"
            class="shrink-0 rounded-xl px-4 py-3 text-left text-sm"
            :class="productId === item.slug ? 'bg-card text-paper' : 'text-mute hover:text-paper'"
            @click="productId = item.slug"
          >
            {{ item.name }}
          </button>
        </div>
        <article class="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <p class="text-sm text-gold">{{ activeProduct().kicker }}</p>
          <h3 class="mt-3 text-3xl font-semibold">{{ activeProduct().name }}</h3>
          <p class="mt-4 max-w-2xl leading-7 text-dim">{{ activeProduct().summary }}</p>
          <ul class="mt-6 space-y-3">
            <li v-for="point in activeProduct().points" :key="point" class="flex gap-3 text-sm leading-6 text-paper">
              <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
              <span>{{ point }}</span>
            </li>
          </ul>
          <RouterLink :to="`/products/${activeProduct().slug}`" class="btn-gold mt-8">了解产品</RouterLink>
        </article>
      </div>
    </section>

    <section class="border-y border-line bg-panel">
      <div class="shell py-16 lg:py-20">
        <p class="text-sm font-medium text-gold">使用对象</p>
        <h2 class="mt-2 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">同一套价格，三种读法</h2>
        <div class="mt-8 divide-y divide-line border-y border-line">
          <div v-for="item in audiences" :key="item.id">
            <button
              type="button"
              class="flex w-full items-center gap-4 py-5 text-left"
              :aria-expanded="audienceId === item.id"
              @click="audienceId = item.id"
            >
              <span class="w-10 text-sm font-medium text-gold">{{ item.index }}</span>
              <span class="flex-1 text-xl font-medium sm:text-2xl">{{ item.title }}</span>
              <span class="text-mute">{{ audienceId === item.id ? '–' : '+' }}</span>
            </button>
            <div v-if="audienceId === item.id" class="grid gap-4 pb-6 sm:grid-cols-3 sm:pl-14">
              <p class="text-sm leading-6 text-dim sm:col-span-3">{{ item.lead }}</p>
              <article v-for="point in item.points" :key="point.title" class="rounded-xl bg-card p-4">
                <h3 class="text-sm font-medium">{{ point.title }}</h3>
                <p class="mt-2 text-sm leading-6 text-mute">{{ point.text }}</p>
              </article>
            </div>
          </div>
        </div>
        <RouterLink to="/use-cases" class="mt-6 inline-flex text-sm text-gold">查看使用场景</RouterLink>
      </div>
    </section>

    <section class="shell py-16 lg:py-20">
      <h2 class="text-3xl font-semibold tracking-tight">平台怎么工作</h2>
      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        <article v-for="item in principles" :key="item.title" class="rounded-2xl border border-line p-5">
          <h3 class="text-base font-medium">{{ item.title }}</h3>
          <p class="mt-2 text-sm leading-6 text-mute">{{ item.text }}</p>
        </article>
      </div>
    </section>

    <section class="border-t border-line bg-panel">
      <div class="shell flex flex-col items-start justify-between gap-6 py-14 sm:flex-row sm:items-center">
        <div>
          <h2 class="text-3xl font-semibold tracking-tight">今天先把结算价读懂</h2>
          <p class="mt-3 max-w-xl text-sm leading-6 text-dim">
            行情和账户在客户前台。官网只说明口径，不展示未公告的价格。
          </p>
        </div>
        <div class="flex gap-3">
          <RouterLink to="/markets" class="btn-line">查看指数目录</RouterLink>
          <RouterLink to="/contact" class="btn-gold">联系销售</RouterLink>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { principles } from '../data/site';
</script>

<template>
  <main>
    <section class="shell grid items-start gap-x-12 gap-y-10 py-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:py-16">
      <div>
        <p class="text-sm font-medium text-gold">公司</p>
        <h1 class="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          硅元引擎做价格发现，<br />
          也做价格风险管理
        </h1>
        <div class="mt-6 max-w-xl space-y-4 text-sm leading-7 text-dim">
          <p>
            基座是现货行情和经纪成交协作：人谈机记。核心是价格指数，以及用现金结算把未来算力成本锁在约定价格附近。
          </p>
          <p>
            客户在前台看行情、指数、询价、预售、权益、账单和交割意愿。经纪在后台处理报价、价格公告、远期、风控和伙伴审核。供给伙伴在自己的门户登记产能、意向和凭证。
          </p>
          <p>
            区域目前覆盖上海、内蒙和贵州。指数标的覆盖 H100、H200、PPU 和算力 Token。同名标的换了区域，就是另一条指数。
          </p>
          <p>
            当前阶段不做自动连续竞价，也不把本网站说成交易所。对外可讲清的故事是：约定到期价格，到期按公告结算价做现金差价。
          </p>
        </div>
      </div>
      <div class="grid content-start gap-3 sm:grid-cols-2">
        <article v-for="item in principles" :key="item.title" class="rounded-2xl border border-line bg-card/60 p-5">
          <h2 class="text-base font-medium text-paper">{{ item.title }}</h2>
          <p class="mt-2 text-sm leading-6 text-mute">{{ item.text }}</p>
        </article>
      </div>
    </section>
    <section class="border-t border-line">
      <div class="shell flex flex-col items-start justify-between gap-4 py-12 sm:flex-row sm:items-center">
        <div>
          <h2 class="text-2xl font-semibold">想对齐协作范围</h2>
          <p class="mt-2 text-sm text-mute">说明你是买方、供给伙伴，还是需要经纪协作。</p>
        </div>
        <RouterLink to="/contact" class="btn-gold">联系销售</RouterLink>
      </div>
    </section>
  </main>
</template>

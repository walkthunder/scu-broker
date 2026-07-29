<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="page-title">服务与保障</h1>
    <p class="page-desc">CompriX 坚持「人谈机记」：撮合在线下完成，系统负责状态、报价与账务记录。</p>
    <div class="mt-8 space-y-6 text-sm leading-relaxed text-slate-300">
      <section class="panel p-5">
        <h2 class="font-medium text-slate-100">履约流程</h2>
        <p class="mt-2 text-slate-400">
          询价 → Broker 分配与线下谈价 → 正式报价（24h）→ 确认生成订单 → 待签约 / 待交付 / 待验收 / 待结算 → 已完成。
        </p>
      </section>
      <section id="index-rules" class="panel scroll-mt-24 p-5">
        <h2 class="font-medium text-slate-100">指数规则（摘要）</h2>
        <p class="mt-2 text-slate-400">
          每个价格指数绑定一个公开 SKU 参考价；运营按日写入结算价 S，发布后才可用于远期盯市与到期结算。已发布当日 S
          不可被结算覆盖。未发布则不可开新仓、不可批结算。
        </p>
      </section>
      <section id="settle-rules" class="panel scroll-mt-24 p-5">
        <h2 class="font-medium text-slate-100">结算规则（摘要）</h2>
        <p class="mt-2 text-slate-400">
          现金结算差价 = (S − X) × 数量。S &gt; X 时卖方付买方；S &lt; X 时买方付卖方。账单出现在「账单」页，线下收付后由
          Broker 确认。
        </p>
      </section>
      <section id="delivery-rules" class="panel scroll-mt-24 p-5">
        <h2 class="font-medium text-slate-100">交割规则（摘要）</h2>
        <p class="mt-2 text-slate-400">
          默认现金结算。白名单账户可在到期前 7 天至到期日申请实物交割；批准后不再现金结算，通道方交付后由运营标记完成。
        </p>
      </section>
      <section class="panel p-5">
        <h2 class="font-medium text-slate-100">验收与赔付</h2>
        <p class="mt-2 text-slate-400">
          验收标准以合同约定为准。若发生赔付，由 Broker 在后台记入赔付流水并保留说明。
        </p>
      </section>
    </div>
  </div>
</template>

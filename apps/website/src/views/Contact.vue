<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';

const sent = ref(false);
const error = ref('');
const form = reactive({
  name: '',
  org: '',
  email: '',
  role: '买方',
  note: '',
});

const summary = computed(() =>
  [
    `姓名：${form.name}`,
    `机构：${form.org}`,
    `邮箱：${form.email}`,
    `角色：${form.role}`,
    `想了解：${form.note}`,
  ].join('\n'),
);

function submit() {
  error.value = '';
  if (!form.name.trim() || !form.org.trim() || !form.email.trim()) {
    error.value = '请填写姓名、机构和邮箱。';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    error.value = '邮箱格式不正确。';
    return;
  }
  sent.value = true;
}

async function copyText() {
  error.value = '';
  try {
    await navigator.clipboard.writeText(summary.value);
  } catch {
    error.value = '复制失败，请手动选择下方文本。';
  }
}
</script>

<template>
  <main>
    <PageHeader
      kicker="联系销售"
      title="说明你要对齐的协作"
      lead="本页不把表单发到服务器。填写后可复制一段文字，交给已经在对接的经纪，或到客户前台注册后通过询价说明需求。"
    />
    <section class="shell grid gap-8 py-12 lg:grid-cols-[1fr_280px]">
      <form v-if="!sent" class="max-w-xl space-y-4" @submit.prevent="submit">
        <label class="block text-sm">
          <span class="mb-2 block text-mute">姓名</span>
          <input v-model="form.name" class="field" autocomplete="name" />
        </label>
        <label class="block text-sm">
          <span class="mb-2 block text-mute">机构</span>
          <input v-model="form.org" class="field" autocomplete="organization" />
        </label>
        <label class="block text-sm">
          <span class="mb-2 block text-mute">邮箱</span>
          <input v-model="form.email" type="email" class="field" autocomplete="email" />
        </label>
        <label class="block text-sm">
          <span class="mb-2 block text-mute">角色</span>
          <select v-model="form.role" class="field">
            <option>买方</option>
            <option>供给伙伴</option>
            <option>经纪协作</option>
          </select>
        </label>
        <label class="block text-sm">
          <span class="mb-2 block text-mute">想了解</span>
          <textarea v-model="form.note" rows="4" class="field h-auto py-3" />
        </label>
        <p v-if="error" class="text-sm text-rise">{{ error }}</p>
        <button type="submit" class="btn-gold">生成可复制说明</button>
      </form>
      <div v-else class="max-w-xl">
        <h2 class="text-xl font-semibold">说明已留在此页</h2>
        <p class="mt-2 text-sm leading-6 text-mute">没有上传。复制后通过你自己的渠道发出。</p>
        <pre class="mt-4 whitespace-pre-wrap rounded-xl bg-card p-4 text-sm leading-6">{{ summary }}</pre>
        <p v-if="error" class="mt-3 text-sm text-rise">{{ error }}</p>
        <div class="mt-4 flex gap-2">
          <button type="button" class="btn-gold" @click="copyText">复制</button>
          <button type="button" class="btn-line" @click="sent = false">返回修改</button>
        </div>
      </div>
      <aside class="h-fit rounded-2xl border border-line p-5 text-sm leading-6 text-mute">
        <p>买方注册和询价在客户前台。</p>
        <p class="mt-3">供给伙伴使用伙伴门户。</p>
        <RouterLink to="/start" class="mt-4 inline-flex text-gold">查看开始步骤</RouterLink>
      </aside>
    </section>
  </main>
</template>

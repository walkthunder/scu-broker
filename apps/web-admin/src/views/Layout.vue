<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clearAuth, getUser } from '../api';

const route = useRoute();
const router = useRouter();
const user = computed(() => getUser());

const menuGroups = [
  {
    title: '总览',
    items: [{ path: '/', label: 'Dashboard' }],
  },
  {
    title: '行情与指数',
    items: [
      { path: '/skus', label: 'SKU 管理' },
      { path: '/prices', label: '参考价管理' },
      { path: '/indices', label: '价格指数' },
      { path: '/price-discovery', label: '价格发现 FRD' },
    ],
  },
  {
    title: '远期与交割',
    items: [
      { path: '/forwards', label: '远期/预售台' },
      { path: '/rights', label: '认购/认沽' },
      { path: '/settlement-bills', label: '远期结算' },
      { path: '/delivery', label: '实物交割' },
      { path: '/risk', label: '风控与作业' },
      { path: '/partners', label: '伙伴入驻' },
    ],
  },
  {
    title: '现货运营',
    items: [
      { path: '/suppliers', label: '供应商管理' },
      { path: '/rfqs', label: '询价管理' },
      { path: '/orders', label: '订单管理' },
      { path: '/finance', label: '财务管理' },
      { path: '/crm', label: '销售 CRM' },
    ],
  },
  {
    title: '内容',
    items: [
      { path: '/announcements', label: '通告管理' },
      { path: '/deal-feeds', label: '成交动态' },
    ],
  },
];

const roleLabel = computed(() => {
  const r = user.value?.role;
  if (r === 'admin') return 'Admin';
  if (r === 'broker') return 'Broker';
  return r || 'Staff';
});

function logout() {
  clearAuth();
  router.push('/login');
}
</script>

<template>
  <el-container class="admin-shell">
    <el-aside class="admin-aside" width="232px">
      <div class="admin-brand">
        <span class="admin-brand-mark" aria-hidden="true" />
        <div>
          <div class="admin-brand-name">CompriX</div>
          <div class="admin-brand-sub">Broker Console</div>
        </div>
      </div>
      <el-menu
        class="admin-menu"
        :default-active="route.path"
        background-color="transparent"
        text-color="#94a3b8"
        active-text-color="#f59e0b"
        router
      >
        <el-menu-item-group v-for="g in menuGroups" :key="g.title" :title="g.title">
          <el-menu-item v-for="m in g.items" :key="m.path" :index="m.path">
            {{ m.label }}
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="admin-header" height="56px">
        <div class="admin-header-title">算力交易操作系统 · 人谈机记</div>
        <div class="admin-header-user">
          <span>{{ user?.name || user?.phone || '运营' }}</span>
          <span class="role-pill">{{ roleLabel }}</span>
          <el-button link type="primary" @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="admin-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

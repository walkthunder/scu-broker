<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clearAuth, getUser } from '../api';

const route = useRoute();
const router = useRouter();
const user = computed(() => getUser());

const menus = [
  { path: '/', label: 'Dashboard' },
  { path: '/skus', label: 'SKU 管理' },
  { path: '/prices', label: '参考价管理' },
  { path: '/suppliers', label: '供应商管理' },
  { path: '/rfqs', label: '询价管理' },
  { path: '/orders', label: '订单管理' },
  { path: '/finance', label: '财务管理' },
  { path: '/announcements', label: '通告管理' },
  { path: '/deal-feeds', label: '成交动态' },
];

function logout() {
  clearAuth();
  router.push('/login');
}
</script>

<template>
  <el-container style="min-height: 100vh">
    <el-aside width="220px" style="background: #0f172a; color: #fff">
      <div style="padding: 20px 16px; font-weight: 700; font-size: 18px">CompriX</div>
      <el-menu
        :default-active="route.path"
        background-color="#0f172a"
        text-color="#cbd5e1"
        active-text-color="#fff"
        router
      >
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">{{ m.label }}</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header
        style="display: flex; align-items: center; justify-content: flex-end; gap: 12px; border-bottom: 1px solid #e5e7eb"
      >
        <span>{{ user?.name }}（{{ user?.role }}）</span>
        <el-button link type="primary" @click="logout">退出</el-button>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

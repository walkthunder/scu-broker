import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';
import Login from './views/Login.vue';
import Layout from './views/Layout.vue';
import Dashboard from './views/Dashboard.vue';
import Skus from './views/Skus.vue';
import Suppliers from './views/Suppliers.vue';
import ReferencePrices from './views/ReferencePrices.vue';
import Rfqs from './views/Rfqs.vue';
import Orders from './views/Orders.vue';
import Finance from './views/Finance.vue';
import Announcements from './views/Announcements.vue';
import DealFeeds from './views/DealFeeds.vue';

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    { path: '/login', component: Login },
    {
      path: '/',
      component: Layout,
      meta: { auth: true },
      children: [
        { path: '', component: Dashboard },
        { path: 'skus', component: Skus },
        { path: 'suppliers', component: Suppliers },
        { path: 'prices', component: ReferencePrices },
        { path: 'rfqs', component: Rfqs },
        { path: 'orders', component: Orders },
        { path: 'finance', component: Finance },
        { path: 'announcements', component: Announcements },
        { path: 'deal-feeds', component: DealFeeds },
      ],
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.auth && !getToken()) return '/login';
});

export default router;

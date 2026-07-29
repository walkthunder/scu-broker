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
import Indices from './views/Indices.vue';
import Forwards from './views/Forwards.vue';
import SettlementBills from './views/SettlementBills.vue';
import Delivery from './views/Delivery.vue';
import PriceDiscovery from './views/PriceDiscovery.vue';
import Rights from './views/Rights.vue';
import Crm from './views/Crm.vue';
import Risk from './views/Risk.vue';
import Partners from './views/Partners.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
        { path: 'indices', component: Indices },
        { path: 'forwards', component: Forwards },
        { path: 'settlement-bills', component: SettlementBills },
        { path: 'delivery', component: Delivery },
        { path: 'price-discovery', component: PriceDiscovery },
        { path: 'rights', component: Rights },
        { path: 'crm', component: Crm },
        { path: 'risk', component: Risk },
        { path: 'partners', component: Partners },
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

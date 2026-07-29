import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';
import Prices from './views/Prices.vue';
import SkuDetail from './views/SkuDetail.vue';
import RfqForm from './views/RfqForm.vue';
import RfqSuccess from './views/RfqSuccess.vue';
import MyOrders from './views/MyOrders.vue';
import Login from './views/Login.vue';
import RfqDetail from './views/RfqDetail.vue';
import OrderDetail from './views/OrderDetail.vue';
import About from './views/About.vue';
import Indices from './views/Indices.vue';
import Forwards from './views/Forwards.vue';
import Bills from './views/Bills.vue';
import Account from './views/Account.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'prices', component: Prices },
    { path: '/sku/:id', name: 'sku-detail', component: SkuDetail },
    { path: '/login', name: 'login', component: Login },
    { path: '/rfq', name: 'rfq', component: RfqForm, meta: { auth: true } },
    { path: '/rfq/success', name: 'rfq-success', component: RfqSuccess, meta: { auth: true } },
    { path: '/mine', name: 'mine', component: MyOrders, meta: { auth: true } },
    { path: '/account', name: 'account', component: Account, meta: { auth: true } },
    { path: '/rfqs/:id', name: 'rfq-detail', component: RfqDetail, meta: { auth: true } },
    { path: '/orders/:id', name: 'order-detail', component: OrderDetail, meta: { auth: true } },
    { path: '/indices', name: 'indices', component: Indices },
    { path: '/forwards', name: 'forwards', component: Forwards, meta: { auth: true } },
    { path: '/bills', name: 'bills', component: Bills, meta: { auth: true } },
    { path: '/about', name: 'about', component: About },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  if (to.meta.auth && !getToken()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && getToken()) {
    return { path: typeof to.query.redirect === 'string' ? to.query.redirect : '/mine' };
  }
});

export default router;

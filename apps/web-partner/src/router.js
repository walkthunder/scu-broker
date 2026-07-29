import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';
import Login from './views/Login.vue';
import Home from './views/Home.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: Login },
    { path: '/', component: Home, meta: { auth: true } },
  ],
});

router.beforeEach((to) => {
  if (to.meta.auth && !getToken()) return '/login';
});

export default router;

import { createRouter, createWebHistory } from 'vue-router';
import Home from './views/Home.vue';
import Products from './views/Products.vue';
import ProductDetail from './views/ProductDetail.vue';
import Markets from './views/Markets.vue';
import MarketDetail from './views/MarketDetail.vue';
import Pricing from './views/Pricing.vue';
import Company from './views/Company.vue';
import UseCases from './views/UseCases.vue';
import Resources from './views/Resources.vue';
import Article from './views/Article.vue';
import Contact from './views/Contact.vue';
import Start from './views/Start.vue';
import Legal from './views/Legal.vue';
import NotFound from './views/NotFound.vue';

declare module 'vue-router' {
  interface RouteMeta {
    title: string;
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { title: '硅元引擎 — 算力价格指数' } },
    { path: '/products', name: 'products', component: Products, meta: { title: '产品 — 硅元引擎' } },
    { path: '/products/:slug', name: 'product', component: ProductDetail, meta: { title: '产品 — 硅元引擎' } },
    { path: '/markets', name: 'markets', component: Markets, meta: { title: '行情 — 硅元引擎' } },
    { path: '/markets/:code', name: 'market', component: MarketDetail, meta: { title: '指数 — 硅元引擎' } },
    { path: '/pricing', name: 'pricing', component: Pricing, meta: { title: '定价 — 硅元引擎' } },
    { path: '/company', name: 'company', component: Company, meta: { title: '公司 — 硅元引擎' } },
    { path: '/use-cases', name: 'use-cases', component: UseCases, meta: { title: '使用场景 — 硅元引擎' } },
    { path: '/resources', name: 'resources', component: Resources, meta: { title: '资源 — 硅元引擎' } },
    { path: '/resources/:slug', name: 'article', component: Article, meta: { title: '资源 — 硅元引擎' } },
    { path: '/contact', name: 'contact', component: Contact, meta: { title: '联系销售 — 硅元引擎' } },
    { path: '/start', name: 'start', component: Start, meta: { title: '开始使用 — 硅元引擎' } },
    { path: '/legal/:page', name: 'legal', component: Legal, meta: { title: '法律信息 — 硅元引擎' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound, meta: { title: '未找到 — 硅元引擎' } },
  ],
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
});

router.afterEach((to) => {
  if (to.meta.title) document.title = to.meta.title;
});

export default router;

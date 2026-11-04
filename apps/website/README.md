# website

硅元引擎营销官网（Vue 3 + Vue Router + Vite + Tailwind），视觉参照深色行情站：黑底、黄色主按钮、顶部导航和指数目录。内容介绍本仓库已经落地的价格发现、价格指数、远期曲线和经纪成交协作。

官网不展示结算价，也不把表单发到服务器。行情与账户在客户前台，产能与凭证在伙伴门户。

```bash
npm install && npm run dev   # http://localhost:5176
```

可选环境变量见 `.env.example`：`VITE_CUSTOMER_URL`、`VITE_PARTNER_URL`。

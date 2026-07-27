# CompriX MVP — 开发需求（真相源）

> 对齐 [PRD.md](../PRD.md)。**产品升级（交易大厅感知 / 运营配置 / 脱敏动态等）见 [PRODUCT_V3.md](./PRODUCT_V3.md)。**
>
> 产品一句话：**给 Broker 用的算力订单后台 + 客户询价/确认报价的极简页。**
>
> 系统只做：记状态、出报价单、通知客户、算清楚账。撮合/谈判/交付/验收/打款全部线下，结果人工录入。

---

## 1. 角色与权限

| 角色 | 入口 | 鉴权 | 能力 |
|------|------|------|------|
| 客户前台 | 手机号 + 验证码 | 看参考价、提交询价、看自己询价/订单、确认/拒绝报价（Broker/Admin 同号亦可登录前台自测） |
| broker | 管理后台 | 账号密码 | 询价分配、录报价、发报价、推订单状态、记财务、传附件 |
| admin | 管理后台 | 账号密码 | 全量 CRUD + Dashboard；含 SKU/供应商/参考价/账号 |

同一张 `users` 表，`role` 区分。JWT 签发共用，路由按角色隔离。

---

## 2. 业务主流程与状态机

```
客户提交 RFQ → Broker 分配 → 线下谈价 → 录入并发送报价
  → 客户确认 → 自动生成订单 → 待签约…已完成 → 手动记收付款
  → 客户拒绝 → RFQ 已拒绝
```

| 实体 | 状态 |
|------|------|
| RFQ | `pending → quoted → confirmed \| rejected` |
| Quote | `draft → pending → confirmed \| rejected \| expired`（发送后默认 24h；过期任务可批量标 expired） |
| Order | `待签约 → 待交付 → 待验收 → 待结算 → 已完成`；另有 `已取消` / `已赔付` |

每次订单状态变更必须写 `order_logs`（from/to/note/operator）。

---

## 3. 功能优先级

### P0 — 没有就不能接单

1. 鉴权（客户验证码 / Broker·Admin 密码）
2. SKU + 供应商 + 参考价（后台 CRUD；前台参考价只读）
3. 询价（客户提交；后台列表/筛选/分配；通知 Broker）
4. 报价（录入 → 发送 → 客户确认/拒绝 → 确认后生成订单）
5. 订单（后台改状态 + 日志；客户看进度）

### P1 — 第一期收尾

6. 财务管理（应收/应付；手动标记收款/放款/赔付）
7. 附件（quote/order）
8. Dashboard（今日询价、待处理、本月单量与成交额）
9. 通知（邮件必接；短信 env 开关）

### 明确不做

自动撮合、AI、链、SCU 折算、支付对接、供应商评分、IM、多语言、App、参考价 Excel 导入。

---

## 4. PRD 缺口约定

| 缺口 | 约定 |
|------|------|
| SKU 管理 | 后台简易 SKU CRUD |
| 近 30 日成交区间 | 已完成订单 price 按 SKU 聚合；无数据显示「暂无」 |
| 供应商对客户脱敏 | 前台显示脱敏名；真实名仅后台 |
| 报价过期 | 到期不可确认（接口校验 + 懒校验） |
| 一 RFQ 几份报价 | **一 RFQ 一有效报价**；改价用更新/重发 |
| 我的询价/订单 | 登录后按 user_id；未登录不可看 |
| 询价手机号 | 登录态自动带出不可改；未登录先登录；同一手机号可登录客户前台（含 Broker/Admin 自测） |
| 草稿报价 | `draft` 对客户不可见；发送后变为 `pending` 才可确认/拒绝 |
| 财务应收应付 | 成交价 = 应收客户 = 应付供应商（毛利后置）；赔付单独记 |

---

## 5. 技术栈

| 层 | 选型 |
|----|------|
| 后端 | Node.js + Express + Sequelize |
| DB | MySQL 8（10 张表） |
| 客户前台 | Vue3 + Vite + Tailwind |
| 管理后台 | Vue3 + Vite + Element Plus |
| 文件 | `/uploads`，Nginx 托管 |
| 部署 | Docker Compose |

```
apps/api/
apps/web-customer/
apps/web-admin/
docker-compose.yml
```

---

## 6. 数据表

MVP 核心：`users`, `skus`, `suppliers`, `reference_prices`, `rfqs`, `quotes`, `orders`, `order_logs`, `payments`, `attachments`, `otp_codes`

V3 增量：`announcements`, `deal_feeds`；以及 `skus`/`rfqs`/`quotes`/`order_logs` 运营与可见性字段（见 [PRODUCT_V3.md](./PRODUCT_V3.md)）。

- `suppliers.skus`：逗号分隔文本
- `reference_prices`：`(sku_id, date)` 唯一；涨跌接口实时算，不落库

---

## 7. API 面

**Customer**：OTP 登录、announcement / market-pulse / hot-skus / reference-prices / deal-feeds、SKU 详情、rfqs（含 submit_page/sla）、quotes confirm/reject/detail、orders（客户可见日志）  
**Admin**：login、SKU/供应商/参考价、rfqs + assign、quotes + send、orders 状态/附件、payments、dashboard、announcements、deal-feeds 发布、expire-quotes 任务

统一：鉴权中间件、统一错误体（不抛 stack）、外部 HTTP 30s 超时、上传大小限制。

---

## 8. 三周节奏

| 周 | 交付 |
|----|------|
| Week 1 | DB + Express、角色登录、SKU/供应商/参考价、客户参考价页 + 询价表单 |
| Week 2 | RFQ 管理、报价、客户确认/拒绝、订单生成与状态机 |
| Week 3 | 客户订单页、财务、附件、Dashboard、通知、Docker、冷启动数据 |

---

## 9. 验收标准（MVP Done）

1. 客户能登录 → 看价 → 提交 RFQ；Broker 收到通知
2. Broker 能分配、录报价、发通知；客户能确认/拒绝
3. 确认后订单出现，Broker 可推进五态并有时间轴
4. 财务可记收/付/赔；附件可下载
5. Docker Compose 一键起；无 P0 阻断 bug

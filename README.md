# CompriX（scu-broker）

算力 / Token **行情大厅 + Broker 成交操作系统**。原则：**人谈机记**——线下谈价，系统记录状态、报价、财务与脱敏动态。

| 文档 | 用途 |
|------|------|
| [docs/PRODUCT_V4_算力远期与对冲.md](docs/PRODUCT_V4_算力远期与对冲.md) | 战略方向：远期合约 / 现金结算 / 交割通道 |
| [docs/V4_开发需求与设计.md](docs/V4_开发需求与设计.md) | **领导汇报：开发目标、功能范围与边界、阶段计划** |
| [docs/指数规则.md](docs/指数规则.md) | 价格指数对客一页纸 |
| [docs/结算规则.md](docs/结算规则.md) | 远期现金结算对客一页纸 |
| [docs/交割规则.md](docs/交割规则.md) | 实物交割对客一页纸 |
| [docs/客户方案.md](docs/客户方案.md) | 对外展示（现货协作） |
| [docs/CompriX_需求文档_REQUIREMENTS.md](docs/CompriX_需求文档_REQUIREMENTS.md) | 现货需求与验收 |
| [docs/PRODUCT_V3.md](docs/PRODUCT_V3.md) | 现货技术落地细则 |
| [PRD.md](PRD.md) | 立项初期极简 PRD |

## 结构

```
apps/api           Express + Sequelize + MySQL
apps/web-customer  Vue3 + Tailwind（客户行情大厅）
apps/web-admin     Vue3 + Element Plus（Broker/Admin）
docker-compose.yml MySQL + API + Nginx
docs/              REQUIREMENTS · PRODUCT_V3 · UX_V2
plane/             Plane 台账
```

## 本地开发

```bash
# 1) MySQL
docker compose up -d mysql

# 2) API（:3000）
cp apps/api/.env.example apps/api/.env   # 若尚无
cd apps/api && npm install && npm run db:seed && npm run dev

# 3) 客户前台 http://localhost:5173
cd apps/web-customer && npm install && npm run dev

# 4) 管理后台 http://localhost:5174/admin/
cd apps/web-admin && npm install && npm run dev
```

默认账号：

| 入口 | 账号 | 密码 / 验证码 |
|------|------|----------------|
| 后台 Admin | 13800000000 | admin123 |
| 后台 Broker | 13800000001 | broker123 |
| 客户前台 | 任意 11 位手机号 | 开发验证码 `123456` |
| 演示客户 | 13911110001 ~ 003 | `123456` |
| 远期买方 / 卖方 | 13900001001 / 13900001002 | `123456` |

前台另有 **指数**、**持仓**、**账单** 入口（V4 现金结算）；后台有 **价格指数**、**远期合约台**、**远期结算**。

## 已落地能力（摘要）

- **客户**：行情板首屏（热门报价 + Live 30s 轮询 + ticker）、通告、SKU 详情、两步询价（时长档位）、工作台倒计时、报价确认/拒绝；指数 S、远期持仓确认、结算账单、窗口内实物交割申请
- **后台**：RFQ/报价/订单五态、财务手记账、附件、通告、SKU 运营字段、成交动态发布、报价过期任务；指数发布、远期开仓/代理确认/批结算、交割通道/白名单/工单、Dashboard 北星与实物占比
- **测试**：`apps/api` 功能套件覆盖现货 + 指数/现金结算/实物交割（`12`/`13`/`14`）；沙盘 `npm run sandbox:forward`

## 功能测试

```bash
cd apps/api
npm run db:seed
npm run test:functional
# 仓库根目录也可: npm test
```

## Docker 一键

```bash
cd apps/web-customer && npm run build
cd ../web-admin && npm run build
cd ../.. && docker compose up -d --build
# http://localhost:8080/ 与 http://localhost:8080/admin/
```

# CompriX（scu-broker）

算力 / Token **行情大厅 + Broker 成交操作系统**。原则：**人谈机记**——线下谈价，系统记录状态、报价、财务与脱敏动态。

| 文档 | 用途 |
|------|------|
| [docs/客户方案.md](docs/客户方案.md) | **对外展示方案（推荐给客户）** |
| [docs/PRODUCT_V3.md](docs/PRODUCT_V3.md) | 产品+技术落地细则（研发） |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | MVP 状态机 / 验收基线 |
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

## 已落地能力（摘要）

- **客户**：行情板首屏（热门报价 + Live 30s 轮询 + ticker）、通告、SKU 详情、两步询价（时长档位）、工作台倒计时、报价确认/拒绝
- **后台**：RFQ/报价/订单五态、财务手记账、附件、通告、SKU 运营字段、成交动态发布、报价过期任务
- **测试**：`apps/api` 功能套件覆盖 MVP + V3 已实现面

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

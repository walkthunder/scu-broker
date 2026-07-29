# CompriX（scu-broker）

算力 / Token **行情大厅 + Broker 成交操作系统**。原则：**人谈机记**——线下谈价，系统记录状态、报价、财务与脱敏动态。

| 文档 | 用途 |
|------|------|
| [docs/PRODUCT_V4_算力远期与对冲.md](docs/PRODUCT_V4_算力远期与对冲.md) | 战略方向：远期合约 / 现金结算 / 交割通道 |
| [docs/V4_开发需求与设计.md](docs/V4_开发需求与设计.md) | 领导汇报：开发目标、功能范围与边界、阶段计划 |
| [docs/指数规则.md](docs/指数规则.md) | 价格指数对客一页纸 |
| [docs/结算规则.md](docs/结算规则.md) | 远期现金结算对客一页纸 |
| [docs/交割规则.md](docs/交割规则.md) | 实物交割对客一页纸 |
| [docs/权益规则.md](docs/权益规则.md) | 认购/认沽（使用权/保障服务） |
| [docs/FRD_实现映射.md](docs/FRD_实现映射.md) | 硅元引擎 FRD 全量功能映射 |
| [docs/客户方案.md](docs/客户方案.md) | 对外展示（现货协作） |
| [docs/CompriX_需求文档_REQUIREMENTS.md](docs/CompriX_需求文档_REQUIREMENTS.md) | 现货需求与验收 |
| [docs/PRODUCT_V3.md](docs/PRODUCT_V3.md) | 现货技术落地细则 |
| [deploy/README.md](deploy/README.md) | **生产部署、访问地址、脚本说明** |
| [PRD.md](PRD.md) | 立项初期极简 PRD |

## 结构

```
apps/api           Express + Sequelize + MySQL / MariaDB
apps/web-customer  Vue3 + Tailwind（客户行情大厅）
apps/web-admin     Vue3 + Element Plus（Broker/Admin）
apps/web-partner   Vue3 + Element Plus（供给伙伴门户）
deploy/            生产 Nginx / systemd / 低内存 MariaDB 片段
docker-compose.yml 本地 MySQL + API + Nginx
docs/              需求与规则
plane/             Plane 台账
```

资金与价格：**Ledger** 管 FRD 衍生品可用/冻结；**Payment** 管 RFQ 订单应收应付。结算价以价格公告双人复核为准（引擎产出不可在指数台单笔绕过）。详见 [docs/FRD_实现映射.md](docs/FRD_实现映射.md)。

## 访问地址

### 生产（路径前缀 `/scu`）

| 入口 | URL |
|------|-----|
| 客户前台 | https://computx.webinfra.cloud/scu/ |
| 管理后台 | https://computx.webinfra.cloud/scu/admin/ |
| 伙伴门户 | https://computx.webinfra.cloud/scu/partner/ |
| API 健康检查 | https://computx.webinfra.cloud/scu/api/health |

### 本地开发

| 入口 | URL |
|------|-----|
| 客户前台 | http://localhost:5173/ |
| 管理后台 | http://localhost:5174/admin/ |
| 伙伴门户 | http://localhost:5175/partner/ |
| API | http://localhost:3000/api/health |
| Docker 一键 | http://localhost:8080/ 与 http://localhost:8080/admin/ |

## 试用账号

本地 `npm run db:seed` 与生产种子一致：

| 角色 | 账号 | 密码 | 说明 |
|------|------|------|------|
| 客户买方 | `buyer@comprix.local` | `Pass1234!` | 前台邮箱登录；已开通交割白名单 |
| 客户卖方 | `seller@comprix.local` | `Pass1234!` | 同上 |
| Admin | `13800000000` | `admin123` | 后台；前台亦可用手机号登录 |
| Broker | `13800000001` | `broker123` | 后台 |
| 供给伙伴 | `partner@comprix.local` / `13900002001` | `partner123` | 伙伴门户 / 后台登录 |
| 演示注册 | 任意邮箱 | 验证码 | 开发环境未配 SMTP 时默认 `123456` |

客户登录支持**邮箱或手机号** + 密码；注册 / 忘记密码走邮件验证码。

## 本地开发

```bash
# 1) MySQL
docker compose up -d mysql

# 2) API（:3000）
cp apps/api/.env.example apps/api/.env
cd apps/api && npm install && npm run db:seed && npm run dev

# 3) 客户前台 http://localhost:5173
cd apps/web-customer && npm install && npm run dev

# 4) 管理后台 http://localhost:5174/admin/
cd apps/web-admin && npm install && npm run dev

# 5) 伙伴门户 http://localhost:5175/partner/
cd apps/web-partner && npm install && npm run dev
```

前台另有 **指数**、**现货挂单**、**持仓/预售**、**权益**、**控制台**、**账单**、**账号** 入口。后台有 **价格发现 FRD**、**价格指数**、**远期/预售台**、**认购认沽**、**CRM**、**交割**、**风控与作业**、**伙伴入驻**。

演示种子：H100/H200/PPU/算力 Token × 上海/内蒙/贵州；伙伴 `partner@comprix.local` / `partner123`。

## 已落地能力（摘要）

- **客户**：行情板、询价成交、指数 S、远期/预售、权益行权、控制台资金与待办、交割意愿与实物申请
- **后台**：价格引擎双人发布、挂单/RFQ、远期保证金与结算、认购认沽、交割对账/违约、CRM、风控作业
- **伙伴**：入驻申请、产能、渠道成交上报、交割凭证
- **测试**：`apps/api` 功能套件（含 `15-frd-core`）；沙盘 `npm run sandbox:forward`

## 功能测试

```bash
cd apps/api
npm run db:seed
npm run test:functional
# 仓库根目录也可: npm test
```

## Docker 一键（本地）

```bash
cd apps/web-customer && npm run build
cd ../web-admin && npm run build
cd ../.. && docker compose up -d --build
# http://localhost:8080/ 与 http://localhost:8080/admin/
```

## 生产部署

详见 **[deploy/README.md](deploy/README.md)**。摘要：

```bash
# 子路径构建
VITE_BASE=/scu/ VITE_API_BASE=/scu/api npm run build --prefix apps/web-customer
VITE_BASE=/scu/admin/ VITE_API_BASE=/scu/api npm run build --prefix apps/web-admin
```

- 静态站：`/opt/scu-broker/www/scu/`（含 `admin/`）
- API：`systemd scu-api`，端口 **3010**，`PUBLIC_PATH_PREFIX=/scu`
- 数据库：主机 MariaDB 库名 **`comprix`**（与同机其它库隔离）
- Nginx：仅追加 `/scu*` location，备份后再改

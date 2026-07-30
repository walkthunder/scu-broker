# CompriX（scu-broker）

算力 / Token **行情大厅 + Broker 成交操作系统**，并延伸至价格指数、远期/预售对冲、交割与伙伴协作。原则：**人谈机记**——线下谈价，系统记状态、报价、财务与脱敏动态。

| 文档 | 用途 |
|------|------|
| **[docs/交付功能说明.md](docs/交付功能说明.md)** | **面向客户交付**的完整产品能力介绍（角色、路径、验收） |
| **[docs/产品设计与需求.md](docs/产品设计与需求.md)** | **唯一**设计目标与需求（含规则与验收细则） |
| **[docs/测试说明.md](docs/测试说明.md)** | 三端页面接口覆盖矩阵、缺口与跑测方式 |
| [deploy/README.md](deploy/README.md) | 生产部署、访问地址、脚本 |
| [docs/TEAM_STANDARDS.md](docs/TEAM_STANDARDS.md) | 提交与扫描规范 |

## 结构

```
apps/api           Express + Sequelize + MySQL / MariaDB
apps/web-customer  Vue3 + Tailwind（客户行情大厅）
apps/web-admin     Vue3 + Element Plus（Broker/Admin）
apps/web-partner   Vue3 + Element Plus（供给伙伴门户）
deploy/            生产 Nginx / systemd / 低内存 MariaDB 片段
docker-compose.yml 本地 MySQL + API + Nginx
docs/              产品设计与需求、开发规范
plane/             Plane 台账
```

资金与价格：**Ledger** 管 FRD 衍生品可用/冻结；**Payment** 管 RFQ 订单应收应付。结算价以价格公告双人复核为准。详见 [docs/产品设计与需求.md](docs/产品设计与需求.md)。

## 访问地址

### 生产（路径前缀 `/scu`）

| 入口 | URL |
|------|------|
| 客户前台 | https://computx.webinfra.cloud/scu/ |
| 管理后台 | https://computx.webinfra.cloud/scu/admin/ |
| 伙伴门户 | https://computx.webinfra.cloud/scu/partner/ |
| API 健康检查 | https://computx.webinfra.cloud/scu/api/health |

### 本地开发

| 入口 | URL |
|------|------|
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

前台：指数、现货挂单、持仓/预售、权益、控制台、账单、账号。后台：价格发现、指数、远期、认购认沽、CRM、交割、风控、伙伴。

## 已落地能力（摘要）

- **客户**：行情、询价成交、指数、远期/预售、权益、控制台、交割意愿  
- **后台**：价格引擎双人发布、挂单/RFQ、远期结算、权益、交割、CRM、风控作业  
- **伙伴**：入驻、产能、渠道成交、凭证  
- **测试**：`npm test` / 页面接口矩阵见 [docs/测试说明.md](docs/测试说明.md)；沙盘 `npm run sandbox:forward`

## 功能测试

```bash
cd apps/api && npm run db:seed && npm run test:functional
# 或仓库根目录: npm test
```

覆盖矩阵与缺口：[docs/测试说明.md](docs/测试说明.md)。

## Docker 一键（本地）

```bash
cd apps/web-customer && npm run build
cd ../web-admin && npm run build
cd ../.. && docker compose up -d --build
```

## 生产部署

详见 **[deploy/README.md](deploy/README.md)**。摘要：

```bash
VITE_BASE=/scu/ VITE_API_BASE=/scu/api npm run build --prefix apps/web-customer
VITE_BASE=/scu/admin/ VITE_API_BASE=/scu/api npm run build --prefix apps/web-admin
VITE_BASE=/scu/partner/ VITE_API_BASE=/scu/api npm run build --prefix apps/web-partner
```

- 静态：`/opt/scu-broker/www/scu/`（含 `admin/`、`partner/`）  
- API：`scu-api`，端口 **3010**，`PUBLIC_PATH_PREFIX=/scu`  
- DB：主机 MariaDB 库 **`comprix`**（与同机其它库隔离）  
- Nginx：仅追加 `/scu*` location  

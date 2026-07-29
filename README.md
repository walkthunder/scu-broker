# CompriX（scu-broker）

算力 / Token **行情大厅 + Broker 成交操作系统**。原则：**人谈机记**——线下谈价，系统记录状态、报价、财务与脱敏动态。

| 文档 | 用途 |
|------|------|
| [docs/PRODUCT_V4_算力远期与对冲.md](docs/PRODUCT_V4_算力远期与对冲.md) | 战略方向：远期合约 / 现金结算 / 交割通道 |
| [docs/V4_开发需求与设计.md](docs/V4_开发需求与设计.md) | 领导汇报：开发目标、功能范围与边界、阶段计划 |
| [docs/指数规则.md](docs/指数规则.md) | 价格指数对客一页纸 |
| [docs/结算规则.md](docs/结算规则.md) | 远期现金结算对客一页纸 |
| [docs/交割规则.md](docs/交割规则.md) | 实物交割对客一页纸 |
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
deploy/            生产 Nginx / systemd / 低内存 MariaDB 片段
docker-compose.yml 本地 MySQL + API + Nginx
docs/              需求与规则
plane/             Plane 台账
```

## 访问地址

### 生产（路径前缀 `/scu`）

| 入口 | URL |
|------|-----|
| 客户前台 | https://computx.webinfra.cloud/scu/ |
| 管理后台 | https://computx.webinfra.cloud/scu/admin/ |
| API 健康检查 | https://computx.webinfra.cloud/scu/api/health |

### 本地开发

| 入口 | URL |
|------|-----|
| 客户前台 | http://localhost:5173/ |
| 管理后台 | http://localhost:5174/admin/ |
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
```

前台另有 **指数**、**持仓**、**账单**、**账号（改密）** 入口。后台有 **价格指数**、**远期合约台**、**远期结算**、**实物交割**。

演示种子含 6 条价格指数（H100-M / H100-H / H800-H / A100-H / GPT-T / DS-T），当日 S 由对应 SKU 参考价 mid 发布。日常：后台「参考价」→「价格指数」生成/发布；已用于结算的 S 不可改。详见 [docs/指数规则.md](docs/指数规则.md)。

## 已落地能力（摘要）

- **客户**：行情板首屏（热门报价 + Live 30s 轮询 + ticker）、通告、SKU 详情、两步询价、工作台倒计时、报价确认/拒绝；指数 S、远期持仓确认、结算账单、窗口内实物交割申请
- **后台**：RFQ/报价/订单五态、财务手记账、附件、通告、SKU 运营字段、成交动态发布、报价过期任务；指数发布、远期开仓/代理确认/批结算、交割通道/白名单/工单、Dashboard 北星与实物占比
- **测试**：`apps/api` 功能套件覆盖现货 + 指数/现金结算/实物交割（`12`/`13`/`14`）；沙盘 `npm run sandbox:forward`

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

# CompriX 生产部署（路径前缀 `/scu`）

## 线上地址（computx）

| 入口 | URL |
|------|-----|
| 客户前台 | https://computx.webinfra.cloud/scu/ |
| 管理后台 | https://computx.webinfra.cloud/scu/admin/ |
| 伙伴门户 | https://computx.webinfra.cloud/scu/partner/ |
| API 健康检查 | https://computx.webinfra.cloud/scu/api/health |

与同机 Dify（域名根路径 `/`）隔离：仅增加 Nginx `location ^~ /scu*`，不改既有反代。

## 试用账号（种子数据）

与本地 `npm run db:seed` 一致：

| 角色 | 账号 | 密码 |
|------|------|------|
| 客户买方 | `buyer@comprix.local` | `Pass1234!` |
| 客户卖方 | `seller@comprix.local` | `Pass1234!` |
| Admin | `13800000000` | `admin123` |
| Broker | `13800000001` | `broker123` |

客户前台可用邮箱或手机号登录；后台 Admin/Broker 用手机号（或已绑邮箱）。买方/卖方种子账号已开通实物交割白名单。

## 服务器布局

| 路径 / 服务 | 说明 |
|-------------|------|
| `/opt/scu-broker/` | 代码、静态站、uploads |
| `/opt/scu-broker/www/scu/` | 客户前台静态资源 |
| `/opt/scu-broker/www/scu/admin/` | 管理后台静态资源 |
| `scu-api.service` | API，监听 `127.0.0.1:3010`（避免与同机 :3000 冲突） |
| MariaDB 库 `comprix` | 业务库；勿动同机其它库（如 `deployflow`） |
| `/opt/scu-broker/apps/api/.env` | 生产密钥（权限 600，**不进 Git**） |

## 本目录脚本

| 文件 | 作用 |
|------|------|
| `nginx-scu.snippet.conf` | 插入 `computx.conf`、位于 `location /` **之前** |
| `mariadb-lowmem.cnf` | 同机低内存：`innodb_buffer_pool=128M` 等 |
| `setup-db-env.sh` | 建库用户、写 `.env`、`npm install` |
| `scu-api.service` | systemd 单元（MemoryMax=512M） |
| `activate.sh` | 插入 Nginx 片段、seed、启 API |
| API `npm run db:seed:market` | 幂等回填近 N 日参考价 + 当日公告/指数/做市（不重置账号） |

## 更新发布（简要）

在开发机：

```bash
VITE_BASE=/scu/ VITE_API_BASE=/scu/api npm run build --prefix apps/web-customer
VITE_BASE=/scu/admin/ VITE_API_BASE=/scu/api npm run build --prefix apps/web-admin
VITE_BASE=/scu/partner/ VITE_API_BASE=/scu/api npm run build --prefix apps/web-partner
rsync -az --delete --exclude admin --exclude partner apps/web-customer/dist/ root@<host>:/opt/scu-broker/www/scu/
rsync -az --delete apps/web-admin/dist/ root@<host>:/opt/scu-broker/www/scu/admin/
rsync -az --delete apps/web-partner/dist/ root@<host>:/opt/scu-broker/www/scu/partner/
rsync -az --exclude node_modules --exclude .env apps/api/ root@<host>:/opt/scu-broker/apps/api/
```

在服务器：

```bash
cd /opt/scu-broker/apps/api && npm install --omit=dev
# 日切后若大厅空价：幂等补行情（不重置账号）
npm run db:seed:market
systemctl restart scu-api
# Nginx 若仅改静态可不动；改 location 后: nginx -t && kill -HUP $(cat /run/nginx.pid)
```

注意：部分环境 `systemctl reload nginx` 可能因 PrivateTmp/`/tmp` 失败，可用 `nginx -t` + `kill -HUP`。

## 资源与安全

- 推荐起步：同机另有重服务时，为 CompriX 预留约 **+200MB RAM**（API+小缓冲池 MariaDB）。
- 生产务必改 `.env` 中 `JWT_SECRET`、`ADMIN_PASSWORD`、DB 密码；关闭空 `SMTP` 时勿依赖 `DEV_OTP`。
- 禁止对本机执行会波及 Dify 的 `docker system prune -a` / 停无关容器。

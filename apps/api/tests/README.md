# 功能测试说明

对齐 [`docs/REQUIREMENTS.md`](../../../docs/REQUIREMENTS.md)。

## 运行

```bash
# 1) MySQL + API 已启动
docker compose up -d mysql
cd apps/api && npm run dev

# 2) 初始化数据后全量测
cd apps/api
npm run db:seed
npm run db:seed:demo
npm run test:functional
```

## 用例与需求映射

| 前缀 | 含义 |
|------|------|
| R-AUTH-* | 鉴权 |
| R-P0-* | P0 功能 |
| R-P1-* | P1 功能 |
| R-GAP-* | PRD 缺口约定 |
| R-ACCEPT-* | 验收标准 |
| R-INFRA | 基础设施/错误体 |

## 目录

- `lib/` — HTTP / assert / auth / runner
- `cases/` — 按域拆分的用例
- `run.js` — 入口

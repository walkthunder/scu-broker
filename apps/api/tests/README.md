# 功能测试说明

对齐 [`docs/产品设计与需求.md`](../../../docs/产品设计与需求.md) 验收章节。

## 运行

```bash
docker compose up -d mysql
cd apps/api && npm run db:seed && npm run test:functional
# 仓库根目录也可: npm test
```

## 用例前缀

| 前缀 | 含义 |
|------|------|
| R-AUTH-* / R-P0-* / R-P1-* | 现货鉴权与功能 |
| R-GAP-* / R-ACCEPT-* / R-INFRA | 缺口约定、验收、基建 |
| V3-* / V4-* | 行情运营 / 指数远期交割 |
| FR-* | 硅元引擎 FRD |

## 目录

- `lib/` — HTTP / assert / auth / runner  
- `cases/` — 按域拆分  
- `run.js` — 入口  

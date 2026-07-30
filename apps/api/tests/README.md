# 功能测试说明

对齐 [`docs/产品设计与需求.md`](../../../docs/产品设计与需求.md) 验收，以及 **页面接口覆盖矩阵**：[docs/测试说明.md](../../../docs/测试说明.md)。

## 运行

```bash
docker compose up -d mysql
cd apps/api && npm run db:seed
# 另开终端保持 API：FRD_SCHEDULER=0 npm run dev
npm run test:functional
# 仓库根目录也可: npm test
```

## 用例前缀

| 前缀 | 含义 |
|------|------|
| R-AUTH-* / R-P0-* / R-P1-* | 现货鉴权与功能 |
| R-GAP-* / R-ACCEPT-* / R-INFRA | 缺口约定、验收、基建 |
| V3-* / V4-* | 行情运营 / 指数远期交割 |
| FR-* | 硅元引擎 FRD |
| PAGE-* | 三端页面接口补全（`cases/16-page-apis.js`） |

## 目录

- `lib/` — HTTP / assert / auth / runner  
- `cases/` — 按域拆分（`01`…`16`）  
- `run.js` — 入口  

完整矩阵、缺口与手工清单见 **`docs/测试说明.md`**。

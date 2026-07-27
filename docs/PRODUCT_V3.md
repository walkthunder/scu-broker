# CompriX V3 完整方案（产品 × 技术 × 运营）

> **文档地位**：研发落地真相源（产品规格 + 接口 + 分期）。  
> **对外展示请优先使用**：[客户方案.md](./客户方案.md)（表述已按商务沟通规范整理）。
>
> 综合来源：[`PRODUCT_UX_V2.md`](./PRODUCT_UX_V2.md)、[`REQUIREMENTS.md`](./REQUIREMENTS.md)、现网 `apps/*`。  
> **原则**：人谈机记；以真实可运营数据呈现市场活跃度，禁止伪造人气；一期不建设自动撮合、链、IM、自动支付、AI。

---

## 0. V3 相对 V2 的决策锁死（开干前不再摇摆）

| # | 议题 | V3 默认 |
|---|------|--------|
| 1 | 首屏氛围 | **行情板优先**，不做大留白品牌 Hero。顶栏一行标识 + LIVE；热门报价格为第一视口主体。可选背景纹理，不上线阻塞于买图 |
| 2 | 参考价涨跌 | **今日 `price_mid` vs 昨日同 SKU**；昨日无数据 → 显示 `—`；**不落库** `change_pct`（接口实时算） |
| 3 | 成交动态 | **平台侧决定 + Broker 一键发布**；不强制客户授权（降低摩擦）。区域必须粗粒度（`东部/南部/西部/北部/海外`）。Phase C 可加订单「允许展示」勾选作增强 |
| 4 | RFQ 状态 | **保持** `pending / quoted / confirmed / rejected`（+ 可选 `closed`）。不引入「已分配/撮合中」新枚举；分配用 `broker_id` 空否表达，SLA 用时间派生 |
| 5 | 客户可见留言 | **不新建 `customer_views` 表**；用 `quotes.customer_view_note` + `order_logs.is_customer_visible` |
| 6 | 草稿询价 | **仅前端 localStorage**；不做后端 draft API（V3-A） |
| 7 | 站内信 | Phase B 建 `notifications`；Phase A 仅短信/邮件日志（现有 notify 服务） |
| 8 | 报价有效期 | 已有 `sent_at` + `expiry_time`（+24h）；前台算剩余秒；**hourly cron** 把过期 `pending` → `expired`（新增状态） |

---

## 1. 产品定位与体验目标

**一句话**：CompriX = **算力行情与询价入口（C）** + **Broker 线下成交操作系统（B）**。

| 角色感知 | 目标 |
|----------|------|
| 客户 | 「有货、有价、有人跟、有进度」——像在运营的交易大厅，不是后台报表 |
| Broker | 「单子进得来、SLA 看得见、报价发得出、账记得清」 |
| 运营 | 每日能 15 分钟内更新价、通告、发布 0–N 条动态 |

**成功指标**

| 指标 | 目标（上线 4 周） |
|------|-------------------|
| 行情页 → 提交询价转化 | 可度量基线，周环比提升 |
| 发送报价 → 确认率 | ≥ 内测基线 |
| 热门 SKU / 通告 / 动态「非空」天数 | ≥ 80% 工作日 |
| 前台露出测试 SKU | **0** |

---

## 2. 信息架构

### 2.1 客户前台

```
/                 行情大厅（Hero + 通告 + 热门卡 + 全表 + 动态 + 信任）
/sku/:id          SKU 详情
/rfq              提交询价（两步）
/rfq/success      提交成功
/mine             我的工作台（原「我的订单」升级）
/rfqs/:id         询价/报价详情（倒计时）
/orders/:id       订单详情（进度 + 可见留言）
/about            服务与保障
/login            手机号验证码
```

### 2.2 管理后台

```
今日工作台        KPI + SLA 行动队列
询价池            列表/筛选/分配/抽屉（含客户可见预览）
订单履约          五态 + 日志 + 附件
财务记账          收/付/赔
行情与供给        SKU（可见/热门/卖点）+ 参考价（含批量）+ 供应商
运营配置          通告 + 成交动态发布
（账号沿用 seed，不做复杂账号中心）
```

---

## 3. 客户页面规格（体验层）

### 3.1 行情大厅 `/`

**首屏原则（V3 修正）**：按**交易所 / 行情板**做，不做大留白品牌 Landing。  
第一视口必须能直接看价、询价；品牌压缩为一行标识，**热门报价板**才是视觉主体。

**首屏结构（顶栏一体）**

| 层 | 内容 | 说明 |
|----|------|------|
| 0 | 通告条 | 有则显示，高度紧凑 |
| 1 | 交易台顶栏 | `CompriX` + LIVE + 时钟 + 一句主张 + `询价`/`全表` CTA（**禁止**大标题占半屏） |
| 2 | 热门报价板 3–6 格 | 紧凑网格：SKU / 中位 / 涨跌 / 低高区间；点击进详情，格内可询价 |
| 3 | 脉搏 + 横向滚动 ticker | 同步状态、SKU 有价数、成交动态跑马灯（真实数据，禁假人气） |
| ↓ | 完整行情表 | 紧贴首屏下方，不要再留一整屏空白才出现表格 |

**首屏以下**

| 序 | 模块 |
|----|------|
| 4 | 脱敏成交动态列表（补充 ticker） |
| 5 | 信任三则（一行压缩，非大卡堆叠） |
| 6 | 底栏询价条 |

**前台 Live 感知（禁止假人气）**

| 能力 | 约定 |
|------|------|
| 自动刷新 | 大厅 `GET` 行情相关接口 **每 30s** 静默轮询；Tab 隐藏时暂停，回到前台立即补拉 |
| 时钟 | 顶栏展示 `Asia/Shanghai` 时分秒；同步态「刚刚同步 / N 秒前同步」 |
| LIVE 标识 | 脉冲圆点 + `LIVE`；**不**展示虚构在线人数/假聊天 |
| 变更反馈 | 中位价或涨跌变化时，对应报价格/表行短暂高亮 |
| 动态 ticker | 顶栏下方横向滚动已发布成交文案（无动态则滚动脉搏/SLA 文案） |
| 手动刷新 | 脉搏行提供「刷新」 |

**测试/脏数据**：`is_public=false` 或名称 `SKU-T-%` 强制不出前台列表与热门。

### 3.2 SKU 详情 `/sku/:id`

卖点、规格、今日低中高（含 bar）、涨跌、近 30 日成交区间、交期说明、询价 CTA。404 当 `!is_public`。

### 3.3 询价两步 `/rfq`

1. 需求：SKU/数量/时长/交付；旁注「参考中位×数量」非承诺  
2. 联系：姓名/公司/手机只读/预算/备注；`submit_page` 埋点  
localStorage 草稿键：`comprix_rfq_draft`。成功页 `/rfq/success`。

**默认值与结构化时长（必做）**

| 字段 | 默认 / UI |
|------|-----------|
| 数量 | `1`；旁注按 SKU `unit` 解释（卡数 / 百万 token 等） |
| 期望交付 | 当天 +7 日（`date` 控件，可改） |
| 时长 | **禁止自由填写为主路径**；按时价单位给档位芯片：`小时`→3天/1周/约1月/约3月；`月`→1/3/6/12个月；`年`→1/2/3年；`百万token`→按量/月额度档。仅「其他」可手填 |
| 预算 | 选填档位：不确定 / 5万以内 / 5–20万 / 20–50万 / 50万以上 |

### 3.4 我的工作台 `/mine`

待办（pending 报价 + **每秒倒计时**）→ 询价列表 → 订单列表；空态回大厅。列表约 **30s** 静默刷新（与大厅一致）。

### 3.5 报价确认

价格、交付、脱敏供应商、`customer_view_note`、倒计时；确认/拒绝（拒绝原因枚举 Phase C，V3-A 选填文本即可）。

---

## 4. 数据模型（相对线上 MVP 的增量）

### 4.1 `skus` 扩展

| 字段 | 类型 | 说明 |
|------|------|------|
| `is_public` | bool default true | 前台可见 |
| `is_hot` | bool default false | 首页热门候选 |
| `sort_weight` | int default 0 | 越大越靠前 |
| `selling_point` | varchar(255) | ≤20 汉字建议 |
| `delivery_note` | text | 交期运营文案 |
| `image_url` | varchar(500) null | 卡片图，可空 |

**热门选取**：`is_public AND status=active AND is_hot` ORDER BY `sort_weight DESC, id` LIMIT 6。

### 4.2 `announcements` 新表

`id, title, content, position(top|banner), bg_color, text_color, is_active, start_time, end_time, created_by, created_at`

规则：最多展示 1 条「active 且 now∈[start,end]」；按 `id DESC`。

### 4.3 `deal_feeds` 新表

`id, order_id, region, sku_name, deal_type, deal_date, is_published, published_by, published_at, created_at`

- 订单 → `已完成`：**自动插草稿**（region 默认由供应商 `note`/`display_name` 启发式或「东部」占位，Broker 发布前可改）
- 前台仅 `is_published=true`，限 20 条
- **禁止**存价格、客户、供应商真名

### 4.4 `rfqs` 扩展

| 字段 | 说明 |
|------|------|
| `submit_page` | `home` / `table` / `sku` / `other` |
| `reject_reason` | 客户拒绝时写入（可空） |
| `sla_deadline` | 提交时 `created_at+6h`（便于索引筛 SLA） |

可选 Phase C：`closed` 状态。

### 4.5 `quotes` 扩展

| 字段 | 说明 |
|------|------|
| `customer_view_note` | 发给客户可见的说明 |
| `urgency_level` | `normal` / `urgent`（影响后台色，默认 normal） |

已有：`sent_at`, `expiry_time`, `status` 增加枚举值 **`expired`**。

### 4.6 `order_logs` 扩展

| 字段 | 说明 |
|------|------|
| `is_customer_visible` | bool default false；true 则订单时间轴对客户展示该条 `note` |

### 4.7 `notifications`（Phase B）

`id, user_id, channel(sms|email|in_app), template_code, payload_json, related_type, related_id, is_read, sent_at, created_at`

### 4.8 不做的模型

- ❌ `customer_views` 独立表（用 quote note + order_logs 标记）
- ❌ `reference_prices.change_pct` 落库（接口计算）
- ❌ 后端 RFQ draft 表

---

## 5. 状态机（与现网兼容）

### 5.1 RFQ

```
pending ──(send quote)──► quoted ──confirm──► confirmed
                         quoted ──reject───► rejected
pending/quoted ──(admin close, Phase C)──► closed
```

SLA（未报价且 status=pending）：

| 色 | 条件 |
|----|------|
| 绿 | now < created+4h |
| 黄 | +4h ≤ now < +6h |
| 红 | now ≥ created+6h 或 now ≥ sla_deadline |

### 5.2 Quote

```
draft → pending(sent) → confirmed | rejected | expired
```

- 发送：`status=pending`, `sent_at=now`, `expiry_time=now+24h`, RFQ→`quoted`
- 改价重录：回 `draft`，RFQ 若曾 quoted → 回 `pending`（现网已有）
- Cron：每小时 `pending AND expiry_time<now` → `expired`

### 5.3 Order（不变）

`待签约 → 待交付 → 待验收 → 待结算 → 已完成`；旁路 `已取消` / `已赔付`。  
完成时生成 `deal_feeds` 草稿。

---

## 6. API 清单（V3）

### 6.1 客户（新增/增强）

```
GET  /api/customer/announcement
GET  /api/customer/market-pulse      # price_as_of / pulse_text / published_feed_count / server_time
GET  /api/customer/hot-skus
GET  /api/customer/skus/:id          # 详情+今日价+涨跌+近30日成交
GET  /api/customer/deal-feeds        # 仅已发布；无 order_id/价格
GET  /api/customer/reference-prices  # 仅 is_public；含 change_pct / change_label
POST /api/customer/rfqs              # +submit_page；写 sla_deadline；时长由前台档位写入
GET  /api/customer/quotes/:id        # +remaining_seconds, customer_view_note
GET  /api/customer/orders/:id        # timeline 过滤 is_customer_visible
POST /api/customer/quotes/:id/reject # body 可带 reject_reason → 回写 rfq
```

### 6.2 管理端（新增/增强）

```
# 通告
GET/POST /api/admin/announcements
PUT/DELETE /api/admin/announcements/:id

# SKU 运营
PUT /api/admin/skus/:id              # 允许更新 is_public/is_hot/sort_weight/selling_point/...
POST /api/admin/skus/bulk-visibility # 可选 Phase C

# 参考价
POST /api/admin/reference-prices/bulk
GET  /api/admin/reference-prices/:skuId/history

# 成交动态
GET  /api/admin/deal-feeds?published=
POST /api/admin/deal-feeds/:id/publish
DELETE /api/admin/deal-feeds/:id

# 询价 SLA
GET  /api/admin/rfqs?sla=warning|overdue|ok

# 报价
PUT  /api/admin/quotes/:id/customer-view
PUT  /api/admin/quotes/:id/send      # 已有，确保写 sent_at/expiry

# 工作台
GET  /api/admin/dashboard            # 扩展 action_queue / sla counts
```

### 6.3 统一约定

- 错误体无 stack；前台 404 SKU 不暴露存在性细节时可统一「不存在或已下架」
- 上传仍 10MB；外部短信 30s 超时

---

## 7. 脱敏与合规

| 数据 | 客户前台 | 规则 |
|------|----------|------|
| 供应商真名/电话 | ❌ | 只用 `display_name` 或「平台优选供应商」 |
| 他人成交价/公司 | ❌ | 动态不展示 |
| 己方报价/订单价 | ✅ | 仅本人 |
| 区域 | ✅ 粗粒度 | 东部/南部/西部/北部/海外 |
| Broker 名 | ✅ | 增强信任 |
| Broker 电话 | ⚠️ | 默认报价阶段不展示；订单详情可展示（配置开关，默认关） |

发布动态前 Broker 可改 `region` / `deal_type` / `sku_name` 显示名，**不能**加价格字段。

---

## 8. 通知矩阵（Phase B 落地，A 只留钩子）

| 事件 | 对象 | A | B |
|------|------|---|---|
| 新询价 | Brokers | 日志/邮件若已配 | +短信模板 |
| 报价发送 | 客户 | 日志/邮件 | +短信 |
| 报价剩 &lt;4h | 客户 | — | 短信（cron） |
| SLA 4h/6h | Broker | 工作台色标 | +站内/短信 |
| 客户确认 | Broker | — | in_app |
| 订单状态 | 客户 | — | 可选短信 |

---

## 9. 视觉规范（交易感，非 SaaS）

| Token | 值 |
|-------|-----|
| 背景 | `#0f172a` |
| 表面 | `#1e293b` |
| 字主 | `#e2e8f0` |
| 字次 | `#94a3b8` |
| CTA/价 | `#f59e0b` |
| 涨 | `#ef4444` |
| 跌 | `#22c55e` |
| 边框 | `#334155` |

字体：`IBM Plex Sans` + 中文系统黑 / 数字 `IBM Plex Mono`（与现网接近，加深色主题即可）。  
圆角 ≤ 4px；禁大阴影、禁紫、禁奶油。

---

## 10. 开发分期（可排期）

### Phase A — 感知升级（约 2 周）★ 优先

- DB：SKU 字段 + `announcements`
- Admin：SKU 运营编辑、通告 CRUD
- Customer：大厅改版、热门卡、通告、表过滤 public、SKU 详情、询价两步+成功页、工作台待办雏形、报价剩余时间展示
- 种子：6 热门 + 1 通告；隐藏 `SKU-T-*`
- 视觉：深色大厅主题 + hero 可插图

### Phase B — 热闹与时效（约 1 周）

- 涨跌计算；`deal_feeds` 草稿+发布（Admin「成交动态」页）；quote `expired` + 过期任务接口
- 大厅 Live 30s 轮询 + ticker；seed 3–5 条已发布脱敏动态（可无 `order_id`）
- 通知模板与触发；dashboard SLA 队列（队列可后置，Live/动态优先）

### Phase C — 运营效率（约 1 周）

- 参考价批量录入；拒绝原因枚举；`order_logs` 客户可见；可选客户授权发布；bulk SKU

**总日历约 4 周**；可用 1 名运营保「热闹」燃料。

---

## 11. 与现网模型对照（迁移注意）

| 现网 | V3 |
|------|-----|
| `skus` 无运营字段 | alter 增加，默认 public=true；脚本把 `SKU-T-%` → `is_public=false` |
| `quotes.sent_at` 已有 | 补 `customer_view_note`、`expired` 状态 |
| `reference_prices` | 不改表；接口算涨跌 |
| RFQ 四态 | 保持；加 `sla_deadline`/`submit_page`/`reject_reason` |
| 客户前台 Tailwind 浅色 | Phase A 切深色主题（可 scoped 到大厅，或全站） |

---

## 12. 上线运营检查清单

- [ ] 6 个热门：卖点、sort、参考价、is_hot
- [ ] 全量 public SKU 今日价
- [ ] 1 条生效通告
- [ ] 3–5 条已发布或可发布动态（可用 seed）
- [ ] `/about` 法务口径
- [ ] 短信模板报备（B 阶段）
- [ ] Broker 3+ 账号演练
- [ ] 前台 0 条测试 SKU
- [ ] 内测 5 客户跑通：大厅→询价→报价→确认→订单

---

## 13. 冻结范围（V3 仍不做）

自动撮合、链、支付宝自动、IM、供应商评分体系、SCU、多语言、App、AI Copilot、前台虚假在线人数、Excel 导入参考价（C 可选再开）。

---

## 14. 风险与缓释

| 风险 | 缓释 |
|------|------|
| 无运营则首页重回死寂 | 清单责任制；Dashboard 提示「今日未更新参考价」 |
| 动态被联想泄密 | 粗区域 + 人工发布 + 禁价格 |
| 过期报价堆积 | hourly cron；日单 &lt;20 可接受 |
| 深色改版影响已习惯 | 一次切全客户前台，内测 2 天 |

---

## 15. 建议下一步（工程）

1. 评审本文 → 写入 Plane 里程碑 M004（V3-A）  
2. Migration + Admin 运营字段 + 客户大厅（第一迭代可看）  
3. 同步更新 `REQUIREMENTS.md` 为「MVP + V3-A 增量」或拆 `REQUIREMENTS_V3.md` 指向本文  

---

## 附录 A — 首页线框（行情板优先）

```
[通告条]
[顶栏: CompriX · LIVE · 时钟 · 主张 · 询价/全表]
[热门报价板 3–6 格]   ← 第一视口主视觉
[脉搏 + 成交 ticker]
[行情全表]
[成交动态列表]
[信任一行 + 底栏询价]
```

## 附录 B — 文档关系

| 文档 | 用途 |
|------|------|
| **[客户方案.md](./客户方案.md)** | **对外展示 / 商务评审** |
| `PRD.md` | 立项初期极简 MVP |
| `REQUIREMENTS.md` | 已实现 MVP 约定 |
| `PRODUCT_UX_V2.md` | 感知向产品稿 |
| **`PRODUCT_V3.md`（本文）** | **产品+技术完整落地版（研发）** |

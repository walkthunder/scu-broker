# CompriX MVP 技术方案（极简版）

> 目标：3周内上线，能跑闭环，能接单，不追求自动化，后台手动维护为主。

---

## 一、产品定位（极简一句话）

**「一个给 Broker 用的算力订单后台，附带一个让客户填询价单和确认报价的极简页面。」**

所有撮合、谈判、交付、验收、打款，**先走线下（微信/电话/邮件）**，结果录入系统。系统只负责**记录状态、生成报价单、通知客户、算清楚账**。

---

## 二、功能清单（只做这 6 个模块）

### 2.1 客户前台（3 个页面，纯展示+表单）

| 页面 | 功能 | 说明 |
|------|------|------|
| **参考价看板** | 展示各 SKU 当日参考价区间 | 只读，从后台读取，每日手动更新 |
| **提交询价** | 表单：公司名、联系人、SKU、数量、时长、期望交付时间、预算、备注 | 提交后发短信/邮件通知 Broker |
| **我的询价/订单** | 列表查看自己提交的所有询价和订单状态，点击可查看报价单详情，确认或拒绝 | 需要手机号+验证码登录，无需注册密码 |

### 2.2 管理后台（核心，6 个菜单）

| 菜单 | 功能 | 说明 |
|------|------|------|
| **参考价管理** | 手动录入/修改各 SKU 参考价，支持按日期查看历史 | Excel 导入导出（可选） |
| **供应商管理** | 录入供应商信息：名称、联系人、电话、擅长 SKU、报价风格、备注 | 纯文本字段，不做复杂画像 |
| **询价管理** | 查看所有 RFQ，分配给 Broker，标记状态 | 状态：待处理 → 已报价 → 已确认/已拒绝 |
| **报价管理** | Broker 录入报价结果：选供应商、填成交价、交付时间、备注 → 生成报价单 → 客户收到通知 | 支持上传线下谈判的附件（如微信截图、合同扫描件） |
| **订单管理** | 报价确认后自动生成订单，Broker 手动更新状态：待签约 → 待交付 → 待验收 → 待结算 → 已完成 | 每个状态变更可填备注，记录操作人 |
| **财务管理** | 查看应收/应付，手动标记：客户已付款、已放款给供应商、已赔付 | 不做自动支付对接，先记账 |

---

## 三、技术架构（一台服务器搞定）

```
┌─────────────────────────────────────┐
│           Nginx (反向代理)            │
├─────────────────────────────────────┤
│  客户前台 (Vue3 静态页)  │  管理后台 (Vue3 + Element Plus) │
├─────────────────────────────────────┤
│        Node.js / Express (单后端)     │
│         (或 Python / FastAPI)        │
├─────────────────────────────────────┤
│           MySQL 8.0 (单库)            │
│      (数据量<10万，单表完全够用)        │
├─────────────────────────────────────┤
│      本地文件存储 (或 MinIO 单节点)      │
└─────────────────────────────────────┘
```

**技术选型建议**：
- **后端**：Node.js + Express + Sequelize（如果你熟悉 JS 栈，开发最快）
- **或**：Python + FastAPI + SQLAlchemy（如果你更熟悉 Python）
- **数据库**：MySQL 8（或 PostgreSQL，差别不大）
- **前端**：Vue3 + Element Plus（后台）、Vue3 + Tailwind（客户前台）
- **文件存储**：本地目录 `/uploads` 先跑着，nginx 直接托管
- **通知**：阿里云短信 API + 邮件（SMTP）

---

## 四、数据库设计（10 张表，够用半年）

### 4.1 用户与权限

```sql
-- 用户表（客户、Broker、管理员都在这）
users
  id, phone, name, company_name, role(customer/broker/admin), 
  created_at, updated_at

-- 管理员和 Broker 给后台账号密码，客户只用手机号验证码登录
```

### 4.2 基础数据

```sql
-- SKU 表（卡型/Token 类型）
skus
  id, name(H100/A100等), type(gpu/token), unit(小时/月/百万token),
  spec(配置描述), status(active/inactive)

-- 供应商表
suppliers
  id, name, contact_name, contact_phone, wechat, 
  skus(擅长SKU，逗号分隔文本), price_style(偏高/中等/偏低), 
  reliability(靠谱/一般/需谨慎), note, created_at

-- 参考价表（每日手动录入）
reference_prices
  id, sku_id, date, price_low, price_mid, price_high, 
  source(人工录入), created_by, created_at
```

### 4.3 核心交易

```sql
-- 询价单（RFQ）
rfqs
  id, customer_id, sku_id, quantity, duration, 
  delivery_date, budget_range, note, 
  status(pending/quoted/confirmed/rejected), 
  broker_id(分配给谁), created_at

-- 报价单（Broker 线下谈好后录入）
quotes
  id, rfq_id, supplier_id, broker_id, 
  price(成交价), delivery_date, note, 
  status(pending/confirmed/rejected), 
  expiry_time(有效期，默认24小时), created_at

-- 订单（Quote 确认后生成）
orders
  id, quote_id, customer_id, supplier_id, broker_id,
  price, status(待签约/待交付/待验收/待结算/已完成/已取消/已赔付),
  signed_at, delivered_at, accepted_at, settled_at,
  penalty_amount(赔付金额), penalty_note, created_at

-- 订单状态变更日志（手动记录每次操作）
order_logs
  id, order_id, from_status, to_status, note, operator_id, created_at
```

### 4.4 财务与文件

```sql
-- 支付记录（手动标记）
payments
  id, order_id, type(客户付款/供应商放款/赔付), 
  amount, method(支付宝/对公/微信), 
  status(待确认/已确认), confirmed_by, created_at

-- 文件附件（谈判截图、合同、验收单）
attachments
  id, related_type(rfq/quote/order), related_id, 
  file_name, file_path, uploaded_by, created_at
```

---

## 五、API 设计（核心接口，约 20 个）

### 5.1 客户前台 API

```
POST   /api/customer/login          # 手机号+验证码登录
GET    /api/customer/reference-prices   # 获取参考价列表（当日）
POST   /api/customer/rfqs           # 提交询价
GET    /api/customer/rfqs           # 我的询价列表
GET    /api/customer/rfqs/:id       # 询价详情（含报价单）
POST   /api/customer/quotes/:id/confirm   # 确认报价
POST   /api/customer/quotes/:id/reject    # 拒绝报价
GET    /api/customer/orders         # 我的订单
GET    /api/customer/orders/:id   # 订单详情
```

### 5.2 后台 API

```
POST   /api/admin/login             # 管理员/Broker 登录

# 参考价
GET    /api/admin/reference-prices
POST   /api/admin/reference-prices  # 手动录入

# 供应商
GET    /api/admin/suppliers
POST   /api/admin/suppliers
PUT    /api/admin/suppliers/:id

# 询价
GET    /api/admin/rfqs              # 列表（可筛选状态）
PUT    /api/admin/rfqs/:id/assign   # 分配 Broker
POST   /api/admin/quotes            # Broker 录入报价
PUT    /api/admin/quotes/:id/send   # 发送报价给客户（改状态+通知）

# 订单
GET    /api/admin/orders
PUT    /api/admin/orders/:id/status   # 更新订单状态（通用）
POST   /api/admin/orders/:id/attachments # 上传附件

# 财务
GET    /api/admin/payments
POST   /api/admin/payments          # 手动录入收付款
```

---

## 六、页面设计（极简描述）

### 6.1 客户前台（3 页）

1. **参考价页**
   - 表格：SKU 名称 | 单位 | 今日参考价（低/中/高）| 近30日成交区间
   - 顶部放一句话："价格为市场参考，实际成交价以 Broker 报价为准"
   - 底部放「提交询价」按钮

2. **询价表单**
   - 字段：您的姓名、手机号（自动带登录态）、公司名称、选择 SKU（下拉）、数量、时长、期望交付日期、预算区间（选填）、备注
   - 提交后显示：「已提交，Broker 将在 2-6 小时内联系您」

3. **我的订单**
   - 列表：订单号 | SKU | 状态 | 最新更新时间
   - 点击进详情：询价信息 → 报价信息（价格、交付时间、供应商脱敏名）→ 确认/拒绝按钮 → 订单进度条

### 6.2 管理后台（6 个页面）

1. **Dashboard**
   - 数字卡片：今日询价数 | 待处理询价 | 本月成交单量 | 本月成交额
   - 列表：最近 5 条待处理询价

2. **参考价管理**
   - 表格展示，按日期筛选，点击编辑弹窗改价格，支持按 SKU 批量改

3. **供应商管理**
   - 表格：名称 | 联系人 | 擅长 SKU | 靠谱程度 | 操作
   - 新增/编辑：表单录入，纯文本

4. **询价管理（Broker 核心工作台）**
   - 左侧：状态筛选标签（待处理 / 已报价 / 已确认 / 已拒绝）
   - 右侧表格：询价号 | 客户公司 | SKU | 数量 | 提交时间 | 分配 Broker | 状态
   - 点击行 → 右侧滑出详情面板：
     - 客户信息（电话、微信）
     - 需求详情
     - 分配 Broker（下拉选）
     - 录入报价区（选供应商、填价格、交付时间、上传附件、生成报价单）
     - 发送报价按钮（客户收到短信/邮件通知）

5. **订单管理**
   - 表格：订单号 | 客户 | 供应商 | 成交价 | 状态 | 操作
   - 操作列：更新状态（下拉选择下一状态 + 填备注）
   - 详情页：完整信息 + 状态时间轴 + 附件列表

6. **财务管理**
   - 表格：订单号 | 应收客户 | 应付供应商 | 实收 | 实付 | 状态
   - 操作：手动标记收款、标记放款、录入赔付

---

## 七、开发计划（3 周上线）

### Week 1：基础骨架
- [ ] Day 1-2：数据库建表，后端基础框架搭建，登录接口
- [ ] Day 3-4：SKU 管理、供应商管理、参考价管理（后台 CRUD）
- [ ] Day 5：客户前台参考价展示页、询价表单

### Week 2：核心交易流
- [ ] Day 1-2：询价管理（提交、列表、分配 Broker）
- [ ] Day 3-4：报价管理（Broker 录入、生成报价单、客户确认/拒绝）
- [ ] Day 5：订单自动生成、订单状态流转、状态日志

### Week 3：收尾+财务
- [ ] Day 1-2：客户前台「我的订单」页面、订单进度展示
- [ ] Day 3：财务管理（手动记账）、附件上传
- [ ] Day 4：通知接入（短信/邮件）、Dashboard 统计
- [ ] Day 5：联调、部署、内测

---

## 八、部署方案（极简）

- **服务器**：1 台 2核4G 云服务器（阿里云/腾讯云），CentOS/Ubuntu
- **部署**：Docker Compose 一键启动（MySQL + 后端 + Nginx）
- **域名**：买一个，配 HTTPS（Let's Encrypt 免费证书）
- **备份**：MySQL 每日自动备份到对象存储（或本地 cron 脚本）
- **监控**：先不做，服务器挂了手动重启，日单量<20 不需要复杂监控

---

## 九、第一期明确不做的事（防止手痒）

| 不做 | 原因 |
|------|------|
| ❌ 自动撮合/匹配 | Broker 线下微信谈，系统只记结果 |
| ❌ AI Copilot | 推荐供应商？Broker 脑子里有名单 |
| ❌ 联盟链/区块链 | 数据库记时间戳就够了 |
| ❌ SCU 折算系统 | 按卡型×时长直接算钱，不搞内部单位 |
| ❌ 支付宝自动对接 | 先线下收款，后台手动标记 |
| ❌ 复杂供应商画像 | 文本框写备注就行，不打分 |
| ❌ 实时消息/IM | 客户和 Broker 加微信聊 |
| ❌ 多语言/出海 | 中文先跑起来 |
| ❌ 移动端 App | 客户前台做成响应式网页，手机能打开就行 |

---

## 十、冷启动数据准备（上线前）

- [ ] 录入 10-20 个 SKU（H100/H800/A100/A800/国产卡/主流 Token）
- [ ] 录入 30 家供应商（从 Excel 导入）
- [ ] 录入 3-5 个 Broker 账号
- [ ] 手动录入首日参考价（每个 SKU 填一个低中高区间）

---

## 总结

这个方案的核心思想是：**系统做「记录和通知」，人做「判断和谈判」**。第一期不要试图用系统替代 Broker 的专业能力，而是让 Broker 的工作有记录、可追溯、客户能看到进度。

3 周上线后，你们可以一边接单一边看哪些环节最痛，再决定下一期加什么功能（比如自动发短信、报价单 PDF 生成、简单的供应商响应速度统计）。

需要我把这个方案整理成 Markdown 文件存下来，或者展开某个具体模块（比如数据库详细字段、API 详细定义）吗？
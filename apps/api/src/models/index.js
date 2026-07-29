import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    phone: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: true },
    company_name: { type: DataTypes.STRING(200), allowNull: true },
    email: { type: DataTypes.STRING(200), allowNull: true, unique: true },
    password_hash: { type: DataTypes.STRING(200), allowNull: true },
    role: {
      type: DataTypes.ENUM('customer', 'broker', 'admin', 'partner'),
      allowNull: false,
      defaultValue: 'customer',
    },
    source: {
      type: DataTypes.ENUM('friend', 'partner', 'sales', 'event', 'other'),
      allowNull: true,
    },
    supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    blacklisted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: 'users' },
);

export const Sku = sequelize.define(
  'Sku',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    type: { type: DataTypes.ENUM('gpu', 'token'), allowNull: false, defaultValue: 'gpu' },
    unit: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '小时' },
    spec: { type: DataTypes.STRING(500), allowNull: true },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
    },
    is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    is_hot: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_weight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    selling_point: { type: DataTypes.STRING(255), allowNull: true },
    delivery_note: { type: DataTypes.TEXT, allowNull: true },
    image_url: { type: DataTypes.STRING(500), allowNull: true },
  },
  { tableName: 'skus' },
);

export const Supplier = sequelize.define(
  'Supplier',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    display_name: { type: DataTypes.STRING(100), allowNull: true },
    contact_name: { type: DataTypes.STRING(100), allowNull: true },
    contact_phone: { type: DataTypes.STRING(50), allowNull: true },
    wechat: { type: DataTypes.STRING(100), allowNull: true },
    skus: { type: DataTypes.STRING(500), allowNull: true },
    price_style: { type: DataTypes.STRING(50), allowNull: true },
    reliability: { type: DataTypes.STRING(50), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'suppliers' },
);

export const ReferencePrice = sequelize.define(
  'ReferencePrice',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'shanghai' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    price_low: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    price_mid: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    price_high: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    source: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '人工录入' },
    created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    tableName: 'reference_prices',
    indexes: [{ unique: true, fields: ['sku_id', 'region', 'date'] }],
  },
);

export const Rfq = sequelize.define(
  'Rfq',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    customer_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    duration: { type: DataTypes.STRING(100), allowNull: true },
    delivery_date: { type: DataTypes.DATEONLY, allowNull: true },
    budget_range: { type: DataTypes.STRING(100), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    region: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'shanghai' },
    status: {
      type: DataTypes.ENUM('pending', 'quoted', 'confirmed', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    },
    broker_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    submit_page: { type: DataTypes.STRING(50), allowNull: true },
    sla_deadline: { type: DataTypes.DATE, allowNull: true },
    reject_reason: { type: DataTypes.STRING(255), allowNull: true },
  },
  { tableName: 'rfqs' },
);

export const Quote = sequelize.define(
  'Quote',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    rfq_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    broker_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    price: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    delivery_date: { type: DataTypes.DATEONLY, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    customer_view_note: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('draft', 'pending', 'confirmed', 'rejected', 'expired'),
      allowNull: false,
      defaultValue: 'draft',
    },
    expiry_time: { type: DataTypes.DATE, allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'quotes' },
);

export const Order = sequelize.define(
  'Order',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    quote_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    customer_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    broker_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    price: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM(
        '待签约',
        '待交付',
        '待验收',
        '待结算',
        '已完成',
        '已取消',
        '已赔付',
      ),
      allowNull: false,
      defaultValue: '待签约',
    },
    signed_at: { type: DataTypes.DATE, allowNull: true },
    delivered_at: { type: DataTypes.DATE, allowNull: true },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    settled_at: { type: DataTypes.DATE, allowNull: true },
    penalty_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    penalty_note: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'orders' },
);

export const OrderLog = sequelize.define(
  'OrderLog',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    from_status: { type: DataTypes.STRING(50), allowNull: true },
    to_status: { type: DataTypes.STRING(50), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
    operator_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    is_customer_visible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: 'order_logs', updatedAt: false },
);

export const Payment = sequelize.define(
  'Payment',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    type: {
      type: DataTypes.ENUM('客户付款', '供应商放款', '赔付'),
      allowNull: false,
    },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    method: { type: DataTypes.STRING(50), allowNull: true },
    status: {
      type: DataTypes.ENUM('待确认', '已确认'),
      allowNull: false,
      defaultValue: '已确认',
    },
    confirmed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'payments' },
);

export const Attachment = sequelize.define(
  'Attachment',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    related_type: {
      type: DataTypes.ENUM('rfq', 'quote', 'order'),
      allowNull: false,
    },
    related_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    file_name: { type: DataTypes.STRING(255), allowNull: false },
    file_path: { type: DataTypes.STRING(500), allowNull: false },
    uploaded_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  },
  { tableName: 'attachments', updatedAt: false },
);

export const OtpCode = sequelize.define(
  'OtpCode',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    email: { type: DataTypes.STRING(200), allowNull: false },
    purpose: {
      type: DataTypes.ENUM('register', 'reset'),
      allowNull: false,
      defaultValue: 'register',
    },
    code: { type: DataTypes.STRING(10), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: 'otp_codes', updatedAt: false },
);

export const Announcement = sequelize.define(
  'Announcement',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: true },
    position: {
      type: DataTypes.ENUM('top', 'banner'),
      allowNull: false,
      defaultValue: 'top',
    },
    bg_color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#1e293b' },
    text_color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#f8fafc' },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    start_time: { type: DataTypes.DATE, allowNull: true },
    end_time: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  { tableName: 'announcements' },
);

export const DealFeed = sequelize.define(
  'DealFeed',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    // 订单完成后自动生成草稿时写入；运营 seed / 样本可空
    order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    region: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '东部' },
    sku_name: { type: DataTypes.STRING(100), allowNull: false },
    deal_type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '时租' },
    deal_date: { type: DataTypes.DATEONLY, allowNull: false },
    is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    published_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'deal_feeds' },
);

User.hasMany(Rfq, { foreignKey: 'customer_id', as: 'rfqs' });
Rfq.belongsTo(User, { foreignKey: 'customer_id', as: 'customer' });
Rfq.belongsTo(User, { foreignKey: 'broker_id', as: 'broker' });
Rfq.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });
Sku.hasMany(Rfq, { foreignKey: 'sku_id' });

Sku.hasMany(ReferencePrice, { foreignKey: 'sku_id', as: 'prices' });
ReferencePrice.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });

Rfq.hasOne(Quote, { foreignKey: 'rfq_id', as: 'quote' });
Quote.belongsTo(Rfq, { foreignKey: 'rfq_id', as: 'rfq' });
Quote.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Quote.belongsTo(User, { foreignKey: 'broker_id', as: 'broker' });

Quote.hasOne(Order, { foreignKey: 'quote_id', as: 'order' });
Order.belongsTo(Quote, { foreignKey: 'quote_id', as: 'quote' });
Order.belongsTo(User, { foreignKey: 'customer_id', as: 'customer' });
Order.belongsTo(User, { foreignKey: 'broker_id', as: 'broker' });
Order.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Order.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });
Order.hasMany(OrderLog, { foreignKey: 'order_id', as: 'logs' });
OrderLog.belongsTo(Order, { foreignKey: 'order_id' });
OrderLog.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });
Order.hasMany(Payment, { foreignKey: 'order_id', as: 'payments' });
Payment.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
DealFeed.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
Order.hasOne(DealFeed, { foreignKey: 'order_id', as: 'deal_feed' });

export const PriceIndex = sequelize.define(
  'PriceIndex',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'shanghai' },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
    },
    jump_threshold_pct: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 20 },
  },
  { tableName: 'price_indices' },
);

export const IndexPrint = sequelize.define(
  'IndexPrint',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    index_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    settle_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    source: {
      type: DataTypes.ENUM('price_mid', 'manual', 'engine', 'reference'),
      allowNull: false,
      defaultValue: 'price_mid',
    },
    status: {
      type: DataTypes.ENUM('draft', 'pending_review', 'published'),
      allowNull: false,
      defaultValue: 'draft',
    },
    sample_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    is_reference: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    calculated_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  { tableName: 'index_prints', indexes: [{ unique: true, fields: ['index_id', 'date'] }] },
);

export const ForwardContract = sequelize.define(
  'ForwardContract',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    index_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    buyer_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    seller_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    unit: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '台·月' },
    strike_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    expiry_date: { type: DataTypes.DATEONLY, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'shanghai' },
    contract_code: { type: DataTypes.STRING(64), allowNull: true },
    delivery_month: { type: DataTypes.STRING(7), allowNull: true },
    basis_rate: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: -20 },
    spot_ref_at_open: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    margin_initial_pct: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 15 },
    margin_maintain_pct: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 8 },
    margin_frozen: { type: DataTypes.DECIMAL(16, 2), allowNull: true, defaultValue: 0 },
    delivery_intent: {
      type: DataTypes.ENUM('unset', 'cash', 'physical'),
      allowNull: false,
      defaultValue: 'unset',
    },
    settle_mode: {
      type: DataTypes.ENUM('cash', 'physical'),
      allowNull: false,
      defaultValue: 'cash',
    },
    status: {
      type: DataTypes.ENUM(
        'draft',
        'pending_confirm',
        'open',
        'delivery_pending',
        'settled',
        'delivered',
        'cancelled',
      ),
      allowNull: false,
      defaultValue: 'pending_confirm',
    },
    broker_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    buyer_confirmed_at: { type: DataTypes.DATE, allowNull: true },
    seller_confirmed_at: { type: DataTypes.DATE, allowNull: true },
    buyer_confirm_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    seller_confirm_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    confirm_deadline_at: { type: DataTypes.DATE, allowNull: true },
    cancel_reason: { type: DataTypes.STRING(255), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'forward_contracts' },
);

export const SettlementBill = sequelize.define(
  'SettlementBill',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    contract_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    settle_date: { type: DataTypes.DATEONLY, allowNull: false },
    settle_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    settle_price_date: { type: DataTypes.DATEONLY, allowNull: false },
    strike: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    pay_direction: {
      type: DataTypes.ENUM('seller_to_buyer', 'buyer_to_seller', 'none'),
      allowNull: false,
    },
    pay_status: {
      type: DataTypes.ENUM('pending', 'done'),
      allowNull: false,
      defaultValue: 'pending',
    },
    confirmed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    confirmed_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'settlement_bills' },
);

PriceIndex.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });
Sku.hasMany(PriceIndex, { foreignKey: 'sku_id', as: 'indices' });
PriceIndex.hasMany(IndexPrint, { foreignKey: 'index_id', as: 'prints' });
IndexPrint.belongsTo(PriceIndex, { foreignKey: 'index_id', as: 'index' });

ForwardContract.belongsTo(PriceIndex, { foreignKey: 'index_id', as: 'index' });
PriceIndex.hasMany(ForwardContract, { foreignKey: 'index_id', as: 'forwards' });
ForwardContract.belongsTo(User, { foreignKey: 'buyer_id', as: 'buyer' });
ForwardContract.belongsTo(User, { foreignKey: 'seller_id', as: 'seller' });
ForwardContract.belongsTo(User, { foreignKey: 'broker_id', as: 'broker' });
ForwardContract.hasOne(SettlementBill, { foreignKey: 'contract_id', as: 'bill' });
SettlementBill.belongsTo(ForwardContract, { foreignKey: 'contract_id', as: 'contract' });
SettlementBill.belongsTo(User, { foreignKey: 'confirmed_by', as: 'confirmer' });

export const DeliveryChannel = sequelize.define(
  'DeliveryChannel',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: 'delivery_channels' },
);

export const DeliveryWhitelist = sequelize.define(
  'DeliveryWhitelist',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    approved_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    note: { type: DataTypes.STRING(255), allowNull: true },
  },
  { tableName: 'delivery_whitelists' },
);

export const DeliveryOrder = sequelize.define(
  'DeliveryOrder',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    contract_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    right_contract_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    channel_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'in_delivery', 'done', 'rejected', 'reconciled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    spot_fill_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    priority: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    voucher_path: { type: DataTypes.STRING(500), allowNull: true },
    requested_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    reconciled_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'delivery_orders' },
);

DeliveryChannel.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
DeliveryChannel.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });
DeliveryWhitelist.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
DeliveryWhitelist.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });
DeliveryOrder.belongsTo(ForwardContract, { foreignKey: 'contract_id', as: 'contract' });
ForwardContract.hasMany(DeliveryOrder, { foreignKey: 'contract_id', as: 'delivery_orders' });
DeliveryOrder.belongsTo(DeliveryChannel, { foreignKey: 'channel_id', as: 'channel' });
DeliveryOrder.belongsTo(User, { foreignKey: 'requested_by', as: 'requester' });
DeliveryOrder.belongsTo(Order, { foreignKey: 'order_id', as: 'spot_order' });

export {
  PlatformConfig,
  ChannelDeal,
  PriceBulletin,
  SpotBookOrder,
  SpotFill,
  LedgerAccount,
  LedgerEntry,
  PartnerCapacity,
  RightContract,
  CrmLead,
  CrmNote,
  PartnerApplication,
  MtmStatement,
} from './frd-models.js';

import {
  PlatformConfig,
  ChannelDeal,
  PriceBulletin,
  SpotBookOrder,
  SpotFill,
  LedgerAccount,
  LedgerEntry,
  PartnerCapacity,
  RightContract,
  CrmLead,
  CrmNote,
  PartnerApplication,
  MtmStatement,
} from './frd-models.js';

ChannelDeal.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });
ChannelDeal.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
ChannelDeal.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
ChannelDeal.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

SpotBookOrder.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
SpotBookOrder.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });
SpotFill.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });

LedgerAccount.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
LedgerAccount.hasMany(LedgerEntry, { foreignKey: 'account_id', as: 'entries' });
LedgerEntry.belongsTo(LedgerAccount, { foreignKey: 'account_id', as: 'account' });

PartnerCapacity.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
PartnerCapacity.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });

RightContract.belongsTo(User, { foreignKey: 'buyer_id', as: 'buyer' });
RightContract.belongsTo(Sku, { foreignKey: 'sku_id', as: 'sku' });
RightContract.belongsTo(Supplier, { foreignKey: 'writer_supplier_id', as: 'writer_supplier' });
RightContract.belongsTo(User, { foreignKey: 'broker_id', as: 'broker' });
DeliveryOrder.belongsTo(RightContract, { foreignKey: 'right_contract_id', as: 'right_contract' });
RightContract.hasMany(DeliveryOrder, { foreignKey: 'right_contract_id', as: 'delivery_orders' });

CrmLead.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
CrmLead.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
CrmLead.hasMany(CrmNote, { foreignKey: 'lead_id', as: 'notes' });
CrmNote.belongsTo(CrmLead, { foreignKey: 'lead_id', as: 'lead' });
CrmNote.belongsTo(User, { foreignKey: 'author_id', as: 'author' });

PartnerApplication.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
PartnerApplication.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
PartnerApplication.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });

MtmStatement.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(MtmStatement, { foreignKey: 'user_id', as: 'mtm_statements' });

User.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });

export const models = {
  User,
  Sku,
  Supplier,
  ReferencePrice,
  Rfq,
  Quote,
  Order,
  OrderLog,
  Payment,
  Attachment,
  OtpCode,
  Announcement,
  DealFeed,
  PriceIndex,
  IndexPrint,
  ForwardContract,
  SettlementBill,
  DeliveryChannel,
  DeliveryWhitelist,
  DeliveryOrder,
  PlatformConfig,
  ChannelDeal,
  PriceBulletin,
  SpotBookOrder,
  SpotFill,
  LedgerAccount,
  LedgerEntry,
  PartnerCapacity,
  RightContract,
  CrmLead,
  CrmNote,
  PartnerApplication,
  MtmStatement,
};

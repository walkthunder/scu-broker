import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** FRD 扩展表（关联在 models/index.js 中挂接） */

export const PlatformConfig = sequelize.define(
  'PlatformConfig',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    value: { type: DataTypes.TEXT, allowNull: false },
    note: { type: DataTypes.STRING(255), allowNull: true },
  },
  { tableName: 'platform_configs' },
);

export const ChannelDeal = sequelize.define(
  'ChannelDeal',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'shanghai' },
    qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    unit_price: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    deal_time: { type: DataTypes.DATE, allowNull: false },
    counterparty_type: { type: DataTypes.STRING(50), allowNull: true, defaultValue: '渠道' },
    deal_status: {
      type: DataTypes.ENUM('inquiry', 'intent', 'filled'),
      allowNull: false,
      defaultValue: 'filled',
    },
    trust_tag: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'normal' },
    source: {
      type: DataTypes.ENUM('manual', 'partner', 'api', 'order'),
      allowNull: false,
      defaultValue: 'manual',
    },
    voucher_path: { type: DataTypes.STRING(500), allowNull: true },
    created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    voided_at: { type: DataTypes.DATE, allowNull: true },
    void_reason: { type: DataTypes.STRING(255), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'channel_deals' },
);

export const PriceBulletin = sequelize.define(
  'PriceBulletin',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    date: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM('draft', 'pending_review', 'published'),
      allowNull: false,
      defaultValue: 'draft',
    },
    payload: { type: DataTypes.JSON, allowNull: false },
    calculated_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    snapshot: { type: DataTypes.JSON, allowNull: true },
  },
  { tableName: 'price_bulletins' },
);

export const SpotBookOrder = sequelize.define(
  'SpotBookOrder',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false },
    side: { type: DataTypes.ENUM('buy', 'sell'), allowNull: false },
    order_type: { type: DataTypes.ENUM('limit', 'market'), allowNull: false, defaultValue: 'limit' },
    price: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    filled_qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('open', 'partial', 'filled', 'cancelled', 'expired'),
      allowNull: false,
      defaultValue: 'open',
    },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    avg_price: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  },
  { tableName: 'spot_book_orders' },
);

export const SpotFill = sequelize.define(
  'SpotFill',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    buy_order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sell_order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false },
    price: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    buyer_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    seller_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  },
  { tableName: 'spot_fills' },
);

export const LedgerAccount = sequelize.define(
  'LedgerAccount',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    available: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    frozen: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'CNY' },
  },
  { tableName: 'ledger_accounts' },
);

export const LedgerEntry = sequelize.define(
  'LedgerEntry',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    type: {
      type: DataTypes.ENUM(
        'deposit',
        'withdraw',
        'margin_freeze',
        'margin_release',
        'premium',
        'settle',
        'payout',
        'penalty',
        'partner_pay',
      ),
      allowNull: false,
    },
    amount: { type: DataTypes.DECIMAL(16, 2), allowNull: false },
    balance_after: { type: DataTypes.DECIMAL(16, 2), allowNull: true },
    ref_type: { type: DataTypes.STRING(50), allowNull: true },
    ref_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    note: { type: DataTypes.STRING(255), allowNull: true },
    operator_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  { tableName: 'ledger_entries', updatedAt: false },
);

export const PartnerCapacity = sequelize.define(
  'PartnerCapacity',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false },
    spot_qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    forward_qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    rights_qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    quote_bid: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    quote_ask: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: 'partner_capacities',
    indexes: [{ unique: true, fields: ['supplier_id', 'sku_id', 'region'] }],
  },
);

/** 做市商双边参考报价（样本不足时插值） */
export const MakerQuote = sequelize.define(
  'MakerQuote',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'shanghai' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    bid: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    ask: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    note: { type: DataTypes.STRING(255), allowNull: true },
    created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    tableName: 'maker_quotes',
    indexes: [{ fields: ['sku_id', 'region', 'date'] }],
  },
);

export const RightContract = sequelize.define(
  'RightContract',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    kind: { type: DataTypes.ENUM('call', 'put'), allowNull: false },
    buyer_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    writer_supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    writer_user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    sku_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false },
    qty: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    unit: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '台·月' },
    strike: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    premium: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    premium_ref: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    window_start: { type: DataTypes.DATEONLY, allowNull: false },
    window_end: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM(
        'pending_confirm',
        'open',
        'exercised',
        'expired',
        'cancelled',
      ),
      allowNull: false,
      defaultValue: 'pending_confirm',
    },
    broker_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    buyer_confirmed_at: { type: DataTypes.DATE, allowNull: true },
    fee_confirmed_at: { type: DataTypes.DATE, allowNull: true },
    exercised_at: { type: DataTypes.DATE, allowNull: true },
    settle_amount: { type: DataTypes.DECIMAL(16, 2), allowNull: true },
    delivery_order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'right_contracts' },
);

export const CrmLead = sequelize.define(
  'CrmLead',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    company_name: { type: DataTypes.STRING(200), allowNull: true },
    contact_name: { type: DataTypes.STRING(100), allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    source: {
      type: DataTypes.ENUM('friend', 'partner', 'sales', 'event', 'other'),
      allowNull: false,
      defaultValue: 'other',
    },
    intent_sku: { type: DataTypes.STRING(100), allowNull: true },
    intent_region: { type: DataTypes.STRING(32), allowNull: true },
    intent_qty: { type: DataTypes.STRING(50), allowNull: true },
    stage: {
      type: DataTypes.ENUM('lead', 'qualified', 'negotiating', 'won', 'lost'),
      allowNull: false,
      defaultValue: 'lead',
    },
    owner_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'crm_leads' },
);

export const CrmNote = sequelize.define(
  'CrmNote',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    lead_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    author_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
  },
  { tableName: 'crm_notes', updatedAt: false },
);

/** 每日盯市结算单（预售/权益浮动盈亏快照） */
export const MtmStatement = sequelize.define(
  'MtmStatement',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    ref_type: { type: DataTypes.STRING(32), allowNull: false },
    ref_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    mark_price: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    mtm_amount: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    margin_frozen: { type: DataTypes.DECIMAL(16, 2), allowNull: true },
    note: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: 'mtm_statements',
    indexes: [
      { fields: ['user_id', 'date'] },
      { fields: ['ref_type', 'ref_id', 'date'] },
      { unique: true, name: 'uniq_mtm_user_date_ref', fields: ['user_id', 'date', 'ref_type', 'ref_id'] },
    ],
  },
);

/** 伙伴入驻申请 */
export const PartnerApplication = sequelize.define(
  'PartnerApplication',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    company_name: { type: DataTypes.STRING(200), allowNull: false },
    contact_name: { type: DataTypes.STRING(100), allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    email: { type: DataTypes.STRING(120), allowNull: true },
    regions: { type: DataTypes.STRING(200), allowNull: true },
    skus: { type: DataTypes.STRING(200), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    },
    supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    review_note: { type: DataTypes.STRING(255), allowNull: true },
  },
  { tableName: 'partner_applications' },
);

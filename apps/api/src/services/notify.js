import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host) return null;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  });
  return transporter;
}

export async function sendEmail({ to, subject, text }) {
  if (!to) {
    console.log('[notify:email:skip] no recipient', subject);
    return;
  }
  const t = getTransporter();
  if (!t) {
    console.log(`[notify:email:log] to=${to} subject=${subject} text=${text}`);
    return;
  }
  await t.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
  });
}

export async function sendSms({ phone, text }) {
  if (!config.smsEnabled) {
    console.log(`[notify:sms:log] phone=${phone} text=${text}`);
    return;
  }
  // SMS provider not configured in MVP; log only when flag on without credentials
  console.log(`[notify:sms:stub] phone=${phone} text=${text}`);
}

export async function notifyBrokersNewRfq({ brokers, rfqId, company }) {
  const text = `新询价 #${rfqId}，客户：${company || '未知'}，请尽快处理。`;
  for (const b of brokers) {
    await sendSms({ phone: b.phone, text });
    if (b.email) await sendEmail({ to: b.email, subject: `新询价 #${rfqId}`, text });
  }
}

export async function notifyCustomerQuote({ customer, quoteId }) {
  const text = `您有新的报价单 #${quoteId} 待确认，请尽快登录查看。`;
  await sendSms({ phone: customer.phone, text });
  if (customer.email) {
    await sendEmail({ to: customer.email, subject: `报价待确认 #${quoteId}`, text });
  }
}

async function notifyUser(user, subject, text) {
  if (!user) return;
  await sendSms({ phone: user.phone, text });
  if (user.email) await sendEmail({ to: user.email, subject, text });
}

/** 远期待确认 */
export async function notifyForwardPendingConfirm(contract) {
  const id = contract.id;
  const text = `远期合约 #${id} 待您确认（锁价 ${contract.strike_price}），请登录持仓页处理。`;
  await notifyUser(contract.buyer, `远期待确认 #${id}`, text);
  await notifyUser(contract.seller, `远期待确认 #${id}`, text);
}

/** 远期已生效 */
export async function notifyForwardOpened(contract) {
  const id = contract.id;
  const text = `远期合约 #${id} 已双边确认生效，到期日 ${contract.expiry_date}。`;
  await notifyUser(contract.buyer, `远期已生效 #${id}`, text);
  await notifyUser(contract.seller, `远期已生效 #${id}`, text);
}

/** 远期已出结算账单 */
export async function notifyForwardBill(contract, bill) {
  const id = contract.id;
  const dir =
    bill.pay_direction === 'seller_to_buyer'
      ? '卖方应付买方'
      : bill.pay_direction === 'buyer_to_seller'
        ? '买方应付卖方'
        : '无收付';
  const text = `远期合约 #${id} 已出结算账单：差价 ${bill.amount}（${dir}），请关注收付确认。`;
  await notifyUser(contract.buyer, `远期结算账单 #${id}`, text);
  await notifyUser(contract.seller, `远期结算账单 #${id}`, text);
}

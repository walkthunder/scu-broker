import { getPlatformParams } from '../services/platform-config.js';
import { runDailyJobs, runExpireAll } from '../services/frd-jobs.js';
import { monitorForwardMargins } from '../services/margin-monitor.js';
import { todayShanghai } from '../utils/market.js';
import { User } from '../models/index.js';

let timer = null;
let lastPublishDate = null;

function shanghaiHourMinute() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return { hour, minute };
}

async function systemOperatorId() {
  const admin = await User.findOne({
    where: { role: 'admin' },
    order: [['id', 'ASC']],
    attributes: ['id'],
  });
  return admin?.id || null;
}

async function tick() {
  if (process.env.FRD_SCHEDULER === '0') return;
  try {
    const params = await getPlatformParams();
    const targetHour = Number(params.publish_hour_shanghai ?? 17);
    const { hour, minute } = shanghaiHourMinute();
    const today = todayShanghai();
    // 在目标小时的前 5 分钟窗口内触发一次发布预备 + 盯市/过期
    if (hour === targetHour && minute < 5 && lastPublishDate !== today) {
      lastPublishDate = today;
      const userId = await systemOperatorId();
      const result = await runDailyJobs({ date: today, settle: true, userId });
      console.log('[frd-scheduler] daily jobs', JSON.stringify({
        date: today,
        margin_calls: result.margins?.margin_calls?.length,
        expired: result.expired,
      }));
    }
  } catch (e) {
    console.error('[frd-scheduler]', e?.message || e);
  }
}

export function startFrdScheduler() {
  if (timer || process.env.FRD_SCHEDULER === '0') return;
  timer = setInterval(tick, 60_000);
  // 启动后轻量跑一次过期清理（不强制结算/发布）
  setTimeout(async () => {
    try {
      await runExpireAll();
      await monitorForwardMargins();
    } catch (e) {
      console.error('[frd-scheduler] boot cleanup', e?.message || e);
    }
  }, 5_000);
  console.log('[frd-scheduler] started (Asia/Shanghai publish window)');
}

export function stopFrdScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

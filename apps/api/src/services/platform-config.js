import { PlatformConfig } from '../models/frd-models.js';
import { FRD_DEFAULTS } from '../constants/platform.js';
import { AppError } from '../utils/errors.js';

let cache = null;
let cacheAt = 0;

export async function getPlatformParams() {
  if (cache && Date.now() - cacheAt < 30_000) return { ...cache };
  const rows = await PlatformConfig.findAll();
  const map = { ...FRD_DEFAULTS };
  for (const r of rows) {
    const k = r.key;
    if (!(k in FRD_DEFAULTS)) continue;
    const n = Number(r.value);
    map[k] = Number.isFinite(n) ? n : r.value;
  }
  cache = map;
  cacheAt = Date.now();
  return { ...map };
}

export async function setPlatformParam(key, value, note) {
  if (!(key in FRD_DEFAULTS)) throw new AppError(`未知配置项 ${key}`);
  const [row] = await PlatformConfig.findOrCreate({
    where: { key },
    defaults: { key, value: String(value), note: note || null },
  });
  row.value = String(value);
  if (note !== undefined) row.note = note;
  await row.save();
  cache = null;
  return row;
}

export async function seedPlatformDefaults() {
  for (const [key, value] of Object.entries(FRD_DEFAULTS)) {
    await PlatformConfig.findOrCreate({
      where: { key },
      defaults: { key, value: String(value), note: 'FRD 默认' },
    });
  }
}

export function clearConfigCache() {
  cache = null;
}

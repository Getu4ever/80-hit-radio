import { serverEnv } from "@/lib/env";
import { isElevenLabsConfigured } from "@/lib/news/elevenlabs";

const DEFAULT_INTERVAL_MIN = 30;

export function getNewsBulletinIntervalSec(): number {
  const raw = serverEnv("NEWS_BULLETIN_INTERVAL_MIN");
  const minutes = raw ? Number.parseInt(raw, 10) : DEFAULT_INTERVAL_MIN;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_INTERVAL_MIN * 60;
  }
  return minutes * 60;
}

/** Client bundle interval (mirrors server default / NEXT_PUBLIC override). */
export const CLIENT_NEWS_INTERVAL_SEC = (() => {
  const raw = process.env.NEXT_PUBLIC_NEWS_BULLETIN_INTERVAL_MIN;
  const minutes = raw ? Number.parseInt(raw, 10) : DEFAULT_INTERVAL_MIN;
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : DEFAULT_INTERVAL_MIN * 60;
})();

export function isClientNewsBulletinEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NEWS_BULLETIN_ENABLED !== "false";
}

export function isNewsBulletinEnabled(): boolean {
  const flag = serverEnv("NEWS_BULLETIN_ENABLED");
  if (flag === "false" || flag === "0") return false;
  return isElevenLabsConfigured();
}

export function shouldInjectNewsBulletin(
  musicPlayedSeconds: number,
  lastBulletinAtMusicSeconds: number,
  intervalSec: number,
): boolean {
  if (intervalSec <= 0) return false;
  return musicPlayedSeconds - lastBulletinAtMusicSeconds >= intervalSec;
}

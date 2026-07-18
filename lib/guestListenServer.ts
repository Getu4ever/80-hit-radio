import { createHash, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import {
  GUEST_LISTEN_LIMIT_SECONDS,
  getGuestLimitMessage,
} from "@/lib/guestListenLimit";

/** Long-lived httpOnly device id — secondary key if IP changes but cookie remains. */
export const GUEST_DEVICE_COOKIE = "rithmgen-guest-device";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400; // ~400 days
/** Cap a single POST so clients cannot jump the counter arbitrarily. */
const MAX_DELTA_PER_REQUEST = 120;

export type GuestListenQuota = {
  secondsListened: number;
  secondsRemaining: number;
  exhausted: boolean;
  message: string;
};

type GuestListenRow = {
  ip_hash: string;
  device_id: string | null;
  seconds_listened: number;
};

function toQuota(seconds: number): GuestListenQuota {
  const secondsListened = Math.max(0, Math.floor(seconds));
  return {
    secondsListened,
    secondsRemaining: Math.max(0, GUEST_LISTEN_LIMIT_SECONDS - secondsListened),
    exhausted: secondsListened >= GUEST_LISTEN_LIMIT_SECONDS,
    message: getGuestLimitMessage(),
  };
}

/** Privacy-friendly IP fingerprint — store hash, never raw IP. */
export function hashClientIp(ip: string): string {
  const salt =
    (process.env.GUEST_IP_HASH_SALT ?? "").trim() || "rithmgen-guest-v1";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function getClientIpFromRequest(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const vercel = headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return "unknown";
}

export async function ensureGuestDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_DEVICE_COOKIE)?.value?.trim();
  if (existing && existing.length >= 8 && existing.length <= 128) {
    return existing;
  }

  const id = randomUUID();
  try {
    store.set(GUEST_DEVICE_COOKIE, id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SEC,
    });
  } catch {
    // Readable in Server Components without mutable cookies — API routes set it.
  }
  return id;
}

function isMissingGuestListenTable(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("Could not find the table")
  );
}

async function loadQuotaRows(
  ipHash: string,
  deviceId: string,
): Promise<{
  byIp: GuestListenRow | null;
  byDevice: GuestListenRow | null;
  missingTable: boolean;
}> {
  const admin = createAdminClient();
  const [ipResult, deviceResult] = await Promise.all([
    admin
      .from("guest_listen")
      .select("ip_hash, device_id, seconds_listened")
      .eq("ip_hash", ipHash)
      .maybeSingle(),
    admin
      .from("guest_listen")
      .select("ip_hash, device_id, seconds_listened")
      .eq("device_id", deviceId)
      .maybeSingle(),
  ]);

  const missingTable =
    isMissingGuestListenTable(ipResult.error) ||
    isMissingGuestListenTable(deviceResult.error);

  if (missingTable) {
    console.warn(
      "guest_listen table missing — run supabase/migrations/007_guest_listen.sql",
    );
  } else {
    if (ipResult.error) {
      console.error("guest_listen by ip:", ipResult.error.message);
    }
    if (deviceResult.error) {
      console.error("guest_listen by device:", deviceResult.error.message);
    }
  }

  return {
    byIp: (ipResult.data as GuestListenRow | null) ?? null,
    byDevice: (deviceResult.data as GuestListenRow | null) ?? null,
    missingTable,
  };
}

/**
 * Read cumulative guest listen seconds for this IP (+ device cookie).
 * Limitation: VPN / new IP (+ cleared cookie) can start a fresh hour.
 */
export async function getGuestListenQuota(
  request: Request,
): Promise<GuestListenQuota> {
  if (!isSupabaseConfigured()) {
    return toQuota(0);
  }

  const ipHash = hashClientIp(getClientIpFromRequest(request));
  const deviceId = await ensureGuestDeviceId();

  try {
    const { byIp, byDevice, missingTable } = await loadQuotaRows(
      ipHash,
      deviceId,
    );
    if (missingTable) return toQuota(0);

    const seconds = Math.max(
      byIp?.seconds_listened ?? 0,
      byDevice?.seconds_listened ?? 0,
    );
    return toQuota(seconds);
  } catch (err) {
    console.error("getGuestListenQuota:", err);
    return toQuota(0);
  }
}

/**
 * Accrue guest listen time server-side. Sign-out must NOT call a reset —
 * clearing localStorage must not unlock an exhausted IP.
 */
export async function addGuestListenSecondsServer(
  request: Request,
  deltaSeconds: number,
): Promise<GuestListenQuota> {
  if (!isSupabaseConfigured()) {
    return toQuota(0);
  }

  const delta = Math.min(
    Math.max(0, Math.floor(deltaSeconds)),
    MAX_DELTA_PER_REQUEST,
  );
  const ipHash = hashClientIp(getClientIpFromRequest(request));
  const deviceId = await ensureGuestDeviceId();
  const admin = createAdminClient();

  try {
    const { byIp, byDevice, missingTable } = await loadQuotaRows(
      ipHash,
      deviceId,
    );
    if (missingTable) return toQuota(0);

    const current = Math.max(
      byIp?.seconds_listened ?? 0,
      byDevice?.seconds_listened ?? 0,
    );
    const next = Math.min(current + delta, GUEST_LISTEN_LIMIT_SECONDS * 10);
    const now = new Date().toISOString();

    // Detach device_id from any other IP row before attaching to this IP.
    if (byDevice && byDevice.ip_hash !== ipHash) {
      const { error: detachError } = await admin
        .from("guest_listen")
        .update({
          device_id: null,
          seconds_listened: Math.max(byDevice.seconds_listened, next),
          updated_at: now,
        })
        .eq("ip_hash", byDevice.ip_hash);
      if (detachError) {
        console.error("guest_listen detach device:", detachError.message);
      }
    }

    const { error: upsertError } = await admin.from("guest_listen").upsert(
      {
        ip_hash: ipHash,
        device_id: deviceId,
        seconds_listened: next,
        updated_at: now,
      },
      { onConflict: "ip_hash" },
    );

    if (upsertError) {
      console.error("guest_listen upsert:", upsertError.message);
      return toQuota(current);
    }

    return toQuota(next);
  } catch (err) {
    console.error("addGuestListenSecondsServer:", err);
    return toQuota(0);
  }
}

import { Capacitor } from "@capacitor/core";

/** True when running inside the iOS/Android Capacitor shell. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getNativePlatform(): "ios" | "android" | "web" {
  if (!isNativeApp()) return "web";
  try {
    const platform = Capacitor.getPlatform();
    if (platform === "ios" || platform === "android") return platform;
  } catch {
    // fall through
  }
  return "web";
}

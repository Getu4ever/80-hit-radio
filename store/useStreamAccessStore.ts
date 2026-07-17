import { create } from "zustand";

export type StreamDenialReason =
  | "ok"
  | "unauthenticated"
  | "trial_expired"
  | "guest_limit"
  | "error";

interface StreamAccessState {
  checked: boolean;
  allowed: boolean;
  reason: StreamDenialReason;
  message: string | null;
  trialDaysRemaining: number | null;
  setAccess: (payload: {
    allowed: boolean;
    reason?: StreamDenialReason;
    message?: string | null;
    trialDaysRemaining?: number | null;
  }) => void;
  reset: () => void;
}

/** Default allowed=true so the UI is usable before the first API check returns. */
export const useStreamAccessStore = create<StreamAccessState>((set) => ({
  checked: false,
  allowed: true,
  reason: "ok",
  message: null,
  trialDaysRemaining: null,
  setAccess: ({
    allowed,
    reason = allowed ? "ok" : "trial_expired",
    message = null,
    trialDaysRemaining = null,
  }) =>
    set({
      checked: true,
      allowed,
      reason,
      message,
      trialDaysRemaining,
    }),
  reset: () =>
    set({
      checked: false,
      allowed: true,
      reason: "ok",
      message: null,
      trialDaysRemaining: null,
    }),
}));

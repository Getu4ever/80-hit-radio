"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { create } from "zustand";
import type { StripeSubscriptionStatus, UserRole } from "@/types/database.types";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";
import { useAudioStore } from "@/store/useAudioStore";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import {
  getGuestLimitMessage,
  hasGuestReachedListenLimit,
} from "@/lib/guestListenLimit";

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  stripeCustomerId: string | null;
  stripeSubscriptionStatus: StripeSubscriptionStatus;
  createdAt: string;
  trialDaysLeft: number;
  subscriptionLabel: string;
  displayName: string;
  avatarUrl: string | null;
}

interface UserSessionState {
  user: SessionUser | null;
  isLoading: boolean;
  hydrated: boolean;
  setUser: (user: SessionUser | null) => void;
  setLoading: (loading: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
}

type SessionApiUser = {
  id: string;
  email: string;
  role: UserRole;
  stripeCustomerId: string | null;
  stripeSubscriptionStatus: StripeSubscriptionStatus;
  createdAt: string;
  trialDaysLeft: number;
  subscriptionLabel: string;
  fullName?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
};

function mapApiUser(raw: SessionApiUser): SessionUser {
  return {
    id: raw.id,
    email: raw.email,
    role: raw.role,
    stripeCustomerId: raw.stripeCustomerId,
    stripeSubscriptionStatus: raw.stripeSubscriptionStatus,
    createdAt: raw.createdAt,
    trialDaysLeft: raw.trialDaysLeft,
    subscriptionLabel: raw.subscriptionLabel,
    displayName:
      raw.displayName?.trim() ||
      raw.fullName?.trim() ||
      raw.email.split("@")[0] ||
      raw.email,
    avatarUrl: raw.avatarUrl ?? null,
  };
}

export const useUserSessionStore = create<UserSessionState>((set) => ({
  user: null,
  isLoading: true,
  hydrated: false,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setHydrated: (hydrated) => set({ hydrated }),
}));

async function fetchSessionUser(): Promise<SessionUser | null> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  const data = (await res.json()) as { user: SessionApiUser | null };
  return data.user ? mapApiUser(data.user) : null;
}

async function refreshStreamGate() {
  try {
    const res = await fetch("/api/stream/check-status", {
      credentials: "include",
    });
    const data = (await res.json()) as {
      eligible?: boolean;
      message?: string;
      reason?: "ok" | "unauthenticated" | "trial_expired" | "guest_limit" | "error";
      trialDaysRemaining?: number;
      guest?: boolean;
    };

    if (res.status === 401 || res.status === 403 || data.eligible === false) {
      useStreamAccessStore.getState().setAccess({
        allowed: false,
        reason:
          data.reason ??
          (res.status === 401 ? "unauthenticated" : "trial_expired"),
        message: data.message ?? null,
        trialDaysRemaining: 0,
      });
      return;
    }

    if (data.guest && hasGuestReachedListenLimit()) {
      if (useAudioStore.getState().isPlaying) {
        useAudioStore.setState({ isPlaying: false });
      }
      useStreamAccessStore.getState().setAccess({
        allowed: false,
        reason: "guest_limit",
        message: getGuestLimitMessage(),
        trialDaysRemaining: 0,
      });
      return;
    }

    useStreamAccessStore.getState().setAccess({
      allowed: true,
      reason: "ok",
      message: null,
      trialDaysRemaining: data.trialDaysRemaining ?? null,
    });
  } catch {
    useStreamAccessStore.getState().setAccess({
      allowed: false,
      reason: "error",
      message: "Unable to verify your subscription.",
    });
  }
}

/** Live Supabase session facade for Header / Sidebar. */
export function useUserSession() {
  const router = useRouter();
  const user = useUserSessionStore((s) => s.user);
  const isLoading = useUserSessionStore((s) => s.isLoading);
  const hydrated = useUserSessionStore((s) => s.hydrated);
  const setUser = useUserSessionStore((s) => s.setUser);
  const setLoading = useUserSessionStore((s) => s.setLoading);
  const setHydrated = useUserSessionStore((s) => s.setHydrated);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setLoading(true);
      try {
        const sessionUser = await fetchSessionUser();
        if (!cancelled) setUser(sessionUser);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHydrated(true);
        }
      }
    }

    if (!hydrated) {
      void hydrate();
    }

    if (!isSupabaseConfigured()) {
      return () => {
        cancelled = true;
      };
    }

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void (async () => {
        const sessionUser = await fetchSessionUser();
        setUser(sessionUser);
        await refreshStreamGate();
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hydrated, setHydrated, setLoading, setUser]);

  const signIn = useCallback(() => {
    router.push("/auth/signup");
  }, [router]);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      useAudioStore.getState().stopBroadcast();
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
      await fetch("/api/auth/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signOut" }),
      });
      setUser(null);
      await refreshStreamGate();
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }, [router, setLoading, setUser]);

  return {
    user,
    isLoading,
    isLoggedIn: Boolean(user),
    isAdmin: user?.role === "admin",
    subscriptionLabel: user?.subscriptionLabel ?? null,
    signIn,
    signOut,
  };
}

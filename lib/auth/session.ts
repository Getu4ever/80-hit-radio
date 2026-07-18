import type { Profile, ProfileUpdate, UserRole } from "@/types/database.types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  avatarFromUserMetadata,
  nameFromUserMetadata,
} from "@/lib/profile/identity";
import { TRIAL_DAYS } from "@/lib/subscription";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

async function readProfileById(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("readProfileById:", error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error("readProfileById failed:", err);
    return null;
  }
}

/** Fill missing name/avatar from Google (or other OAuth) metadata. */
async function syncIdentityFromAuth(
  user: User,
  profile: Profile,
): Promise<Profile> {
  const metaName = nameFromUserMetadata(user.user_metadata);
  const metaAvatar = avatarFromUserMetadata(user.user_metadata);
  const patch: ProfileUpdate = {};

  if (!profile.full_name?.trim() && metaName) {
    patch.full_name = metaName;
  }
  if (!profile.avatar_url?.trim() && metaAvatar) {
    patch.avatar_url = metaAvatar;
  }
  if (user.email && user.email !== profile.email) {
    patch.email = user.email;
  }

  if (Object.keys(patch).length === 0) return profile;

  try {
    const updated = await updateProfileById(user.id, patch);
    return updated ?? { ...profile, ...patch };
  } catch (err) {
    console.error("syncIdentityFromAuth:", err);
    return profile;
  }
}

async function ensureProfile(
  user: User,
  userClient: SupabaseClient<Database>,
): Promise<Profile | null> {
  const existing = await readProfileById(user.id);
  if (existing) return syncIdentityFromAuth(user, existing);

  const payload = {
    id: user.id,
    email: user.email ?? "",
    role: "user" as UserRole,
    stripe_subscription_status: "none" as const,
    full_name: nameFromUserMetadata(user.user_metadata),
    avatar_url: avatarFromUserMetadata(user.user_metadata),
  };

  // Prefer service role when available.
  try {
    if (isSupabaseConfigured()) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("profiles")
        .insert(payload)
        .select("*")
        .maybeSingle();
      if (!error && data) return data;
      if (error) console.error("ensureProfile admin insert:", error.message);
    }
  } catch (err) {
    console.error("ensureProfile admin failed:", err);
  }

  // Fallback: user inserts their own row (requires INSERT policy).
  const { data, error } = await userClient
    .from("profiles")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("ensureProfile user:", error.message);
    return readProfileById(user.id);
  }

  return data;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("getCurrentProfile select:", error.message);
    }

    if (data) return syncIdentityFromAuth(user, data);

    const serviceProfile = await readProfileById(user.id);
    if (serviceProfile) return syncIdentityFromAuth(user, serviceProfile);

    return ensureProfile(user, supabase);
  } catch (err) {
    console.error("getCurrentProfile failed:", err);
    return null;
  }
}

/**
 * Returns the auth user even when profile row is missing.
 * Used by the stream gate so confirmed accounts aren't locked out.
 */
export async function getAuthUser() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const user = await getAuthUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = await readProfileById(user.id);
  if (!profile || profile.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return profile;
}

export async function listAllProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function updateProfileById(
  id: string,
  patch: ProfileUpdate,
): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateProfileByStripeCustomerId(
  customerId: string,
  patch: ProfileUpdate,
): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("stripe_customer_id", customerId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getAdminMetrics() {
  try {
    const profiles = await listAllProfiles();
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    const activeSubscribers = profiles.filter(
      (p) => p.stripe_subscription_status === "active",
    ).length;
    const trialingUsers = profiles.filter((p) => {
      const age =
        (now - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return age <= TRIAL_DAYS && p.stripe_subscription_status !== "active";
    }).length;
    const canceledUsers = profiles.filter(
      (p) => p.stripe_subscription_status === "canceled",
    ).length;
    const pastDueUsers = profiles.filter(
      (p) => p.stripe_subscription_status === "past_due",
    ).length;
    const adminUsers = profiles.filter((p) => p.role === "admin").length;
    const newThisWeek = profiles.filter(
      (p) => now - new Date(p.created_at).getTime() <= weekMs,
    ).length;
    const conversionRate =
      profiles.length === 0
        ? 0
        : Math.round((activeSubscribers / profiles.length) * 100);

    return {
      totalUsers: profiles.length,
      activeSubscribers,
      trialingUsers,
      canceledUsers,
      pastDueUsers,
      adminUsers,
      newThisWeek,
      conversionRate,
    };
  } catch (err) {
    console.error("getAdminMetrics failed:", err);
    return {
      totalUsers: 0,
      activeSubscribers: 0,
      trialingUsers: 0,
      canceledUsers: 0,
      pastDueUsers: 0,
      adminUsers: 0,
      newThisWeek: 0,
      conversionRate: 0,
    };
  }
}

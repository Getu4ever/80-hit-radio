import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/env";

/** Service-role client for webhooks and admin mutations. Never expose to the browser. */
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const key = getSupabaseServiceRoleKey();

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

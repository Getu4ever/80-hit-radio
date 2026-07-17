/**
 * One-off helper: delete a Supabase Auth user (+ profile cascade) by email.
 *
 * Usage: node --env-file=.env.local scripts/delete-user-by-email.mjs getubegna@yahoo.com
 */
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/delete-user-by-email.mjs <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserIdByEmail(target) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target,
    );
    if (hit) return hit.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

const userId = await findUserIdByEmail(email);
if (!userId) {
  console.log(`No auth user found for ${email}`);
  process.exit(0);
}

const { error: profileError } = await admin
  .from("profiles")
  .delete()
  .eq("id", userId);
if (profileError) {
  console.warn("Profile delete warning:", profileError.message);
}

const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
if (deleteError) {
  console.error("Failed to delete auth user:", deleteError.message);
  process.exit(1);
}

console.log(`Deleted auth user ${email} (${userId})`);

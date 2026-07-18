import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/session";
import {
  getAppUrl,
  getSupabaseEnv,
  isLocalhostUrl,
  PRODUCTION_APP_URL,
} from "@/lib/env";

/**
 * Prefer the host that received the OAuth/email callback so the session
 * cookie is set on the same origin the browser is on. Never redirect to
 * localhost from a production build.
 */
function resolveCallbackAppUrl(request: Request) {
  try {
    const origin = new URL(request.url).origin.replace(/\/$/, "");
    if (process.env.NODE_ENV === "production" && isLocalhostUrl(origin)) {
      return PRODUCTION_APP_URL;
    }
    if (!isLocalhostUrl(origin) || process.env.NODE_ENV !== "production") {
      return origin;
    }
  } catch {
    // fall through
  }
  return getAppUrl();
}

function loginRedirect(appUrl: string, message: string) {
  return NextResponse.redirect(
    `${appUrl}/auth/login?error=${encodeURIComponent(message)}`,
  );
}

export async function GET(request: Request) {
  const appUrl = resolveCallbackAppUrl(request);
  const { searchParams } = new URL(request.url);

  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    return loginRedirect(appUrl, oauthError);
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";
  const nextPath = next.startsWith("/") ? next : "/";

  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(`${appUrl}/auth/login?confirmed=1`);
  }

  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  let response = NextResponse.redirect(`${appUrl}${nextPath}`);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (error) throw error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    }

    await getCurrentProfile();
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return loginRedirect(appUrl, message);
  }
}

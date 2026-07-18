import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase Site URL often points at "/" (or a mis-set localhost). When the
 * OAuth `code` lands on any path other than /auth/callback, forward it so
 * the route handler can exchange the code for a session.
 */
function redirectAuthParamsToCallback(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/auth/callback") return null;

  const hasCode = searchParams.has("code");
  const hasEmailOtp =
    searchParams.has("token_hash") && searchParams.has("type");
  if (!hasCode && !hasEmailOtp) return null;

  const target = request.nextUrl.clone();
  target.pathname = "/auth/callback";
  if (!searchParams.has("next")) {
    target.searchParams.set("next", pathname.startsWith("/") ? pathname : "/");
  }
  return NextResponse.redirect(target);
}

export async function proxy(request: NextRequest) {
  const authRedirect = redirectAuthParamsToCallback(request);
  if (authRedirect) return authRedirect;

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return response;
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              response.headers.set(key, value);
            });
          }
        },
      },
    });

    await supabase.auth.getUser();
  } catch (error) {
    console.error("proxy auth refresh failed:", error);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

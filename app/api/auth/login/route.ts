import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocalDevelopment } from "@/lib/env";

async function findUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(error.message ?? "Unable to list users.");
  }

  const users = data?.users ?? [];
  return users.find(
    (user) => typeof user.email === "string" && user.email.toLowerCase() === email.toLowerCase(),
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  const email = body.email?.trim();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (!error) {
    return NextResponse.json({ ok: true });
  }

  const message = error.message ?? "Sign in failed.";
  const emailNotConfirmed = /email\s+not\s+confirmed/i.test(message);

  if (!emailNotConfirmed || !isLocalDevelopment()) {
    return NextResponse.json({ error: message }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const user = await findUserByEmail(admin, email);
    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Could not locate user for local confirmation bypass." },
        { status: 404 },
      );
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message ?? "Local confirmation failed." },
        { status: 500 },
      );
    }

    const { error: secondError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (secondError) {
      return NextResponse.json(
        { error: secondError.message ?? "Local login failed after confirmation." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Local login fallback failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

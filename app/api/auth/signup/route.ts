import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthCallbackUrl, getEmailConfirmUrl } from "@/lib/auth/urls";
import {
  buildAdminNewSignupEmail,
  buildSignupConfirmEmail,
  getAdminEmail,
  sendResendEmail,
} from "@/lib/email/resend";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
      full_name?: string;
    };

    const email = body.email?.trim();
    const password = body.password?.trim();
    const fullName = (body.fullName ?? body.full_name ?? "").trim().slice(0, 120);

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required for signup." },
        { status: 400 },
      );
    }

    if (!fullName) {
      return NextResponse.json(
        { error: "Full name is required for signup." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const redirectTo = getAuthCallbackUrl("/");
    console.info("POST /api/auth/signup redirectTo=", redirectTo);

    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to create signup link." },
        { status: 500 },
      );
    }

    const userId = data.user?.id;
    if (userId) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({ full_name: fullName, email })
        .eq("id", userId);
      if (profileError) {
        console.error(
          "POST /api/auth/signup profile name sync:",
          profileError.message,
        );
      }
    }

    const hashedToken = data.properties?.hashed_token;
    const verificationType =
      data.properties?.verification_type || "signup";

    // Prefer our own callback URL with token_hash. Supabase's action_link
    // embeds redirect_to from Auth Site URL, which is often still localhost.
    const confirmUrl = hashedToken
      ? getEmailConfirmUrl({
          hashedToken,
          type: verificationType,
          next: "/",
        })
      : null;

    if (!confirmUrl) {
      return NextResponse.json(
        { error: "Unable to generate confirmation link." },
        { status: 500 },
      );
    }

    console.info(
      "POST /api/auth/signup confirmUrl host=",
      new URL(confirmUrl).host,
    );

    const userEmail = buildSignupConfirmEmail(email, confirmUrl, fullName);
    await sendResendEmail({
      to: email,
      subject: userEmail.subject,
      html: userEmail.html,
      text: userEmail.text,
    });

    // Notify admin — don't fail signup if this secondary mail fails.
    try {
      const adminEmail = buildAdminNewSignupEmail(email, fullName);
      await sendResendEmail({
        to: getAdminEmail(),
        subject: adminEmail.subject,
        html: adminEmail.html,
        text: adminEmail.text,
      });
    } catch (adminErr) {
      console.error(
        "POST /api/auth/signup: admin notification failed:",
        adminErr instanceof Error ? adminErr.message : adminErr,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed.";
    console.error("POST /api/auth/signup:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

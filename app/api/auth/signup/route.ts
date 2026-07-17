import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthCallbackUrl } from "@/lib/auth/urls";
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
    };

    const email = body.email?.trim();
    const password = body.password?.trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required for signup." },
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
      },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to create signup link." },
        { status: 500 },
      );
    }

    const actionLink = data.properties?.action_link;
    if (!actionLink) {
      return NextResponse.json(
        { error: "Unable to generate confirmation link." },
        { status: 500 },
      );
    }

    const userEmail = buildSignupConfirmEmail(email, actionLink);
    await sendResendEmail({
      to: email,
      subject: userEmail.subject,
      html: userEmail.html,
      text: userEmail.text,
    });

    // Notify admin — don't fail signup if this secondary mail fails.
    try {
      const adminEmail = buildAdminNewSignupEmail(email);
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

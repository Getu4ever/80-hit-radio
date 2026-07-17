import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthCallbackUrl } from "@/lib/auth/urls";

const RESEND_API_URL = "https://api.resend.com/emails";

/** Prefer a verified custom domain. Fallback is Resend's test sender (own inbox only). */
function getFromEmail() {
  const configured = (process.env.RESEND_FROM_EMAIL ?? "").trim();
  if (configured) return configured;
  return "RithmGen <onboarding@resend.dev>";
}

function buildHtmlMessage(email: string, actionLink: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Confirm your Rithmgen account</title>
  </head>
  <body style="font-family: system-ui, sans-serif; background: #0f0920; color: #f8f8ff; margin: 0; padding: 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 32px;">
      <tr>
        <td style="padding: 24px; background: #110926; border-radius: 32px;">
          <h1 style="margin: 0 0 16px; font-size: 28px; color: #f3f3ff;">Welcome to Rithmgen</h1>
          <p style="margin: 0 0 24px; line-height: 1.7; color: #c8d2ff;">
            Hi ${email},<br />
            Confirm your account to start streaming 80s hits instantly.
          </p>
          <a
            href="${actionLink}"
            style="display: inline-block; padding: 16px 28px; border-radius: 14px; background: #8b5cf6; color: white; text-decoration: none; font-weight: 600;"
          >Activate your account</a>
          <p style="margin: 24px 0 0; color: #a6b0ff; line-height: 1.6; font-size: 14px;">
            If the button doesn’t work, copy and paste this URL into your browser:<br />
            <a href="${actionLink}" style="color: #7dd3fc; word-break: break-all;">${actionLink}</a>
          </p>
          <p style="margin: 24px 0 0; color: #797dff; font-size: 13px;">
            If you did not sign up for Rithmgen, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendResendEmail(email: string, actionLink: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY in server environment.");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: getFromEmail(),
      to: [email],
      subject: "Confirm your Rithmgen account",
      html: buildHtmlMessage(email, actionLink),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email delivery failed: ${response.status} ${body}`);
  }
}

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

    await sendResendEmail(email, actionLink);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed.";
    console.error("POST /api/auth/signup:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

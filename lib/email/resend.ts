import { getAppUrl } from "@/lib/env";

const RESEND_API_URL = "https://api.resend.com/emails";

function serverRead(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getResendFromEmail(): string {
  return (
    serverRead("RESEND_FROM_EMAIL") ||
    "RithmGen <noreply@karoldigital.co.uk>"
  );
}

export function getAdminEmail(): string {
  return serverRead("ADMIN_EMAIL") || "info@karoldigital.co.uk";
}

function getBrandAssets() {
  const appUrl = getAppUrl();
  return {
    appUrl,
    logoUrl: `${appUrl}/logo/logo80b.jpg`,
    supportEmail: getAdminEmail(),
    siteLabel: "www.rithmgen.co.uk",
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function emailShell(options: {
  title: string;
  preheader: string;
  bodyHtml: string;
}): string {
  const { logoUrl, supportEmail, siteLabel, appUrl } = getBrandAssets();
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(options.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#07040f;color:#f5f3ff;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(options.preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07040f;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a0614;border:1px solid rgba(34,211,238,0.22);border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 12px;background:linear-gradient(135deg,rgba(217,70,239,0.16),rgba(34,211,238,0.08));">
                <img
                  src="${logoUrl}"
                  alt="RithmGen"
                  width="220"
                  style="display:block;width:220px;max-width:70%;height:auto;border:0;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                ${options.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px;border-top:1px solid rgba(255,255,255,0.08);">
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#9aa3c7;">
                  RithmGen · 80s Hit Radio<br />
                  <a href="${appUrl}" style="color:#67e8f9;text-decoration:none;">${siteLabel}</a>
                  &nbsp;·&nbsp;
                  <a href="mailto:${supportEmail}" style="color:#67e8f9;text-decoration:none;">${supportEmail}</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7394;">
                  © ${year} RithmGen. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildSignupConfirmEmail(email: string, actionLink: string) {
  const safeEmail = escapeHtml(email);
  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#e879f9;font-weight:700;">
      Free trial
    </p>
    <h1 style="margin:0 0 14px;font-size:28px;line-height:1.25;color:#ffffff;">
      Confirm your RithmGen account
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#c7d2fe;">
      Hi ${safeEmail},<br /><br />
      Thanks for joining RithmGen. Confirm your email to unlock your
      <strong style="color:#ffffff;">14-day free Premium trial</strong>
      and start streaming classic 80s hits with full genre control.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr>
        <td style="border-radius:12px;background:linear-gradient(90deg,#d946ef,#22d3ee);">
          <a
            href="${actionLink}"
            style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;"
          >Activate free trial</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#9aa3c7;">
      If the button doesn’t work, paste this link into your browser:
    </p>
    <p style="margin:0 0 18px;font-size:12px;line-height:1.6;word-break:break-all;">
      <a href="${actionLink}" style="color:#67e8f9;">${escapeHtml(actionLink)}</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7394;">
      If you didn’t create a RithmGen account, you can safely ignore this email.
    </p>
  `;

  return {
    subject: "Confirm your RithmGen free trial",
    html: emailShell({
      title: "Confirm your RithmGen account",
      preheader: "Activate your 14-day free Premium trial and start streaming.",
      bodyHtml,
    }),
  };
}

export function buildAdminNewSignupEmail(userEmail: string) {
  const { appUrl } = getBrandAssets();
  const safeEmail = escapeHtml(userEmail);
  const when = new Date().toUTCString();
  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#22d3ee;font-weight:700;">
      Admin alert
    </p>
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#ffffff;">
      New listener signup
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#c7d2fe;">
      A new user started the free-trial signup flow on RithmGen.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
      <tr>
        <td style="padding:14px 16px;font-size:14px;color:#e2e8f0;">
          <strong style="color:#a5b4fc;">Email</strong><br />
          ${safeEmail}
        </td>
      </tr>
      <tr>
        <td style="padding:0 16px 14px;font-size:14px;color:#e2e8f0;">
          <strong style="color:#a5b4fc;">Time (UTC)</strong><br />
          ${escapeHtml(when)}
        </td>
      </tr>
    </table>
    <a href="${appUrl}/dashboard/admin" style="color:#67e8f9;font-size:14px;text-decoration:none;">
      Open Studio Control →
    </a>
  `;

  return {
    subject: `New RithmGen signup: ${userEmail}`,
    html: emailShell({
      title: "New RithmGen signup",
      preheader: `New signup started for ${userEmail}`,
      bodyHtml,
    }),
  };
}

export async function sendResendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const apiKey = serverRead("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY in server environment.");
  }

  const to = Array.isArray(options.to) ? options.to : [options.to];
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: getResendFromEmail(),
      to,
      reply_to: options.replyTo || getAdminEmail(),
      subject: options.subject,
      html: options.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email delivery failed: ${response.status} ${body}`);
  }
}

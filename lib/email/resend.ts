import { getAppUrl, PRODUCTION_APP_URL } from "@/lib/env";

const RESEND_API_URL = "https://api.resend.com/emails";
const PRODUCTION_SITE = PRODUCTION_APP_URL;

function serverRead(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Prefer the verified mailbox on karoldigital.co.uk for better inbox placement. */
export function getResendFromEmail(): string {
  return (
    serverRead("RESEND_FROM_EMAIL") ||
    "RithmGen <info@karoldigital.co.uk>"
  );
}

export function getAdminEmail(): string {
  return serverRead("ADMIN_EMAIL") || "info@karoldigital.co.uk";
}

function getBrandAssets() {
  const appUrl = getAppUrl();
  const publicBase =
    /localhost|127\.0\.0\.1/i.test(appUrl) || !appUrl
      ? PRODUCTION_SITE
      : appUrl;
  return {
    appUrl: publicBase,
    logoUrl: `${publicBase}/logo/logo80b.jpg`,
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
    <meta name="color-scheme" content="light dark" />
    <title>${escapeHtml(options.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;color:#18181b;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(options.preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px;background:#0a0614;">
                <img
                  src="${logoUrl}"
                  alt="RithmGen"
                  width="200"
                  style="display:block;width:200px;max-width:65%;height:auto;border:0;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px;">
                ${options.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px;border-top:1px solid #e4e4e7;">
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#52525b;">
                  RithmGen · Classic hit radio streaming<br />
                  <a href="${appUrl}" style="color:#0891b2;text-decoration:none;">${siteLabel}</a>
                  &nbsp;·&nbsp;
                  <a href="mailto:${supportEmail}" style="color:#0891b2;text-decoration:none;">${supportEmail}</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#71717a;">
                  Karol Digital Ltd · Support: ${supportEmail}<br />
                  © ${year} RithmGen. All rights reserved.<br />
                  You received this email because an account was created with this address.
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
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a21caf;font-weight:700;">
      Account confirmation
    </p>
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.3;color:#18181b;">
      Confirm your email address
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3f3f46;">
      Hello ${safeEmail},
    </p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3f3f46;">
      Please confirm your email to finish creating your RithmGen account and
      start your 14-day free trial.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr>
        <td style="border-radius:10px;background:#0a0614;">
          <a
            href="${actionLink}"
            style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;"
          >Confirm email address</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#52525b;">
      If the button does not work, copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 18px;font-size:12px;line-height:1.6;word-break:break-all;">
      <a href="${actionLink}" style="color:#0891b2;">${escapeHtml(actionLink)}</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
      If you did not create a RithmGen account, you can ignore this message.
    </p>
  `;

  const text = [
    "Confirm your RithmGen email address",
    "",
    `Hello ${email},`,
    "",
    "Please confirm your email to finish creating your RithmGen account and start your 14-day free trial.",
    "",
    `Confirm here: ${actionLink}`,
    "",
    "If you did not create a RithmGen account, you can ignore this message.",
    "",
    `Support: ${getAdminEmail()}`,
    "https://www.rithmgen.co.uk",
  ].join("\n");

  return {
    subject: "Confirm your RithmGen email address",
    html: emailShell({
      title: "Confirm your RithmGen email address",
      preheader: "Confirm your email to finish creating your RithmGen account.",
      bodyHtml,
    }),
    text,
  };
}

export function buildAdminNewSignupEmail(userEmail: string) {
  const { appUrl } = getBrandAssets();
  const safeEmail = escapeHtml(userEmail);
  const when = new Date().toUTCString();
  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#0891b2;font-weight:700;">
      Admin notification
    </p>
    <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#18181b;">
      New listener signup
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3f3f46;">
      A new user started account confirmation on RithmGen.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;">
      <tr>
        <td style="padding:14px 16px;font-size:14px;color:#27272a;">
          <strong style="color:#52525b;">Email</strong><br />
          ${safeEmail}
        </td>
      </tr>
      <tr>
        <td style="padding:0 16px 14px;font-size:14px;color:#27272a;">
          <strong style="color:#52525b;">Time (UTC)</strong><br />
          ${escapeHtml(when)}
        </td>
      </tr>
    </table>
    <a href="${appUrl}/dashboard/admin" style="color:#0891b2;font-size:14px;text-decoration:none;">
      Open Studio Control
    </a>
  `;

  const text = [
    "New RithmGen signup",
    "",
    `Email: ${userEmail}`,
    `Time (UTC): ${when}`,
    "",
    `${appUrl}/dashboard/admin`,
  ].join("\n");

  return {
    subject: `New RithmGen signup: ${userEmail}`,
    html: emailShell({
      title: "New RithmGen signup",
      preheader: `New signup started for ${userEmail}`,
      bodyHtml,
    }),
    text,
  };
}

export async function sendResendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<void> {
  const apiKey = serverRead("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY in server environment.");
  }

  const to = Array.isArray(options.to) ? options.to : [options.to];
  const adminEmail = getAdminEmail();
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: getResendFromEmail(),
      to,
      reply_to: options.replyTo || adminEmail,
      subject: options.subject,
      html: options.html,
      text: options.text,
      headers: {
        "List-Unsubscribe": `<mailto:${adminEmail}?subject=unsubscribe>`,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email delivery failed: ${response.status} ${body}`);
  }
}

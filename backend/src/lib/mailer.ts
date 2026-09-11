import nodemailer from "nodemailer";
import { env } from "../config/env";

// ── Transport chain: Brevo, then Gmail SMTP ──────────────────────────────────
//
// Two independent ways to actually put an email on the wire, tried in that
// order. Each is only attempted if it's configured, and a provider that
// errors (bad key, account issue, rate limit, network blip) falls through to
// the next rather than losing the email outright. This is the same reasoning
// as the referenced Sentinel project's D28: a single provider is a single
// point of failure that has nothing to do with a bug in this code, and it
// stops a demo dead the moment it has a bad afternoon.
//
// Brevo is primary (a real transactional-email API); Gmail SMTP is the
// fallback — dead simple to set up (an App Password, no third-party account
// review) and not subject to a SaaS provider silently revoking a trial key.
//
// With nothing configured at all, or with NOTIFY_BY_EMAIL=0, sending is
// skipped (logged once) and nothing else in the app depends on it.

type MailOpts = { to: string; subject: string; text: string; html?: string };

/** Splits "Name <email@x.com>" into its parts; falls back to using the whole string as the email. */
function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].replace(/^"|"$/g, ""), email: match[2] };
  }
  return { name: "Invexa", email: raw.trim() };
}

let warnedMissingConfig = false;

async function sendViaBrevo(opts: MailOpts): Promise<boolean> {
  if (!env.BREVO_API_KEY) return false;

  const from = parseFrom(env.MAIL_FROM);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sender: { email: from.email, name: from.name },
      to: [{ email: opts.to }],
      subject: opts.subject,
      textContent: opts.text,
      htmlContent: opts.html
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[mailer] Brevo responded ${response.status}; falling back. ${detail}`);
    return false;
  }

  return true;
}

let gmailTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

async function sendViaGmailSmtp(opts: MailOpts): Promise<boolean> {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return false;

  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD }
    });
  }

  await gmailTransporter.sendMail({
    from: env.MAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html
  });

  return true;
}

const TRANSPORTS: Array<{ name: string; send: (opts: MailOpts) => Promise<boolean> }> = [
  { name: "Brevo", send: sendViaBrevo },
  { name: "Gmail SMTP", send: sendViaGmailSmtp }
];

let warnedSilenced = false;

/**
 * sendMail — fire-and-forget email delivery.
 *
 * Deliberately never throws: a slow/misconfigured/unreachable mail provider
 * must never fail (or even delay) the operation that triggered the email —
 * e.g. an order fill. Failures are logged server-side only. Tries Brevo,
 * then Gmail SMTP, in order, and stops at the first one that actually sends.
 */
export async function sendMail(opts: MailOpts) {
  if (!env.NOTIFY_BY_EMAIL) {
    if (!warnedSilenced) {
      console.log("[mailer] NOTIFY_BY_EMAIL=0 — emails are silenced while testing by hand.");
      warnedSilenced = true;
    }
    return;
  }

  const configured = TRANSPORTS.filter((t) => {
    if (t.name === "Brevo") return Boolean(env.BREVO_API_KEY);
    return Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
  });

  if (configured.length === 0) {
    if (!warnedMissingConfig) {
      console.warn(
        "[mailer] No mail provider is configured — emails will be skipped. " +
          "Set BREVO_API_KEY, or GMAIL_USER/GMAIL_APP_PASSWORD."
      );
      warnedMissingConfig = true;
    }
    return;
  }

  for (const transport of configured) {
    try {
      const sent = await transport.send(opts);
      if (sent) {
        console.log(`[mailer] Sent to ${opts.to} via ${transport.name}.`);
        return;
      }
    } catch (err) {
      console.error(`[mailer] ${transport.name} failed:`, err);
    }
  }

  console.error(`[mailer] All configured providers failed to deliver to ${opts.to}.`);
}

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * sendTransactionEmail — notifies a user by email whenever one of their
 * orders fills, e.g. "Bought 50 share(s) of CUPID.NS at ₹290.00 per share."
 */
export async function sendTransactionEmail(params: {
  to: string;
  username: string;
  side: "buy" | "sell";
  ticker: string;
  quantity: number;
  price: number;
}) {
  const { to, username, side, ticker, quantity, price } = params;
  const verb = side === "buy" ? "Bought" : "Sold";
  const total = quantity * price;

  const headline = `${verb} ${quantity} share(s) of ${ticker} at ${inr(price)} per share.`;

  const text = `Hi ${username},

${headline}
Total ${side === "buy" ? "cost" : "proceeds"}: ${inr(total)}

This is an automated notification from Invexa — no action is needed.`;

  const html = `
    <p>Hi ${escapeHtml(username)},</p>
    <p style="font-size:16px;"><strong>${escapeHtml(headline)}</strong></p>
    <p>Total ${side === "buy" ? "cost" : "proceeds"}: <strong>${escapeHtml(inr(total))}</strong></p>
    <p style="color:#8c90a3;font-size:13px;">This is an automated notification from Invexa — no action is needed.</p>
  `;

  await sendMail({
    to,
    subject: `Invexa: ${verb} ${ticker} — order filled`,
    text,
    html
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * sendVerificationEmail — the one-time code sent right after registration
 * (and again on request) to confirm the address given at signup actually
 * belongs to the person who typed it in.
 */
export async function sendVerificationEmail(params: { to: string; username: string; otp: string }) {
  const { to, username, otp } = params;

  const text = `Hi ${username},

Your Invexa verification code is: ${otp}

It expires in 10 minutes. If you did not create an Invexa account, you can
ignore this email.`;

  const html = `
    <p>Hi ${escapeHtml(username)},</p>
    <p>Your Invexa verification code is:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:4px;">${escapeHtml(otp)}</p>
    <p style="color:#8c90a3;font-size:13px;">It expires in 10 minutes. If you did not create an Invexa account,
    you can ignore this email.</p>
  `;

  await sendMail({
    to,
    subject: "Invexa: verify your email",
    text,
    html
  });
}

/**
 * sendWelcomeCredentialsEmail — a copy of a newly created account's sign-in
 * details, sent once, immediately after registration. Invexa is a virtual
 * (paper-trading) account with no real money attached, which is what makes
 * mailing a plaintext password an acceptable trade-off here for a demo/
 * teaching app — it would not be for a real bank. See D27 in the referenced
 * Sentinel project for the contrast: that project deliberately never puts a
 * password or code anywhere insecure because real money is on the line.
 */
export async function sendWelcomeCredentialsEmail(params: {
  to: string;
  username: string;
  email: string;
  password: string;
  accessKey: string;
}) {
  const { to, username, email, password, accessKey } = params;

  const text = `Hi ${username},

Welcome to Invexa. Here is a copy of your account's sign-in details —
keep them somewhere safe.

Username:    ${username}
Email:       ${email}
Password:    ${password}
Access Key:  ${accessKey}

You can sign in with either your password or your 4-digit Access Key.
Invexa trades with virtual money only — nothing here touches real funds.

This is an automated notification. If you did not create this account,
please ignore this email.`;

  const html = `
    <p>Hi ${escapeHtml(username)},</p>
    <p>Welcome to Invexa. Here is a copy of your account's sign-in details — keep them somewhere safe.</p>
    <table style="border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#8c90a3;">Username</td><td><strong>${escapeHtml(username)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#8c90a3;">Email</td><td><strong>${escapeHtml(email)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#8c90a3;">Password</td><td><strong>${escapeHtml(password)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#8c90a3;">Access Key</td><td><strong>${escapeHtml(accessKey)}</strong></td></tr>
    </table>
    <p>You can sign in with either your password or your 4-digit Access Key. Invexa trades with virtual money
    only — nothing here touches real funds.</p>
    <p style="color:#8c90a3;font-size:13px;">This is an automated notification. If you did not create this
    account, please ignore this email.</p>
  `;

  await sendMail({
    to,
    subject: "Invexa: your account details",
    text,
    html
  });
}

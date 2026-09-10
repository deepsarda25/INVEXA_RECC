import nodemailer from "nodemailer";
import { env } from "../config/env";

// ── Transport chain: Mailjet, then SendGrid, then plain SMTP ────────────────
//
// Three independent ways to actually put an email on the wire, tried in that
// order. Each is only attempted if it's configured, and a provider that
// errors (bad key, account issue, rate limit, network blip) falls through to
// the next rather than losing the email outright. This is the same reasoning
// as the referenced Sentinel project's D28: a single provider is a single
// point of failure that has nothing to do with a bug in this code, and it
// stops a demo dead the moment it has a bad afternoon.
//
// With nothing configured at all, sending is skipped (logged once) and
// nothing else in the app depends on it.

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

async function sendViaMailjet(opts: MailOpts): Promise<boolean> {
  if (!env.MAILJET_API_KEY || !env.MAILJET_SECRET_KEY) return false;

  const from = parseFrom(env.MAIL_FROM);
  const auth = Buffer.from(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`).toString("base64");

  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: from.email, Name: from.name },
          To: [{ Email: opts.to }],
          Subject: opts.subject,
          TextPart: opts.text,
          HTMLPart: opts.html
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[mailer] Mailjet responded ${response.status}; falling back. ${detail}`);
    return false;
  }

  // Mailjet answers 200 even when the individual message was refused — the
  // real outcome is inside the body, one entry per message. Trusting only
  // the HTTP status here would report a send that never happened.
  const body = (await response.json()) as { Messages?: Array<{ Status?: string; Errors?: unknown }> };
  const status = body?.Messages?.[0]?.Status;
  if (status !== "success") {
    console.error("[mailer] Mailjet refused the message:", JSON.stringify(body?.Messages?.[0]));
    return false;
  }

  return true;
}

async function sendViaSendGrid(opts: MailOpts): Promise<boolean> {
  if (!env.SENDGRID_API_KEY) return false;

  const from = parseFrom(env.MAIL_FROM);

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: opts.to }] }],
      from: { email: from.email, name: from.name },
      subject: opts.subject,
      content: [
        { type: "text/plain", value: opts.text },
        ...(opts.html ? [{ type: "text/html", value: opts.html }] : [])
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[mailer] SendGrid responded ${response.status}; falling back. ${detail}`);
    return false;
  }

  return true;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

async function sendViaSmtp(opts: MailOpts): Promise<boolean> {
  if (!env.SMTP_HOST) return false;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });
  }

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html
  });

  return true;
}

const TRANSPORTS: Array<{ name: string; send: (opts: MailOpts) => Promise<boolean> }> = [
  { name: "Mailjet", send: sendViaMailjet },
  { name: "SendGrid", send: sendViaSendGrid },
  { name: "SMTP", send: sendViaSmtp }
];

/**
 * sendMail — fire-and-forget email delivery.
 *
 * Deliberately never throws: a slow/misconfigured/unreachable mail provider
 * must never fail (or even delay) the operation that triggered the email —
 * e.g. an order fill. Failures are logged server-side only. Tries Mailjet,
 * then SendGrid, then SMTP, in order, and stops at the first one that
 * actually sends.
 */
export async function sendMail(opts: MailOpts) {
  const configured = TRANSPORTS.filter((t) => {
    if (t.name === "Mailjet") return Boolean(env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY);
    if (t.name === "SendGrid") return Boolean(env.SENDGRID_API_KEY);
    return Boolean(env.SMTP_HOST);
  });

  if (configured.length === 0) {
    if (!warnedMissingConfig) {
      console.warn(
        "[mailer] No mail provider is configured — emails will be skipped. " +
          "Set MAILJET_API_KEY/MAILJET_SECRET_KEY, or SENDGRID_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS."
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

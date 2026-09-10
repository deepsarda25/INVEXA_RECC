import nodemailer from "nodemailer";
import { env } from "../config/env";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let warnedMissingConfig = false;

function getTransporter() {
  if (!env.SMTP_HOST) {
    if (!warnedMissingConfig) {
      console.warn(
        "[mailer] SMTP_HOST is not set — transaction emails will be skipped. " +
          "Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS to enable them."
      );
      warnedMissingConfig = true;
    }
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });
  }

  return transporter;
}

/**
 * sendMail — fire-and-forget email delivery.
 *
 * Deliberately never throws: a slow/misconfigured/unreachable mail server
 * must never fail (or even delay) the operation that triggered the email —
 * e.g. an order fill. Failures are logged server-side only.
 */
export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }) {
  const client = getTransporter();
  if (!client) return;

  try {
    await client.sendMail({
      from: env.MAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html
    });
  } catch (err) {
    console.error("[mailer] Failed to send email:", err);
  }
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

import { env } from "../config/env";
import { sendMail } from "../lib/mailer";

// npm run mail:check -- someone@example.com
//
// Sends one real test email through whatever provider is configured in
// .env (Brevo, then Gmail SMTP — see lib/mailer.ts), and says plainly
// whether it went out. Without this, "is my email set up right?" is only
// answerable by registering an account and waiting to see if anything
// arrives — which looks like a signup bug, not a mail configuration
// problem, when it fails.
async function main() {
  const to = process.argv[2];

  if (!env.NOTIFY_BY_EMAIL) {
    console.log("NOTIFY_BY_EMAIL=0 — email is currently silenced on purpose. Set it to 1 (or unset it) to test.");
    return;
  }

  const configured: string[] = [];
  if (env.BREVO_API_KEY) configured.push("Brevo");
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) configured.push("Gmail SMTP");

  if (configured.length === 0) {
    console.log("No mail provider is set — mail is currently OFF. The app still runs fine without it.");
    console.log("Set BREVO_API_KEY, or GMAIL_USER/GMAIL_APP_PASSWORD, in .env.");
    return;
  }

  console.log(`Configured, in try order: ${configured.join(" -> ")}`);
  console.log(`Sending from: ${env.MAIL_FROM}`);

  if (!to) {
    console.log("Pass an address to actually send a test email: npm run mail:check -- you@example.com");
    return;
  }

  console.log(`Sending a test email to ${to} ...`);
  await sendMail({
    to,
    subject: "Invexa: test email",
    text: "This is a test email from Invexa's mail:check script. If you got this, mail is working.",
    html: "<p>This is a test email from Invexa's <code>mail:check</code> script. If you got this, mail is working.</p>"
  });
  console.log("Done. Check the inbox (and spam folder) at " + to + ".");
  console.log("If it never arrives, check the console output above — each provider logs its own failure and");
  console.log("this falls through to the next one configured, e.g. '[mailer] Brevo responded 401; falling back.'");
}

await main();
process.exit(0);

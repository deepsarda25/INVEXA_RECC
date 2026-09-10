# Mailing feature — files touched

This is the only `.md` file created or edited for this work. Nothing else in
the repository's documentation was modified — everything below is the full
list of files created or changed, and nothing outside this list was touched.

## Created

| File | What it is |
|---|---|
| `backend/src/lib/emailOtp.ts` | Issues and verifies the 6-digit signup verification code. Stored in Redis as a SHA-256 hash with a 10-minute expiry and a 5-attempt cap — the code itself is never stored in the clear. |
| `backend/src/scripts/mailCheck.ts` | `npm run mail:check -- you@example.com` — reports which mail provider(s) are configured and sends one real test email through them, so mail setup can be verified without registering a throwaway account. |
| `.env` (repo root) | Local secrets, git-ignored. Holds a freshly generated `JWT_SECRET` and the mail provider keys. Not part of this list's "code" — listed here only so it's clear it exists and where. |
| `MAILING_FEATURE_CHANGES.md` (this file) | This changelog. |

## Modified

| File | What changed |
|---|---|
| `backend/src/lib/mailer.ts` | Was a single SMTP transport (`nodemailer`). Now tries three providers in order — **Mailjet → SendGrid → SMTP** — each only if it's configured, falling through to the next on any failure (bad key, account issue, rate limit, network error). Added `sendVerificationEmail` (the OTP) and `sendWelcomeCredentialsEmail` (a copy of the new account's sign-in details). The existing `sendTransactionEmail` (trade-fill notifications) is unchanged. |
| `backend/src/config/env.ts` | Added `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `SENDGRID_API_KEY` as optional env vars alongside the existing `SMTP_*` ones. |
| `backend/src/modules/auth.ts` | `POST /auth/register` now fires the verification-code email and the credentials email in the background (fire-and-forget — never blocks or fails signup). Added `POST /auth/verify-email` (submit the code) and `POST /auth/resend-verification`. `/auth/login`, `/auth/me` and the register response now also return `emailVerifiedAt`. |
| `backend/src/lib/auth.ts` | `authenticate()` and the `AuthUser` type now also carry `emailVerifiedAt`, read from the DB. |
| `backend/src/db/schema.ts` | Added the `emailVerifiedAt` column to the `users` table definition (Drizzle schema, for typing). |
| `backend/src/db/bootstrapSchema.ts` | Added the matching `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;` migration, following this file's existing additive-migration pattern. Runs automatically on boot; safe on a database that already has the column. |
| `backend/package.json` | Added the `mail:check` script. |
| `frontend/src/components/ProfilePanel.tsx` | Added a "Verify Your Email" card (shown only while unverified): enter the 6-digit code, or resend it. |
| `frontend/src/store/authStore.ts` | `User` type now carries `emailVerifiedAt`; added `markEmailVerified()` to update local state once verification succeeds. |
| `docker-compose.yml` | Passes `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `SENDGRID_API_KEY` (alongside the existing `SMTP_*`) through to the backend container. |
| `.env.example` | Documents all of the above — Mailjet, SendGrid and SMTP, in the order they're tried, with where to get each provider's keys. |

## What was already there, untouched

Trade-execution emails (`sendTransactionEmail`, wired into
`backend/src/domain/orders/executor.ts`) already existed before this work —
nothing there needed to change; it now simply also benefits from the
Mailjet → SendGrid → SMTP fallback since it goes through the same
`sendMail()`.

## Everything else in the project

No file outside the two tables above was created, edited, or deleted. In
particular: no other `.md` file in this repository was touched — the design,
architecture and planning docs under `context/` and `docs/` are exactly as
they were before this work started.

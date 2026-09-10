import { Elysia, t } from "elysia";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { authenticate } from "../lib/auth";
import { env } from "../config/env";
import { sql } from "../lib/db";
import { redis } from "../lib/redis";

const REG_CHALLENGE_TTL_SECONDS = 5 * 60;
const AUTH_CHALLENGE_TTL_SECONDS = 5 * 60;

const rpID = env.WEBAUTHN_RP_ID;
const rpName = env.WEBAUTHN_RP_NAME;
const expectedOrigin = env.webauthnOrigins;

type CredentialRow = {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: string;
  deviceType: string;
  backedUp: boolean;
  transports: string | null;
  nickname: string | null;
};

function regChallengeKey(userId: string) {
  return `webauthn:reg:challenge:${userId}`;
}

function authChallengeKey(loginId: string) {
  return `webauthn:auth:challenge:${loginId}`;
}

/**
 * webauthnModule — passwordless "Sign in with fingerprint" support built on
 * the WebAuthn standard (Touch ID / Windows Hello / Android fingerprint are
 * all "platform authenticators" under the hood).
 *
 * Flow:
 *  1. REGISTER (while signed in, typically right after creating the account):
 *     POST /auth/webauthn/register/options  -> browser prompts for fingerprint
 *     POST /auth/webauthn/register/verify   -> credential stored against the user
 *  2. LOGIN (instead of password / access key):
 *     POST /auth/webauthn/login/options     -> { usernameOrEmail } -> challenge
 *     POST /auth/webauthn/login/verify      -> browser signature -> JWT issued
 */
export const webauthnModule = new Elysia({ prefix: "/auth/webauthn" })
  // ── Registration ──────────────────────────────────────────────
  .get("/register/options", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);

    const existing = await sql<{ credentialId: string; transports: string | null }[]>`
      SELECT credential_id as "credentialId", transports
      FROM webauthn_credentials
      WHERE user_id = ${user.id}
    `;

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.username,
      userID: new TextEncoder().encode(user.id),
      userDisplayName: user.username,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports ? (c.transports.split(",") as any) : undefined
      })),
      authenticatorSelection: {
        // "platform" restricts this to built-in authenticators (Touch ID,
        // Windows Hello, Android fingerprint) rather than USB security keys.
        authenticatorAttachment: "platform",
        residentKey: "discouraged",
        userVerification: "required"
      }
    });

    await redis.set(regChallengeKey(user.id), options.challenge, "EX", REG_CHALLENGE_TTL_SECONDS);

    return { options };
  })
  .post(
    "/register/verify",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const body = ctx.body as any;

      const expectedChallenge = await redis.get(regChallengeKey(user.id));
      if (!expectedChallenge) {
        ctx.set.status = 400;
        return { error: "Registration request expired. Please try again." };
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: body.response,
          expectedChallenge,
          expectedOrigin,
          expectedRPID: rpID
        });
      } catch (err) {
        ctx.set.status = 400;
        return { error: (err as Error).message || "Could not verify fingerprint registration." };
      } finally {
        await redis.del(regChallengeKey(user.id));
      }

      if (!verification.verified || !verification.registrationInfo) {
        ctx.set.status = 400;
        return { error: "Fingerprint registration could not be verified." };
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      await sql`
        INSERT INTO webauthn_credentials
          (user_id, credential_id, public_key, counter, device_type, backed_up, transports, nickname)
        VALUES (
          ${user.id},
          ${credential.id},
          ${isoBase64URL.fromBuffer(credential.publicKey)},
          ${credential.counter},
          ${credentialDeviceType},
          ${credentialBackedUp},
          ${credential.transports ? credential.transports.join(",") : null},
          ${body.nickname ?? null}
        )
        ON CONFLICT (credential_id) DO NOTHING
      `;

      return { ok: true, credentialId: credential.id };
    },
    {
      body: t.Object({
        response: t.Any(),
        nickname: t.Optional(t.String({ maxLength: 100 }))
      })
    }
  )
  .get("/credentials", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);
    const rows = await sql<{ id: string; nickname: string | null; createdAt: string; lastUsedAt: string | null }[]>`
      SELECT id, nickname, created_at as "createdAt", last_used_at as "lastUsedAt"
      FROM webauthn_credentials
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `;
    return { credentials: rows };
  })
  .delete("/credentials/:id", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);
    await sql`DELETE FROM webauthn_credentials WHERE id = ${ctx.params.id} AND user_id = ${user.id}`;
    return { ok: true };
  })

  // ── Login (unauthenticated — this IS the login mechanism) ───────
  .post(
    "/login/options",
    async (ctx: any) => {
      const body = ctx.body as any;
      const identifier = String(body.usernameOrEmail ?? "").trim();
      if (!identifier) {
        ctx.set.status = 400;
        return { error: "usernameOrEmail is required" };
      }
      const lower = identifier.toLowerCase();

      const [user] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${lower} OR username = ${identifier} LIMIT 1
      `;

      if (!user) {
        ctx.set.status = 401;
        return { error: "No account found for that username or email." };
      }

      const creds = await sql<{ credentialId: string; transports: string | null }[]>`
        SELECT credential_id as "credentialId", transports
        FROM webauthn_credentials
        WHERE user_id = ${user.id}
      `;

      if (creds.length === 0) {
        ctx.set.status = 400;
        return { error: "This account has no fingerprint sign-in registered yet." };
      }

      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "required",
        allowCredentials: creds.map((c) => ({
          id: c.credentialId,
          transports: c.transports ? (c.transports.split(",") as any) : undefined
        }))
      });

      const loginId = crypto.randomUUID();
      await redis.set(
        authChallengeKey(loginId),
        JSON.stringify({ challenge: options.challenge, userId: user.id }),
        "EX",
        AUTH_CHALLENGE_TTL_SECONDS
      );

      return { options, loginId };
    },
    {
      body: t.Object({
        usernameOrEmail: t.String({ minLength: 1, maxLength: 255 })
      })
    }
  )
  .post(
    "/login/verify",
    async (ctx: any) => {
      const body = ctx.body as any;
      const raw = await redis.get(authChallengeKey(body.loginId));
      if (!raw) {
        ctx.set.status = 400;
        return { error: "Fingerprint sign-in request expired. Please try again." };
      }
      await redis.del(authChallengeKey(body.loginId));

      const { challenge, userId } = JSON.parse(raw) as { challenge: string; userId: string };

      const [credRow] = await sql<CredentialRow[]>`
        SELECT id, user_id as "userId", credential_id as "credentialId", public_key as "publicKey",
               counter, device_type as "deviceType", backed_up as "backedUp", transports, nickname
        FROM webauthn_credentials
        WHERE credential_id = ${body.response?.id} AND user_id = ${userId}
      `;

      if (!credRow) {
        ctx.set.status = 400;
        return { error: "Unrecognized fingerprint credential." };
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: body.response,
          expectedChallenge: challenge,
          expectedOrigin,
          expectedRPID: rpID,
          credential: {
            id: credRow.credentialId,
            publicKey: isoBase64URL.toBuffer(credRow.publicKey),
            counter: Number(credRow.counter),
            transports: credRow.transports ? (credRow.transports.split(",") as any) : undefined
          },
          requireUserVerification: true
        });
      } catch (err) {
        ctx.set.status = 400;
        return { error: (err as Error).message || "Could not verify fingerprint." };
      }

      if (!verification.verified) {
        ctx.set.status = 401;
        return { error: "Fingerprint verification failed." };
      }

      await sql`
        UPDATE webauthn_credentials
        SET counter = ${verification.authenticationInfo.newCounter}, last_used_at = NOW()
        WHERE id = ${credRow.id}
      `;

      const [user] = await sql<
        { id: string; username: string; email: string; role: "user" | "educator" | "admin"; virtualBalance: string }[]
      >`
        SELECT id, username, email, role, virtual_balance as "virtualBalance"
        FROM users
        WHERE id = ${userId}
      `;

      if (!user) {
        ctx.set.status = 401;
        return { error: "Account no longer exists." };
      }

      const token = await ctx.jwt.sign({
        sub: user.id,
        username: user.username,
        role: user.role
      });

      await redis.set(`session:active:${token}`, user.id, "EX", 7 * 24 * 60 * 60);

      return { token, user };
    },
    {
      body: t.Object({
        loginId: t.String({ minLength: 1 }),
        response: t.Any()
      })
    }
  );

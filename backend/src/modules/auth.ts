import { Elysia, t } from "elysia";
import { authenticate, hashPassword, verifyPassword } from "../lib/auth";
import { sql } from "../lib/db";
import { redis } from "../lib/redis";
import { issueEmailOtp, verifyEmailOtp } from "../lib/emailOtp";
import { sendVerificationEmail, sendWelcomeCredentialsEmail } from "../lib/mailer";

const ACCESS_KEY_PATTERN = /^\d{4}$/;

export const authModule = new Elysia({ prefix: "/auth" })
  .get("/login", () => ({
    error: "Use POST /auth/login with JSON body: { usernameOrEmail, password } or { usernameOrEmail, accessKey }"
  }))
  .post(
    "/register",
    async (ctx: any) => {
      const body = ctx.body as any;
      const username = body.username.trim();
      const email = body.email.trim().toLowerCase();

      if (body.password !== body.confirmPassword) {
        ctx.set.status = 400;
        return { error: "Password and confirm password do not match." };
      }

      if (!ACCESS_KEY_PATTERN.test(String(body.accessKey ?? ""))) {
        ctx.set.status = 400;
        return { error: "Access Key must be exactly 4 digits." };
      }

      if (body.accessKey !== body.confirmAccessKey) {
        ctx.set.status = 400;
        return { error: "Access Key and confirm Access Key do not match." };
      }

      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE username = ${username} OR email = ${email} LIMIT 1
      `;

      if (existing) {
        ctx.set.status = 409;
        return { error: "Username or email already exists" };
      }

      const passwordHash = await hashPassword(body.password);
      const accessKeyHash = await hashPassword(body.accessKey);

      const [created] = await sql<
        {
          id: string;
          username: string;
          role: "user" | "educator" | "admin";
          email: string;
          virtualBalance: string;
          emailVerifiedAt: string | null;
        }[]
      >`
        INSERT INTO users (username, email, password_hash, access_key_hash, role)
        VALUES (${username}, ${email}, ${passwordHash}, ${accessKeyHash}, ${body.role ?? "user"})
        RETURNING id, username, role, email, virtual_balance as "virtualBalance", email_verified_at as "emailVerifiedAt"
      `;

      const token = await ctx.jwt.sign({
        sub: created.id,
        username: created.username,
        role: created.role
      });

      await redis.set(`session:active:${token}`, created.id, "EX", 7 * 24 * 60 * 60);

      // Fire-and-forget: a copy of the credentials just set, and a code to
      // confirm the address is real. Neither blocks or can fail the signup —
      // sendMail swallows and logs its own errors, and the `.catch` here is
      // just an extra safety net (same pattern as the order-fill email in
      // domain/orders/executor.ts).
      void sendWelcomeCredentialsEmail({
        to: created.email,
        username: created.username,
        email: created.email,
        password: body.password,
        accessKey: body.accessKey
      }).catch((err) => console.error("[mailer] welcome email failed:", err));

      void (async () => {
        const otp = await issueEmailOtp(created.id);
        await sendVerificationEmail({ to: created.email, username: created.username, otp });
      })().catch((err) => console.error("[mailer] verification email failed:", err));

      return { token, user: created };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3, maxLength: 50 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8, maxLength: 128 }),
        confirmPassword: t.String({ minLength: 8, maxLength: 128 }),
        accessKey: t.String({ minLength: 4, maxLength: 4 }),
        confirmAccessKey: t.String({ minLength: 4, maxLength: 4 }),
        role: t.Optional(t.Union([t.Literal("user"), t.Literal("educator")]))
      })
    }
  )
  .post(
    "/login",
    async (ctx: any) => {
      const body = ctx.body as any;
      const identifier = String(body.usernameOrEmail ?? body.username ?? body.email ?? "").trim();

      if (!identifier || (!body.password && !body.accessKey)) {
        ctx.set.status = 400;
        return { error: "usernameOrEmail (or username/email) and either password or accessKey are required" };
      }

      const usernameOrEmail = identifier.toLowerCase();

      const [user] = await sql<
        {
          id: string;
          username: string;
          email: string;
          passwordHash: string;
          accessKeyHash: string | null;
          role: "user" | "educator" | "admin";
          virtualBalance: string;
          emailVerifiedAt: string | null;
        }[]
      >`
        SELECT id,
               username,
               email,
               password_hash as "passwordHash",
               access_key_hash as "accessKeyHash",
               role,
               virtual_balance as "virtualBalance",
               email_verified_at as "emailVerifiedAt"
        FROM users
        WHERE email = ${usernameOrEmail} OR username = ${identifier}
        LIMIT 1
      `;

      if (!user) {
        ctx.set.status = 401;
        return { error: "Invalid credentials" };
      }

      let ok = false;
      if (body.password) {
        ok = await verifyPassword(body.password, user.passwordHash);
      } else if (body.accessKey && user.accessKeyHash) {
        ok = await verifyPassword(body.accessKey, user.accessKeyHash);
      }

      if (!ok) {
        ctx.set.status = 401;
        return { error: "Invalid credentials" };
      }

      const token = await ctx.jwt.sign({
        sub: user.id,
        username: user.username,
        role: user.role
      });

      await redis.set(`session:active:${token}`, user.id, "EX", 7 * 24 * 60 * 60);

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          virtualBalance: user.virtualBalance,
          emailVerifiedAt: user.emailVerifiedAt
        }
      };
    },
    {
      body: t.Object({
        usernameOrEmail: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        username: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        email: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        password: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
        accessKey: t.Optional(t.String({ minLength: 4, maxLength: 4 }))
      })
    }
  )
  .post("/logout", async (ctx) => {
    try {
      const { token } = await authenticate(ctx as any);
      const payload = await (ctx as any).jwt.verify(token);
      const exp = typeof payload?.exp === "number" ? payload.exp : Math.floor(Date.now() / 1000) + 3600;
      const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 1);

      await redis.set(`session:blacklist:${token}`, "1", "EX", ttl);
      await redis.del(`session:active:${token}`);

      return { ok: true };
    } catch {
      return { ok: true };
    }
  })
  .get("/me", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);
    return { user };
  })
  .post(
    "/verify-email",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const body = ctx.body as any;

      const result = await verifyEmailOtp(user.id, String(body.otp));

      if (result === "no-code") {
        ctx.set.status = 400;
        return { error: "No verification code is pending. Request a new one." };
      }
      if (result === "too-many-attempts") {
        ctx.set.status = 429;
        return { error: "Too many incorrect attempts. Request a new code." };
      }
      if (result === "wrong-code") {
        ctx.set.status = 400;
        return { error: "Incorrect code." };
      }

      await sql`UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = ${user.id}`;

      return { ok: true };
    },
    {
      body: t.Object({
        otp: t.String({ minLength: 6, maxLength: 6 })
      })
    }
  )
  .post("/resend-verification", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);

    const otp = await issueEmailOtp(user.id);
    await sendVerificationEmail({ to: user.email, username: user.username, otp }).catch((err) =>
      console.error("[mailer] verification email failed:", err)
    );

    return { ok: true };
  })
  .post(
    "/change-password",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const body = ctx.body as any;

      if (body.newPassword !== body.confirmNewPassword) {
        ctx.set.status = 400;
        return { error: "New password and confirm new password do not match." };
      }

      const [row] = await sql<{ passwordHash: string }[]>`
        SELECT password_hash as "passwordHash" FROM users WHERE id = ${user.id}
      `;

      const ok = await verifyPassword(body.currentPassword, row.passwordHash);
      if (!ok) {
        ctx.set.status = 401;
        return { error: "Current password is incorrect." };
      }

      const newHash = await hashPassword(body.newPassword);
      await sql`UPDATE users SET password_hash = ${newHash}, updated_at = NOW() WHERE id = ${user.id}`;

      return { ok: true };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1, maxLength: 128 }),
        newPassword: t.String({ minLength: 8, maxLength: 128 }),
        confirmNewPassword: t.String({ minLength: 8, maxLength: 128 })
      })
    }
  )
  .post(
    "/change-access-key",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const body = ctx.body as any;

      if (!ACCESS_KEY_PATTERN.test(String(body.newAccessKey ?? ""))) {
        ctx.set.status = 400;
        return { error: "Access Key must be exactly 4 digits." };
      }

      if (body.newAccessKey !== body.confirmNewAccessKey) {
        ctx.set.status = 400;
        return { error: "New Access Key and confirm Access Key do not match." };
      }

      const [row] = await sql<{ passwordHash: string }[]>`
        SELECT password_hash as "passwordHash" FROM users WHERE id = ${user.id}
      `;

      const ok = await verifyPassword(body.currentPassword, row.passwordHash);
      if (!ok) {
        ctx.set.status = 401;
        return { error: "Current password is incorrect." };
      }

      const newHash = await hashPassword(body.newAccessKey);
      await sql`UPDATE users SET access_key_hash = ${newHash}, updated_at = NOW() WHERE id = ${user.id}`;

      return { ok: true };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1, maxLength: 128 }),
        newAccessKey: t.String({ minLength: 4, maxLength: 4 }),
        confirmNewAccessKey: t.String({ minLength: 4, maxLength: 4 })
      })
    }
  );

// Everything in this file is loaded via a *dynamic* `import()` from
// index.ts, deliberately — see the comment there for why. Nothing here
// needs to change on account of that; this is the app exactly as it was
// before the reflect-metadata split, just moved into its own module.

import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { authModule } from "./modules/auth";
import { webauthnModule } from "./modules/webauthn";
import { competitionsModule } from "./modules/competitions";
import { indexesModule } from "./modules/indexes";
import { marketModule } from "./modules/market";
import { recommendationsModule } from "./modules/recommendations";
import { ordersModule } from "./modules/orders";
import { portfolioModule } from "./modules/portfolio";
import { watchlistModule } from "./modules/watchlist";
import { closeDb } from "./lib/db";
import { closeProducer } from "./lib/kafka";
import { closeRedis, connectRedis } from "./lib/redis";
import { startWorkers, stopWorkers } from "./workers/startWorkers";
import { ensureSchemaCompatibility } from "./db/bootstrapSchema";

await connectRedis();
await ensureSchemaCompatibility();
await startWorkers();

// Auth failures thrown by `authenticate()` (lib/auth.ts) — mapped to 401
// instead of the generic 400 the rest of our thrown Errors get, since these
// specifically mean "you're not signed in", not "your request is invalid".
const AUTH_ERROR_MESSAGES = new Set([
  "Missing bearer token",
  "Session expired. Please login again.",
  "Invalid token",
  "User not found"
]);

export const app = new Elysia()
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true
    })
  )
  // Central error handler: every route in this app throws plain `Error`
  // objects with short, safe, user-facing messages for expected business
  // failures ("Insufficient virtual balance...", "NSE/BSE is closed right
  // now...", "You don't own any X...", etc.) instead of returning a status
  // code directly. Without this handler, Elysia's default behaviour for an
  // uncaught throw is an opaque 500 Internal Server Error — which is why
  // every failure (wrong balance, market closed, auth expired, ...) looked
  // identical to the client no matter the real cause. This unwraps that
  // message and picks the right HTTP status instead.
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Invalid request — please check the values you submitted." };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found." };
    }
    if (code === "PARSE") {
      set.status = 400;
      return { error: "Malformed request body." };
    }

    // Every deliberate `throw new Error("...")` in this codebase (order
    // validation, auth checks, etc.) uses the plain `Error` constructor, so
    // `error.name === "Error"` reliably distinguishes those known, safe
    // messages from a genuinely unexpected failure (a bug, a dropped DB
    // connection, etc.), which will have a different error class/name and
    // should stay generic rather than leaking internals to the client.
    const isKnownDomainError = error instanceof Error && error.name === "Error";

    // Always log the full error server-side so real bugs/outages stay
    // debuggable even though the client only sees a clean message.
    console.error("[error]", code, error);

    if (isKnownDomainError) {
      const message = (error as Error).message;
      set.status = AUTH_ERROR_MESSAGES.has(message) ? 401 : 400;
      return { error: message };
    }

    set.status = 500;
    return { error: "Something went wrong on our end. Please try again." };
  })
  .use(
    jwt({
      name: "jwt",
      secret: env.JWT_SECRET,
      exp: "7d"
    })
  )
  .get("/health", () => ({
    ok: true,
    service: "invexa-backend",
    now: new Date().toISOString()
  }))
  .use(authModule)
  .use(webauthnModule)
  .use(marketModule)
  .use(recommendationsModule)
  .use(indexesModule)
  .use(portfolioModule)
  .use(watchlistModule)
  .use(ordersModule)
  .use(competitionsModule);

app.listen(env.PORT);
console.log(`Invexa backend listening on http://localhost:${env.PORT}`);

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down...`);
  await stopWorkers();
  await closeProducer();
  await closeRedis();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

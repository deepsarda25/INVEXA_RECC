import { Elysia } from "elysia";
import { coreRoutes } from "./routes/core";
import { participantRoutes } from "./routes/participants";
import { marketRoutes } from "./routes/market";
import { adminRoutes } from "./routes/admin";

export const competitionsModule = new Elysia({ prefix: "/competitions" })
  .use(coreRoutes)
  .use(participantRoutes)
  .use(marketRoutes)
  .use(adminRoutes);

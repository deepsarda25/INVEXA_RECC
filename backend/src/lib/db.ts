import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "../db/schema";

export const sql = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}
});

export const db = drizzle(sql, { schema });

export async function closeDb() {
  await sql.end({ timeout: 5 });
}

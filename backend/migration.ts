import { sql } from "./src/lib/db";

async function run() {
  try {
    await sql.unsafe("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;");
    console.log("Migration complete");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();

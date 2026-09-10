import { sql } from "./src/lib/db";

async function run() {
  try {
    await sql.unsafe("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS join_code VARCHAR(6) UNIQUE;");
    console.log("Migration complete: added join_code");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();

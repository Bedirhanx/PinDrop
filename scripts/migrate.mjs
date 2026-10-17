// Applies supabase/migrations/*.sql to the database in SUPABASE_DB_URL, in
// order, once each. Usage: npm run db:migrate
//
// You can instead paste each file into the Supabase SQL editor, oldest first.
import { readdirSync, readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Set SUPABASE_DB_URL in .env.local (Supabase → Connect → Session pooler URI).");
  process.exit(1);
}

const dir = new URL("../supabase/migrations/", import.meta.url);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`create table if not exists public.pindrop_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  await client.query("alter table public.pindrop_migrations enable row level security");
  await client.query("revoke all on public.pindrop_migrations from anon, authenticated");
  const { rows } = await client.query("select name from public.pindrop_migrations");
  const done = new Set(rows.map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    await client.query("begin");
    try {
      await client.query(readFileSync(new URL(file, dir), "utf8"));
      await client.query("insert into public.pindrop_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`✓ ${file}`);
    } catch (error) {
      await client.query("rollback");
      console.error(`✗ ${file}: ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}

// Runs the real Supabase migrations in an embedded Postgres (PGlite).
// Only the pieces Supabase itself provides are stubbed: the anon /
// authenticated / service_role roles, auth.users, auth.uid() and Supabase's
// default "grant everything on public tables" privileges, so the tests prove
// the migrations lock things down on their own.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(
      coalesce(
        current_setting('request.jwt.claim.sub', true),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      ),
      ''
    )::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createDatabase() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  }
  return db;
}

// Creates an auth user (which also creates their profile) and returns its id.
export async function createUser(db, email, meta = {}) {
  await asAdmin(db);
  const { rows } = await db.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify(meta)],
  );
  return rows[0].id;
}

export async function asAdmin(db) {
  await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
}

export async function asUser(db, id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
  await db.exec("set role authenticated");
}

export async function asAnon(db) {
  await db.exec("reset role; select set_config('request.jwt.claims', '', false); set role anon;");
}

// Runs a query as the given role and returns rows, or throws the DB error.
export async function rows(db, sql, params) {
  return (await db.query(sql, params)).rows;
}

export const basePin = {
  type: "requesting",
  community_category: "home",
  category: "Moving / lifting help",
  title: "Need help moving a desk",
  lat: 37.3192,
  lng: -122.0454,
};

// Columns clients may read (deleted_at and report_count are not among them).
export const PIN_COLUMNS =
  "id, author_id, type, community_category, category, title, description, lat, lng, approximate, place_label, payment, amount, currency, exchange_details, urgency, availability_start, availability_end, starts_at, ends_at, expires_at, hours, contact_note, skills, contact_tags, photo_path, status, claimant_id, confirmations, saves, last_confirmed_at, hidden_at, version, created_at, updated_at";

export async function insertPin(db, overrides = {}) {
  const pin = { ...basePin, ...overrides };
  const keys = Object.keys(pin);
  const { rows: result } = await db.query(
    `insert into public.pins (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning ${PIN_COLUMNS}`,
    keys.map((k) => pin[k]),
  );
  return result[0];
}

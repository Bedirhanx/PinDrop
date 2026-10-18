# PinDrop

A community map for small acts of help around De Anza College and the Bay Area:
see what neighbors need and offer, respond, message, and get it done.

Built with Next.js 16, MapLibre, Supabase (Postgres, Auth, Storage, Realtime)
and Zustand.

## How data flows

| Layer | Role |
| --- | --- |
| **Supabase / Postgres** | Source of truth for pins, accounts, claims, saves, reports, blocks and messages. Row Level Security and database functions enforce every rule. |
| **IndexedDB** | A cache of recently seen pins so the map opens instantly and works offline (read-only). |
| **Zustand** | In-memory UI state. |

Changing a pin's status goes through `public.pin_action()`, which locks the pin
row, so two people can never claim the same request. Clients can't update or
delete pins directly.

## Set up

You need Node.js 20.9 or newer.

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Configure environment variables:** copy `.env.example` to `.env.local` and
   fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   and `SUPABASE_DB_URL` (Supabase → **Connect** → Session pooler).
3. **Create the database:**
   ```bash
   npm install
   npm run db:migrate
   ```
   (Or paste each file in `supabase/migrations/` into the Supabase SQL editor,
   oldest first.)
4. **Configure sign-in** in Supabase → Authentication → URL Configuration:
   - Site URL: `https://pindrop-brown.vercel.app`
   - Redirect URLs: `https://pindrop-brown.vercel.app/**`,
     `https://*-satkynovilgizs-projects.vercel.app/**` (preview deployments) and
     `http://localhost:3000/**`
5. Run it:
   ```bash
   npm run dev
   ```
   Then open http://localhost:3000.

Without the Supabase variables the app still runs in a clearly labelled
preview mode (sample pins only; creating pins and accounts are disabled).

### Optional

- **Google sign-in:** enable the Google provider in Supabase → Authentication →
  Providers, then set `NEXT_PUBLIC_AUTH_GOOGLE=true`.
- **Verified student badge:** add a row to `public.verified_email_domains`
  (for example the college's student email domain). People who sign in with a
  matching address get the badge; existing accounts update when their email
  changes.
- **Moderators:** set `is_moderator = true` on a profile (SQL editor). Moderators
  can read reports and contact messages; pins reported by three people are hidden
  until a moderator clears `hidden_at`.
- **Helper chatbot:** set `GEMINI_API_KEY` (free from Google AI Studio) or
  `ANTHROPIC_API_KEY`, server-side only. Gemini is used when both are set; it
  defaults to Flash-Lite and retries once on Flash if Google is busy. Without
  a key the chat button doesn't appear.
- **Map tiles and routing:** the defaults are free OpenStreetMap community servers
  ([tile policy](https://operations.osmfoundation.org/policies/tiles/)), fine for
  light use. For real traffic, point `NEXT_PUBLIC_MAP_TILE_URL` and the
  `NEXT_PUBLIC_ROUTING_*_URL` variables at a commercial or self-hosted provider.

## Quality checks

```bash
npm run lint       # ESLint (Next.js core-web-vitals rules)
npm run test       # Unit tests + database tests (embedded Postgres via PGlite)
npm run test:e2e   # Playwright, desktop and mobile, against a production build
npm run build
npm run check      # lint + test + build
```

The database tests run the real migrations against an embedded Postgres, with
only Supabase's built-in pieces (roles, `auth.uid()`) stubbed, and check Row
Level Security, claiming, privacy and rate limits. The multi-user E2E tests
(`tests/e2e/community.spec.js`) need `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local`: they create throwaway accounts and delete them afterwards.

## Deploy to Vercel

1. In Vercel → Project → Settings → Environment Variables, add for
   **Production** and **Preview**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - optional: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_AUTH_GOOGLE`, map and routing URLs

   Never add `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_DB_URL` to Vercel; the app
   doesn't need them.
2. Push to GitHub. Vercel builds every branch as a preview and `main` as
   production.

## Where things are

| Path | What it holds |
| --- | --- |
| `app/(app)/` | The map app: `/`, `/p/[id]` (with share previews), `/settings`, `/account` |
| `app/(site)/` | Public pages: `/about`, `/contact`, `/signin`, `/signup` |
| `app/api/chat/route.js` | The helper chatbot endpoint |
| `components/` | UI. `PinDropApp.jsx` is the main screen; `MapView.jsx` the map |
| `lib/api.js`, `lib/rows.js` | Database access and row ↔ pin mapping |
| `lib/store.js` | App state, sync and IndexedDB cache |
| `lib/pins.js` | Pin rules: validation, statuses, privacy blur, search |
| `lib/samples.js` | Fictional sample pins (never stored on the server) |
| `supabase/migrations/` | Database schema, policies and functions |
| `tests/` | `unit/`, `db/` (Vitest) and `e2e/` (Playwright) |
| `legacy/` | The original single-file build, kept for reference |

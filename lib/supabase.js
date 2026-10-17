"use client";

// The browser's Supabase client. Only the public URL and publishable (anon)
// key are used here; Row Level Security in supabase/migrations decides what
// each person may read and write.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const backendConfigured = Boolean(url && key);

let client;

export function supabase() {
  if (!backendConfigured) {
    throw new Error("PinDrop’s community server isn’t configured yet.");
  }
  client ??= createClient(url, key, {
    auth: {
      // Implicit flow lets a magic link sent from a laptop be opened on a
      // phone; PKCE would require the same browser.
      flowType: "implicit",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}


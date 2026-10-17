"use client";

// Talks to the PinDrop database. Rows come back in the camelCase pin shape the
// components use (see rowToPin).
import { supabase } from "./supabase";
import { isUuid, pinToRow, rowToPin } from "./rows";

export { isUuid };

// Columns anyone may read. deleted_at and report_count are not readable.
const PIN_COLUMNS =
  "id,author_id,type,community_category,category,title,description,lat,lng,approximate,place_label,payment,amount,currency,exchange_details,urgency,availability_start,availability_end,starts_at,ends_at,expires_at,hours,contact_note,skills,contact_tags,photo_path,status,claimant_id,confirmations,saves,last_confirmed_at,hidden_at,version,created_at,updated_at";
const PIN_SELECT = `${PIN_COLUMNS},author:profiles!pins_author_id_fkey(display_name,is_student_verified,helped_count),claimant:profiles!pins_claimant_id_fkey(display_name)`;

const AREA_LIMIT = 500;

// Turns Supabase/PostgREST/network failures into a message for people.
export function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const message = String(error.message || "");
  if (
    error.name === "TypeError" ||
    /Failed to fetch|NetworkError|Load failed|network/i.test(message)
  ) {
    return "Can’t reach PinDrop right now. Check your connection and try again.";
  }
  if (/JWT expired|invalid JWT|session/i.test(message)) {
    return "Your session expired. Please sign in again.";
  }
  // Errors raised by our own database functions are written for people.
  if (error.code === "P0001" || error.code === "P0002") return message;
  if (error.code === "42501") {
    return /permission denied/.test(message) ? "You don’t have permission to do that." : message;
  }
  if (error.code === "23514" || error.code === "22023") {
    return /pins_|violates check/.test(message)
      ? "Some details aren’t valid. Check the form and try again."
      : message;
  }
  if (error.code === "23505") return "That’s already been done.";
  return message && message.length < 160 ? message : fallback;
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// ---- Pins ------------------------------------------------------------------

// Live pins inside a [west, south, east, north] box, newest first.
export async function fetchPinsInArea(bbox) {
  const [west, south, east, north] = bbox;
  const now = new Date().toISOString();
  const rows = check(
    await supabase()
      .from("pins")
      .select(PIN_SELECT)
      .gte("lat", south)
      .lte("lat", north)
      .gte("lng", west)
      .lte("lng", east)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(AREA_LIMIT),
  );
  return rows.map(rowToPin);
}

export async function fetchPin(id) {
  if (!isUuid(id)) return null;
  const row = check(await supabase().from("pins").select(PIN_SELECT).eq("id", id).maybeSingle());
  return row ? rowToPin(row) : null;
}

// Pins I wrote or am helping with, wherever they are.
export async function fetchMyPins(userId) {
  const rows = check(
    await supabase()
      .from("pins")
      .select(PIN_SELECT)
      .or(`author_id.eq.${userId},claimant_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200),
  );
  return rows.map(rowToPin);
}

export async function createPin(draft, photo) {
  const client = supabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth?.user) throw new Error("Sign in to drop a pin.");
  let photoPath;
  if (photo) {
    photoPath = `${auth.user.id}/${crypto.randomUUID()}.webp`;
    check(
      await client.storage
        .from("pin-photos")
        .upload(photoPath, photo, { contentType: "image/webp", upsert: false }),
    );
  }
  try {
    const row = check(
      await client
        .from("pins")
        .insert(pinToRow({ ...draft, photoPath }))
        .select(PIN_SELECT)
        .single(),
    );
    return rowToPin(row);
  } catch (error) {
    // Don't leave an orphaned photo behind.
    if (photoPath) await client.storage.from("pin-photos").remove([photoPath]);
    throw error;
  }
}

export async function pinAction(id, action) {
  check(await supabase().rpc("pin_action", { pin_id: id, action }));
  return action === "delete" ? null : fetchPin(id);
}

// ---- Per-user state ---------------------------------------------------------

export async function fetchUserState(userId) {
  const client = supabase();
  const [profile, settings, saved, confirmed, blocked] = await Promise.all([
    client
      .from("profiles")
      .select("id,display_name,is_student_verified,helped_count,created_at")
      .eq("id", userId)
      .maybeSingle(),
    client.from("user_settings").select("theme,nearby_only,show_samples").maybeSingle(),
    client.from("saved_pins").select("pin_id"),
    client.from("pin_confirmations").select("pin_id"),
    client.from("blocked_users").select("blocked_id,blocked:profiles!blocked_users_blocked_id_fkey(display_name)"),
  ]);
  const p = check(profile);
  return {
    profile: p && {
      id: p.id,
      name: p.display_name,
      verified: p.is_student_verified,
      helped: p.helped_count,
      createdAt: p.created_at,
    },
    settings: check(settings),
    saved: check(saved).map((r) => r.pin_id),
    confirmed: check(confirmed).map((r) => r.pin_id),
    blocked: check(blocked).map((r) => ({
      id: r.blocked_id,
      name: r.blocked?.display_name || "Neighbor",
    })),
  };
}

export async function setReaction(kind, pinId, active) {
  const table = kind === "save" ? "saved_pins" : "pin_confirmations";
  const client = supabase();
  if (active) {
    const { error } = await client.from(table).insert({ pin_id: pinId });
    // Already there (e.g. from another tab) is fine.
    if (error && error.code !== "23505") throw error;
  } else {
    check(await client.from(table).delete().eq("pin_id", pinId));
  }
}

export async function reportPin(pinId, reason) {
  const { error } = await supabase().from("reports").insert({ pin_id: pinId, reason });
  if (error?.code === "23505") throw new Error("You’ve already reported this pin. Thank you.");
  if (error) throw error;
}

export async function blockUser(userId) {
  const { error } = await supabase().from("blocked_users").insert({ blocked_id: userId });
  if (error && error.code !== "23505") throw error;
}

export async function unblockUser(userId) {
  check(await supabase().from("blocked_users").delete().eq("blocked_id", userId));
}

export async function updateDisplayName(userId, name) {
  check(await supabase().from("profiles").update({ display_name: name }).eq("id", userId));
}

export async function saveSettings(userId, settings) {
  check(await supabase().from("user_settings").upsert({ user_id: userId, ...settings }));
}

// ---- Claims & messages ------------------------------------------------------

// The live claim on a pin, if the current user may see it.
export async function fetchLiveClaim(pinId) {
  const row = check(
    await supabase()
      .from("pin_claims")
      .select("id,status,helper_id,created_at,helper:profiles!pin_claims_helper_id_fkey(display_name,helped_count,is_student_verified)")
      .eq("pin_id", pinId)
      .in("status", ["offered", "active"])
      .maybeSingle(),
  );
  return (
    row && {
      id: row.id,
      status: row.status,
      helperId: row.helper_id,
      helperName: row.helper?.display_name || "Neighbor",
      helperHelped: row.helper?.helped_count || 0,
      helperVerified: !!row.helper?.is_student_verified,
      createdAt: row.created_at,
    }
  );
}

export async function fetchMessages(claimId) {
  return check(
    await supabase()
      .from("messages")
      .select("id,sender_id,body,created_at")
      .eq("claim_id", claimId)
      .order("created_at")
      .limit(200),
  ).map((m) => ({ id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at }));
}

export async function sendMessage(claimId, pinId, body) {
  check(await supabase().from("messages").insert({ claim_id: claimId, pin_id: pinId, body }));
}

// Calls onChange whenever pins, claims or messages change. Returns unsubscribe.
export function subscribe(table, filter, onChange) {
  const client = supabase();
  const channel = client
    .channel(`${table}:${filter || "all"}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, onChange)
    .subscribe();
  return () => client.removeChannel(channel);
}


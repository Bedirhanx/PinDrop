"use client";

// App state.
// * Supabase (lib/api.js) is the source of truth for pins and accounts.
// * IndexedDB keeps a copy of recently seen pins so the map opens instantly
//   and still shows something offline.
// * UI preferences live in localStorage, and in the account when signed in.
import { create } from "zustand";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import * as api from "./api";
import { CAMPUS } from "./constants";
import { inBbox, normalizeDraft, validateDraft } from "./pins";
import { isValidPin } from "./rows";
import { backendConfigured, supabase } from "./supabase";

const CACHE_KEY = "pindrop-cache-v2";
// Pins from the earlier, browser-only version of PinDrop.
const LEGACY_KEY = "pindrop-data-v1";
const MAX_CACHED_PINS = 1500;

export function readSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// Thrown when an action needs an account; the UI opens the sign-in dialog.
export class SignInRequired extends Error {
  constructor(reason) {
    super(reason);
    this.signIn = true;
  }
}

// What to bring back after "Retry" reloads the page to recover the map.
const RECOVERY_KEY = "pindrop-map-recovery";

export function saveRecovery() {
  const { filter, categoryGroup, search, center, zoom, bbox, sheet } = useUi.getState();
  try {
    sessionStorage.setItem(
      RECOVERY_KEY,
      JSON.stringify({ filter, categoryGroup, search, center, zoom, bbox, sheet }),
    );
  } catch {}
}

// Reads (once) and validates state saved by saveRecovery.
function takeRecovery() {
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY);
    sessionStorage.removeItem(RECOVERY_KEY);
    const saved = JSON.parse(raw || "null");
    if (!saved || typeof saved !== "object") return {};
    const out = {};
    for (const key of ["filter", "categoryGroup", "search", "sheet"]) {
      if (typeof saved[key] === "string" && saved[key].length <= 100) out[key] = saved[key];
    }
    if (Number.isFinite(saved.center?.lat) && Number.isFinite(saved.center?.lng)) {
      out.center = { lat: saved.center.lat, lng: saved.center.lng };
    }
    if (Number.isFinite(saved.zoom)) out.zoom = saved.zoom;
    if (Array.isArray(saved.bbox) && saved.bbox.length === 4 && saved.bbox.every(Number.isFinite)) {
      out.bbox = saved.bbox;
    }
    return out;
  } catch {
    return {};
  }
}

let toastTimer;

export const useUi = create((set, get) => ({
  filter: "all",
  categoryGroup: "all",
  search: "",
  zoom: 16,
  center: CAMPUS,
  bbox: [CAMPUS.lng - 0.02, CAMPUS.lat - 0.02, CAMPUS.lng + 0.02, CAMPUS.lat + 0.02],
  nearby: readSetting("pindrop-nearby") === "true",
  showSamples: readSetting("pindrop-samples") !== "false",
  theme: readSetting("pindrop-theme") === "light" ? "light" : "dark",
  sheet: "half",
  toast: null,
  // Why the sign-in dialog was opened, e.g. "Sign in to save pins."
  signInReason: "",
  ...(typeof window === "undefined" ? {} : takeRecovery()),
  set,
  notify: (message, tone = "success") => {
    clearTimeout(toastTimer);
    set({ toast: { message, tone } });
    toastTimer = setTimeout(() => set({ toast: null }), tone === "error" ? 7000 : 4500);
  },
  // Changes a preference and remembers it here and in the account.
  setPreference: (changes) => {
    set(changes);
    const { theme, nearby, showSamples } = { ...get(), ...changes };
    writeSetting("pindrop-theme", theme);
    writeSetting("pindrop-nearby", String(nearby));
    writeSetting("pindrop-samples", String(showSamples));
    const user = usePins.getState().user;
    if (user) {
      api
        .saveSettings(user.id, { theme, nearby_only: nearby, show_samples: showSamples })
        .catch(() =>
          get().notify("Saved on this device, but couldn’t sync to your account.", "info"),
        );
    }
  },
}));

// ---- Cache --------------------------------------------------------------------

let cacheTimer;
function scheduleCacheWrite() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const { pins, user } = usePins.getState();
    const recent = Object.values(pins)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, MAX_CACHED_PINS);
    idbSet(CACHE_KEY, { pins: recent, userId: user?.id || null, savedAt: Date.now() }).catch(
      () => {},
    );
  }, 400);
}

async function readCache() {
  try {
    const cached = await idbGet(CACHE_KEY);
    return Array.isArray(cached?.pins) ? cached.pins.filter(isValidPin) : [];
  } catch {
    return [];
  }
}

// Expands a bbox by a quarter on each side so small pans don't refetch.
function padBbox([west, south, east, north]) {
  const dx = (east - west) * 0.25;
  const dy = (north - south) * 0.25;
  return [west - dx, south - dy, east + dx, north + dy];
}

function containsBbox(outer, inner) {
  return outer && outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}

// ---- Pins & account ----------------------------------------------------------

export const usePins = create((set, get) => {
  const merge = (list) => {
    if (!list.length) return;
    const pins = { ...get().pins };
    for (const pin of list) pins[pin.id] = pin;
    set({ pins });
    scheduleCacheWrite();
  };

  const remove = (id) => {
    if (!get().pins[id]) return;
    const pins = { ...get().pins };
    delete pins[id];
    set({ pins });
    scheduleCacheWrite();
  };

  const requireUser = (reason) => {
    if (!backendConfigured) {
      throw new Error("Sharing isn’t available yet: PinDrop’s community server isn’t configured.");
    }
    const user = get().user;
    if (!user) throw new SignInRequired(reason);
    return user;
  };

  const run = async (task, fallback) => {
    try {
      return await task();
    } catch (error) {
      if (error.signIn) throw error;
      throw new Error(api.friendlyError(error, fallback));
    }
  };

  let loadedArea = null;
  let areaRequest = 0;

  async function onSession(session) {
    const user = session?.user ? { id: session.user.id, email: session.user.email } : null;
    if (user?.id === get().user?.id) {
      set({ authReady: true });
      return;
    }
    set({ user, authReady: true, profile: null, saved: [], confirmed: [], blocked: [] });
    if (!user) return;
    try {
      const state = await api.fetchUserState(user.id);
      if (get().user?.id !== user.id) return;
      set({
        profile: state.profile,
        saved: state.saved,
        confirmed: state.confirmed,
        blocked: state.blocked,
      });
      if (state.settings) {
        useUi.setState({
          theme: state.settings.theme,
          nearby: state.settings.nearby_only,
          showSamples: state.settings.show_samples,
        });
      }
      merge(await api.fetchMyPins(user.id));
    } catch (error) {
      useUi.getState().notify(api.friendlyError(error, "Couldn’t load your account."), "error");
    }
  }

  return {
    ready: false,
    backend: backendConfigured,
    // "idle" | "loading" | "live" | "offline" | "error"
    sync: "idle",
    pins: {},
    // Pin ids the server says don't exist (or were deleted).
    missing: {},
    authReady: !backendConfigured,
    user: null,
    profile: null,
    saved: [],
    confirmed: [],
    blocked: [],
    legacyPins: [],

    async init() {
      if (get().ready) return;
      const [cached, legacy] = await Promise.all([
        readCache(),
        idbGet(LEGACY_KEY).catch(() => null),
      ]);
      set({
        ready: true,
        legacyPins: Array.isArray(legacy?.pins)
          ? legacy.pins.filter((pin) => isValidPin(pin) && !pin.sample && !pin.deletedAt && !String(pin.authorId).startsWith("sample"))
          : [],
      });
      merge(cached);
      if (!backendConfigured) return;

      const client = supabase();
      // A magic link that expired comes back with an error in the URL.
      const hash = new URLSearchParams(location.hash.slice(1));
      if (hash.get("error_description")) {
        useUi.getState().notify(hash.get("error_description").replaceAll("+", " "), "error");
        history.replaceState(null, "", location.pathname);
      }
      client.auth.onAuthStateChange((event, session) => {
        // Supabase advises not awaiting its own calls inside this callback.
        setTimeout(() => onSession(session), 0);
        if (event === "SIGNED_IN" && location.hash.includes("access_token")) {
          history.replaceState(null, "", location.pathname);
        }
      });
      const { data } = await client.auth.getSession();
      await onSession(data.session);

      // Live updates: other people's new pins, claims and deletions.
      api.subscribe("pins", null, ({ eventType, new: row }) => {
        if (eventType === "DELETE" || !row?.id) return;
        if (row.deleted_at || (row.hidden_at && row.author_id !== get().user?.id)) {
          remove(row.id);
          return;
        }
        get().loadPin(row.id, { quiet: true });
      });
    },

    // Fetches pins for the map area; skips areas already covered.
    async loadArea(bbox, { force = false } = {}) {
      if (!backendConfigured) return;
      if (!force && containsBbox(loadedArea, bbox)) return;
      const padded = padBbox(bbox);
      const request = ++areaRequest;
      set({ sync: "loading" });
      try {
        const fresh = await api.fetchPinsInArea(padded);
        if (request !== areaRequest) return;
        loadedArea = padded;
        // Forget cached pins in this area that the server no longer returns,
        // unless the result was cut off by the limit.
        if (fresh.length < 500) {
          const ids = new Set(fresh.map((pin) => pin.id));
          const userId = get().user?.id;
          const pins = { ...get().pins };
          for (const pin of Object.values(pins)) {
            if (!ids.has(pin.id) && inBbox(pin, padded) && pin.authorId !== userId) {
              delete pins[pin.id];
            }
          }
          set({ pins });
        }
        merge(fresh);
        set({ sync: "live" });
      } catch {
        if (request === areaRequest) set({ sync: navigator.onLine ? "error" : "offline" });
      }
    },

    // Fetches one pin by id. Returns the pin, or null if it doesn't exist.
    async loadPin(id, { quiet = false } = {}) {
      if (!backendConfigured || !api.isUuid(id)) {
        if (!get().pins[id]) set({ missing: { ...get().missing, [id]: true } });
        return get().pins[id] || null;
      }
      try {
        const pin = await api.fetchPin(id);
        if (pin) {
          merge([pin]);
          if (get().missing[id]) {
            const missing = { ...get().missing };
            delete missing[id];
            set({ missing });
          }
        } else {
          remove(id);
          set({ missing: { ...get().missing, [id]: true } });
        }
        return pin;
      } catch (error) {
        if (quiet) return get().pins[id] || null;
        throw new Error(api.friendlyError(error, "Couldn’t load this pin."));
      }
    },

    async create(input, photo) {
      requireUser("Sign in to drop a pin. It only takes an email.");
      const errors = validateDraft(input);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      // Blurs approximate locations before they leave the device.
      const draft = normalizeDraft(input);
      return run(async () => {
        const pin = await api.createPin(draft, photo);
        merge([pin]);
        return pin;
      }, "Couldn’t publish your pin.");
    },

    async act(id, action) {
      requireUser("Sign in to respond to pins.");
      return run(async () => {
        const pin = await api.pinAction(id, action);
        if (pin) merge([pin]);
        else {
          remove(id);
          set({ missing: { ...get().missing, [id]: true } });
        }
        return pin;
      }, "Couldn’t update this pin.");
    },

    // Toggles "save" or "confirm" on a pin. The screen changes only after the
    // server confirms, and the new state is returned (true = now on).
    async toggle(kind, id) {
      requireUser(kind === "save" ? "Sign in to save pins." : "Sign in to confirm pins.");
      const listKey = kind === "save" ? "saved" : "confirmed";
      const countKey = kind === "save" ? "saves" : "confirmations";
      const on = !get()[listKey].includes(id);
      try {
        await api.setReaction(kind, id, on);
      } catch (error) {
        throw new Error(api.friendlyError(error));
      }
      const pin = get().pins[id];
      set({
        [listKey]: on ? [...new Set([...get()[listKey], id])] : get()[listKey].filter((p) => p !== id),
        ...(pin
          ? { pins: { ...get().pins, [id]: { ...pin, [countKey]: Math.max(0, pin[countKey] + (on ? 1 : -1)) } } }
          : {}),
      });
      return on;
    },

    async report(id, reason) {
      requireUser("Sign in to report pins, so reports can’t be spammed.");
      const text = reason.trim();
      if (text.length < 3 || text.length > 500) {
        throw new Error("Explain the issue in 3–500 characters.");
      }
      return run(() => api.reportPin(id, text), "Couldn’t send your report.");
    },

    async block(userId, name) {
      requireUser("Sign in to block neighbors.");
      await run(() => api.blockUser(userId), "Couldn’t block this neighbor.");
      if (!get().blocked.some((b) => b.id === userId)) {
        set({ blocked: [...get().blocked, { id: userId, name: name || "Neighbor" }] });
      }
    },

    async unblock(userId) {
      requireUser("Sign in to manage blocked neighbors.");
      await run(() => api.unblockUser(userId), "Couldn’t unblock this neighbor.");
      set({ blocked: get().blocked.filter((b) => b.id !== userId) });
    },

    async updateProfile(name) {
      const user = requireUser("Sign in to set your name.");
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) throw new Error("Enter a display name");
      await run(() => api.updateDisplayName(user.id, trimmed), "Couldn’t save your name.");
      set({
        profile: { ...get().profile, name: trimmed },
        pins: Object.fromEntries(
          Object.entries(get().pins).map(([id, pin]) => [
            id,
            pin.authorId === user.id ? { ...pin, authorName: trimmed } : pin,
          ]),
        ),
      });
    },

    async signInWithEmail(email, redirectTo) {
      const address = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        throw new Error("Enter a valid email address.");
      }
      const { error } = await supabase().auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) {
        throw new Error(
          error.code === "over_email_send_rate_limit"
            ? "PinDrop has reached its email limit for now, so no link was sent. Please try again in an hour."
            : error.status === 429
              ? "Too many attempts. Wait a minute, then try again."
            : api.friendlyError(error, "Couldn’t send the sign-in email."),
        );
      }
    },

    async signInWithGoogle(redirectTo) {
      const { error } = await supabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw new Error(api.friendlyError(error, "Couldn’t start Google sign-in."));
    },

    async signOut() {
      await supabase().auth.signOut();
      await idbDel(CACHE_KEY).catch(() => {});
    },

    async exportLegacy() {
      return get().legacyPins;
    },
  };
});

"use client";

// App state. UI preferences live in localStorage; pins live in IndexedDB.
import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { CAMPUS } from "./constants";
import {
  applyAction,
  bayAreaSamples,
  initialPins,
  normalizeDraft,
  uuid,
  validateDraft,
} from "./pins";

const DATA_KEY = "pindrop-data-v1";

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

function readBlocked() {
  try {
    const value = JSON.parse(readSetting("pindrop-blocked") || "[]");
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

let toastTimer;

export const useUi = create((set) => ({
  filter: "all",
  categoryGroup: "all",
  search: "",
  zoom: 16,
  center: CAMPUS,
  bbox: [CAMPUS.lng - 0.02, CAMPUS.lat - 0.02, CAMPUS.lng + 0.02, CAMPUS.lat + 0.02],
  blocked: readBlocked(),
  nearby: readSetting("pindrop-nearby") === "true",
  theme: readSetting("pindrop-theme") === "light" ? "light" : "dark",
  sheet: "half",
  toast: "",
  set,
  notify: (message) => {
    clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: "" }), 4500);
  },
}));

export const usePins = create((set, get) => {
  const save = () => {
    const { pins, saved, confirmed, profile, reports } = get();
    return idbSet(DATA_KEY, { pins, saved, confirmed, profile, reports });
  };

  const update = (changes) => {
    set(changes);
    return save();
  };

  const findPin = (id) => {
    const pin = get().pins.find((p) => p.id === id);
    if (!pin || pin.deletedAt) throw new Error("This pin no longer exists");
    return pin;
  };

  const replacePin = (next) =>
    get().pins.map((pin) => (pin.id === next.id ? next : pin));

  return {
    ready: false,
    error: null,
    pins: [],
    saved: [],
    confirmed: [],
    reports: {},
    profile: null,

    async init() {
      if (get().ready) return;
      try {
        const stored = await idbGet(DATA_KEY);
        if (stored) {
          set({ ...stored, reports: stored.reports || {}, ready: true });
          return;
        }
        set({
          pins: initialPins(),
          profile: { id: uuid(), name: readSetting("neighborly-name") || "You" },
          ready: true,
        });
        await save();
      } catch (error) {
        set({ error });
      }
    },

    // Adds fictional neighborhood listings for the visible area.
    async addSamples(bbox, zoom) {
      const known = new Set(get().pins.map((pin) => pin.id));
      const fresh = bayAreaSamples(bbox, zoom).filter((pin) => !known.has(pin.id));
      if (fresh.length) await update({ pins: [...get().pins, ...fresh] });
    },

    async create(input) {
      const errors = validateDraft(input);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      const draft = normalizeDraft(input);
      const { profile } = get();
      const now = new Date().toISOString();
      const pin = {
        ...draft,
        id: uuid(),
        status: "open",
        authorId: profile.id,
        authorName: profile.name,
        confirmations: 0,
        saves: 0,
        lastConfirmedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await update({ pins: [...get().pins, pin] });
      return pin;
    },

    async act(id, action) {
      const next = applyAction(findPin(id), action, get().profile.id);
      await update({ pins: replacePin(next) });
      return next;
    },

    // Toggles "save" or "confirm" on a pin.
    async react(id, kind) {
      const pin = findPin(id);
      const listKey = kind === "save" ? "saved" : "confirmed";
      const countKey = kind === "save" ? "saves" : "confirmations";
      const list = get()[listKey];
      const active = list.includes(id);
      const now = new Date().toISOString();
      const next = {
        ...pin,
        [countKey]: Math.max(0, pin[countKey] + (active ? -1 : 1)),
        updatedAt: now,
        version: pin.version + 1,
        ...(kind === "confirm" && !active ? { lastConfirmedAt: now } : {}),
      };
      await update({
        pins: replacePin(next),
        [listKey]: active ? list.filter((p) => p !== id) : [...list, id],
      });
    },

    async report(id, reason) {
      const text = reason.trim();
      if (text.length < 3 || text.length > 500) {
        throw new Error("Explain the issue in 3–500 characters.");
      }
      const pin = findPin(id);
      if (pin.authorId === get().profile.id) {
        throw new Error("You cannot report your own pin.");
      }
      if (get().reports[id]) return;
      await update({
        reports: {
          ...get().reports,
          [id]: { reason: text, at: new Date().toISOString() },
        },
      });
    },

    async updateProfile(name) {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) throw new Error("Enter a display name");
      const profile = { ...get().profile, name: trimmed };
      await update({
        profile,
        pins: get().pins.map((pin) =>
          pin.authorId === profile.id ? { ...pin, authorName: trimmed } : pin,
        ),
      });
    },
  };
});

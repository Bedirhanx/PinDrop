"use client";

// Hands a pin drafted by PinDrop AI to the map's "Drop a pin" form, even when
// the chat was on another page: it's kept in sessionStorage until the map
// picks it up.
export const DRAFT_EVENT = "pindrop:use-draft";
const DRAFT_KEY = "pindrop-ai-draft";

export function storeDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

export function peekDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    return draft && typeof draft === "object" ? draft : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
}

// Pages that show the map (and its "Drop a pin" form).
export function isMapPath(path) {
  return path === "/" || path.startsWith("/p/") || path === "/settings" || path === "/account";
}

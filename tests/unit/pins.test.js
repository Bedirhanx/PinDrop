import { describe, expect, it } from "vitest";
import {
  allowedActions,
  APPROXIMATE_CELL_METRES,
  blurLocation,
  distance,
  effectiveStatus,
  inBbox,
  matchesSearch,
  mergeTags,
  normalizeDraft,
  validateDraft,
} from "@/lib/pins";

const valid = {
  type: "requesting",
  communityCategory: "home",
  category: "Moving / lifting help",
  title: "Need help moving a desk",
  payment: "free",
  lat: 37.3192,
  lng: -122.0454,
};

describe("validateDraft", () => {
  it("accepts a minimal request", () => {
    expect(validateDraft(valid)).toEqual({});
  });

  it("flags titles, categories, payments, events and dates", () => {
    expect(validateDraft({ ...valid, title: "x" }).title).toBeTruthy();
    expect(validateDraft({ ...valid, title: "x".repeat(81) }).title).toBeTruthy();
    expect(validateDraft({ ...valid, category: "Not a thing" }).category).toBeTruthy();
    expect(validateDraft({ ...valid, communityCategory: "food" }).category).toBeTruthy();
    expect(validateDraft({ ...valid, payment: "paid" }).amount).toBeTruthy();
    expect(validateDraft({ ...valid, payment: "paid", amount: 5 }).amount).toBeUndefined();
    expect(validateDraft({ ...valid, payment: "barter" }).exchangeDetails).toBeTruthy();
    expect(validateDraft({ ...valid, payment: "timeCredit", exchangeDetails: "1h" })).toEqual({});
    expect(validateDraft({ ...valid, availabilityStart: "2026-10-20" }).availabilityEnd).toBeTruthy();
    expect(
      validateDraft({ ...valid, availabilityStart: "2026-10-20", availabilityEnd: "2026-10-19" })
        .availabilityEnd,
    ).toBeTruthy();
    expect(validateDraft({ ...valid, expiresAt: "not a date" }).expiresAt).toBeTruthy();
    const event = { ...valid, type: "event", communityCategory: "culture", category: "Open mic" };
    expect(validateDraft(event).endsAt).toBeTruthy();
    expect(
      validateDraft({ ...event, startsAt: "2026-11-01T10:00", endsAt: "2026-11-01T09:00" }).endsAt,
    ).toBeTruthy();
    expect(validateDraft({ ...event, startsAt: "2026-11-01T10:00", endsAt: "2026-11-01T12:00" })).toEqual({});
  });
});

describe("normalizeDraft", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");

  it("trims text, drops irrelevant fields and sets default expiries", () => {
    const draft = normalizeDraft(
      { ...valid, title: "  Desk  ", description: "  ", amount: 4, exchangeDetails: "x", startsAt: "2026-10-18" },
      now,
    );
    expect(draft.title).toBe("Desk");
    expect(draft.description).toBe("");
    expect(draft.amount).toBeUndefined();
    expect(draft.exchangeDetails).toBeUndefined();
    expect(draft.startsAt).toBeUndefined();
    expect(Date.parse(draft.expiresAt) - now).toBe(7 * 864e5);
    const alert = normalizeDraft({ ...valid, type: "alert", communityCategory: "safety" }, now);
    expect(Date.parse(alert.expiresAt) - now).toBe(864e5);
  });

  it("blurs approximate locations before they leave the device", () => {
    const draft = normalizeDraft({ ...valid, approximate: true }, now);
    expect(draft.lat).not.toBe(valid.lat);
    expect(distance(draft, valid)).toBeLessThan(APPROXIMATE_CELL_METRES * 1.5);
  });
});

describe("blurLocation", () => {
  it("stays within the point's grid cell and isn't a fixed centre", () => {
    const point = { lat: 37.31921234, lng: -122.04541234 };
    const a = blurLocation(point, () => 0);
    const b = blurLocation(point, () => 1);
    expect(a).not.toEqual(b);
    for (const p of [a, b, blurLocation(point)]) {
      expect(distance(p, point)).toBeLessThan(APPROXIMATE_CELL_METRES * 1.5);
    }
    // Blurring again stays in the same cell (the server re-applies it).
    const again = blurLocation(blurLocation(point, () => 0.5), () => 0.5);
    expect(distance(again, blurLocation(point, () => 0.5))).toBeLessThan(1);
  });
});

describe("statuses and actions", () => {
  const future = new Date(Date.now() + 864e5).toISOString();
  const pin = { id: "p", type: "requesting", status: "open", authorId: "alice", expiresAt: future };

  it("archives expired pins and finished events", () => {
    expect(effectiveStatus({ ...pin, expiresAt: "2000-01-01" })).toBe("archived");
    expect(effectiveStatus({ ...pin, type: "event", endsAt: "2000-01-01", expiresAt: undefined })).toBe(
      "archived",
    );
    expect(effectiveStatus({ ...pin, status: "done", expiresAt: "2000-01-01" })).toBe("done");
  });

  it("never offers authors a claim on their own request", () => {
    expect(allowedActions(pin, "alice")).not.toContain("claim");
    expect(allowedActions(pin, "alice")).toEqual(expect.arrayContaining(["cancel", "delete"]));
    expect(allowedActions(pin, "bob")).toEqual(["claim"]);
    expect(allowedActions(pin, undefined)).toEqual([]);
  });

  it("follows the claim lifecycle", () => {
    const claimed = { ...pin, status: "claimed", claimantId: "bob" };
    expect(allowedActions(claimed, "bob")).toEqual(["withdraw"]);
    expect(allowedActions(claimed, "alice")).toEqual(
      expect.arrayContaining(["accept", "decline", "complete", "cancel", "delete"]),
    );
    expect(allowedActions(claimed, "carol")).toEqual([]);
    const active = { ...claimed, status: "active" };
    expect(allowedActions(active, "bob")).toEqual(["withdraw", "complete"]);
    const done = { ...pin, status: "done" };
    expect(allowedActions(done, "alice")).toContain("reopen");
    expect(allowedActions(done, "bob")).toEqual([]);
  });

  it("keeps samples and events read-only", () => {
    expect(allowedActions({ ...pin, sample: true }, "bob")).toEqual([]);
    expect(allowedActions({ ...pin, type: "event" }, "bob")).toEqual([]);
    expect(allowedActions({ ...pin, type: "offering" }, "bob")).toEqual(["claim"]);
  });
});

describe("geography and search", () => {
  it("measures distance and handles antimeridian boxes", () => {
    expect(distance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111195, -2);
    expect(inBbox({ lat: 1, lng: 1 }, [0, 0, 2, 2])).toBe(true);
    expect(inBbox({ lat: 1, lng: 179.5 }, [179, 0, -179, 2])).toBe(true);
    expect(inBbox({ lat: 1, lng: 0 }, [179, 0, -179, 2])).toBe(false);
  });

  it("matches every word, ignoring case and accents", () => {
    const pin = { title: "Café study group", description: "Calculus", category: "Study group", skills: ["Math"] };
    expect(matchesSearch(pin, "cafe CALC")).toBe(true);
    expect(matchesSearch(pin, "math")).toBe(true);
    expect(matchesSearch(pin, "cafe piano")).toBe(false);
    expect(matchesSearch(pin, "   ")).toBe(true);
  });

  it("merges tags without duplicates", () => {
    expect(mergeTags(["Math"], ["math", " Art ", "", "x".repeat(61)], 5)).toEqual(["Math", "Art"]);
    expect(mergeTags(["a", "b"], ["c", "d"], 3)).toEqual(["a", "b", "c"]);
  });
});

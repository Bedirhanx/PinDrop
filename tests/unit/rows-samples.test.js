import { describe, expect, it } from "vitest";
import { isUuid, isValidPin, pinToRow, rowToPin } from "@/lib/rows";
import { allSamples, isSampleId, sampleById, samplesInArea } from "@/lib/samples";
import { CAMPUS } from "@/lib/constants";

describe("row mapping", () => {
  const row = {
    id: "8f6c2a6e-6d9c-4a54-9a4a-0b6a7f4c1d11",
    author_id: "a",
    type: "requesting",
    community_category: "home",
    category: "Moving / lifting help",
    title: "Desk",
    description: null,
    lat: "37.3",
    lng: -122,
    approximate: true,
    amount: "12.50",
    place_label: null,
    skills: null,
    photo_path: "a/8f6c2a6e-6d9c-4a54-9a4a-0b6a7f4c1d11.webp",
    status: "claimed",
    claimant_id: "b",
    created_at: "2026-10-17T00:00:00Z",
    author: { display_name: "Alice", is_student_verified: true, helped_count: 3 },
    claimant: { display_name: "Bob" },
  };

  it("converts rows into the app's pin shape", () => {
    const pin = rowToPin(row);
    expect(pin).toMatchObject({
      authorId: "a",
      communityCategory: "home",
      lat: 37.3,
      amount: 12.5,
      description: "",
      skills: [],
      authorName: "Alice",
      authorVerified: true,
      authorHelped: 3,
      claimantName: "Bob",
    });
    expect(pin.placeLabel).toBeUndefined();
    expect(pin.photoUrl).toMatch(/\/storage\/v1\/object\/public\/pin-photos\/a\//);
    expect(isValidPin(pin)).toBe(true);
  });

  it("only sends fields people may write", () => {
    const out = pinToRow({
      ...rowToPin(row),
      status: "done",
      authorId: "evil",
      confirmations: 99,
      placeLabel: "",
      photoPath: "a/x.webp",
    });
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("author_id");
    expect(out).not.toHaveProperty("confirmations");
    expect(out).not.toHaveProperty("place_label");
    expect(out).toMatchObject({ community_category: "home", photo_path: "a/x.webp", amount: 12.5 });
  });

  it("rejects malformed cached data and ids", () => {
    expect(isValidPin(null)).toBeFalsy();
    expect(isValidPin({ id: "x", title: "t", type: "place", lat: "1", lng: 2, createdAt: "2026-01-01" })).toBeFalsy();
    expect(isUuid("8f6c2a6e-6d9c-4a54-9a4a-0b6a7f4c1d11")).toBe(true);
    expect(isUuid("../../etc")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("samples", () => {
  it("have stable ids that can't be mistaken for real pins", () => {
    const ids = allSamples().map((pin) => pin.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isSampleId)).toBe(true);
    expect(ids.some(isUuid)).toBe(false);
    expect(sampleById("sample-campus-0")?.title).toBeTruthy();
    expect(sampleById("8f6c2a6e-6d9c-4a54-9a4a-0b6a7f4c1d11")).toBeUndefined();
    expect(allSamples().every((pin) => pin.sample && isValidPin(pin))).toBe(true);
  });

  it("appear only for the visible area and zoom", () => {
    const box = [CAMPUS.lng - 0.01, CAMPUS.lat - 0.01, CAMPUS.lng + 0.01, CAMPUS.lat + 0.01];
    expect(samplesInArea(box, 16).length).toBeGreaterThan(10);
    expect(samplesInArea(box, 5)).toEqual([]);
  });
});

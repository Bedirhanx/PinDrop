import { beforeEach, describe, expect, it } from "vitest";
import {
  asAdmin,
  asAnon,
  asUser,
  createDatabase,
  createUser,
  insertPin,
  PIN_COLUMNS,
  rows,
} from "./harness";

let db;
let alice;
let bob;
let carol;

beforeEach(async () => {
  db = await createDatabase();
  alice = await createUser(db, "alice@example.com", { full_name: "Alice" });
  bob = await createUser(db, "bob@example.com");
  carol = await createUser(db, "carol@example.com");
}, 30000);

const action = (id, name) =>
  db.query(`select ${PIN_COLUMNS} from public.pin_action($1, $2)`, [id, name]);

describe("profiles", () => {
  it("creates a profile without exposing the email as a name", async () => {
    await asAnon(db);
    const profiles = await rows(db, "select id, display_name from public.profiles order by display_name");
    expect(profiles.map((p) => p.display_name)).toEqual(["Alice", "Neighbor", "Neighbor"]);
  });

  it("lets people rename only themselves and not grant themselves badges", async () => {
    await asUser(db, bob);
    await db.query("update public.profiles set display_name = 'Bobby' where id = $1", [bob]);
    const hijack = await db.query("update public.profiles set display_name = 'x' where id = $1", [alice]);
    expect(hijack.affectedRows).toBe(0);
    await expect(
      db.query("update public.profiles set is_student_verified = true where id = $1", [bob]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("update public.profiles set is_moderator = true where id = $1", [bob]),
    ).rejects.toThrow(/permission denied/);
    await asAnon(db);
    expect((await rows(db, "select display_name from public.profiles where id = $1", [bob]))[0].display_name).toBe("Bobby");
  });

  it("verifies students by email domain once a domain is configured", async () => {
    await asAdmin(db);
    await db.query("insert into public.verified_email_domains values ('student.example.edu')");
    const student = await createUser(db, "Sam@Student.Example.edu");
    expect((await rows(db, "select is_student_verified from public.profiles where id = $1", [student]))[0].is_student_verified).toBe(true);
    expect((await rows(db, "select is_student_verified from public.profiles where id = $1", [bob]))[0].is_student_verified).toBe(false);
  });

  it("keeps settings private", async () => {
    await asUser(db, alice);
    await db.query("update public.user_settings set theme = 'light'");
    await asUser(db, bob);
    expect(await rows(db, "select * from public.user_settings")).toHaveLength(1);
    expect((await rows(db, "select theme from public.user_settings"))[0].theme).toBe("dark");
  });
});

describe("pins", () => {
  it("are created by signed-in users and readable by everyone", async () => {
    await asUser(db, alice);
    const pin = await insertPin(db);
    expect(pin.author_id).toBe(alice);
    expect(pin.status).toBe("open");
    // Requests default to a 7 day expiry.
    expect(new Date(pin.expires_at) - Date.now()).toBeGreaterThan(6.9 * 864e5);
    await asAnon(db);
    expect(await rows(db, "select id, title from public.pins")).toEqual([{ id: pin.id, title: pin.title }]);
  });

  it("can't be created anonymously or on someone else's behalf", async () => {
    await asAnon(db);
    await expect(insertPin(db)).rejects.toThrow(/permission denied/);
    await asUser(db, bob);
    await expect(insertPin(db, { author_id: alice })).rejects.toThrow(/permission denied/);
    await expect(insertPin(db, { status: "done" })).rejects.toThrow(/permission denied/);
    await expect(insertPin(db, { confirmations: 99 })).rejects.toThrow(/permission denied/);
  });

  it("can't be edited or deleted directly, even by their author", async () => {
    await asUser(db, alice);
    const pin = await insertPin(db);
    await expect(db.query("update public.pins set title = 'x' where id = $1", [pin.id])).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.pins where id = $1", [pin.id])).rejects.toThrow(/permission denied/);
  });

  it("only lets the author delete a pin", async () => {
    await asUser(db, alice);
    const pin = await insertPin(db);
    await asUser(db, bob);
    await expect(action(pin.id, "delete")).rejects.toThrow(/Only the author/);
    await asUser(db, alice);
    await action(pin.id, "delete");
    await asAnon(db);
    expect(await rows(db, "select id from public.pins")).toEqual([]);
  });

  it("validates content on the server", async () => {
    await asUser(db, alice);
    await expect(insertPin(db, { title: "  x " })).rejects.toThrow(/check/);
    await expect(insertPin(db, { type: "alert", community_category: "home" })).rejects.toThrow(/pins_type_group/);
    await expect(insertPin(db, { payment: "paid" })).rejects.toThrow(/pins_paid_amount/);
    await expect(insertPin(db, { payment: "barter", exchange_details: "  " })).rejects.toThrow(/pins_exchange_terms/);
    await expect(insertPin(db, { type: "event", community_category: "culture" })).rejects.toThrow(/pins_event_times/);
    await expect(
      insertPin(db, { type: "event", community_category: "culture", starts_at: new Date(Date.now() + 2 * 864e5).toISOString(), ends_at: new Date(Date.now() + 864e5).toISOString() }),
    ).rejects.toThrow(/pins_event_times/);
    await expect(insertPin(db, { expires_at: "2000-01-01" })).rejects.toThrow(/future/);
    await expect(insertPin(db, { photo_path: "https://evil.example/x.webp" })).rejects.toThrow(/pins_photo_path/);
    await expect(insertPin(db, { photo_path: `${bob}/00000000-0000-4000-8000-000000000000.webp` })).rejects.toThrow(/pins_photo_path/);
    await expect(insertPin(db, { skills: Array(13).fill("x") })).rejects.toThrow(/check/);
    const ok = await insertPin(db, {
      payment: "paid",
      amount: 20,
      currency: "USD",
      photo_path: `${alice}/00000000-0000-4000-8000-000000000000.webp`,
    });
    expect(Number(ok.amount)).toBe(20);
  });

  it("never stores the exact point of an approximate pin", async () => {
    await asUser(db, alice);
    const exact = { lat: 37.31921234, lng: -122.04541234 };
    const blurred = [];
    for (let i = 0; i < 12; i++) blurred.push(await insertPin(db, { ...exact, approximate: true }));
    for (const pin of blurred) {
      expect(pin.lat).not.toBe(exact.lat);
      const metres = Math.hypot(
        (pin.lat - exact.lat) * 111320,
        (pin.lng - exact.lng) * 111320 * Math.cos((exact.lat * Math.PI) / 180),
      );
      expect(metres).toBeLessThan(600);
    }
    // Points are randomised inside the cell, not one predictable centre.
    expect(new Set(blurred.map((p) => p.lat)).size).toBeGreaterThan(1);
    await asAdmin(db);
    const stored = await rows(db, "select lat, lng from public.pins");
    expect(stored.some((p) => p.lat === exact.lat || p.lng === exact.lng)).toBe(false);
  });

  it("rate-limits pin creation", async () => {
    await asUser(db, bob);
    for (let i = 0; i < 15; i++) await insertPin(db);
    await expect(insertPin(db)).rejects.toThrow(/a lot of pins/);
  });
});

describe("claiming", () => {
  let pin;
  beforeEach(async () => {
    await asUser(db, alice);
    pin = await insertPin(db);
  });

  it("runs the full request lifecycle", async () => {
    await asUser(db, bob);
    let { rows: [p] } = await action(pin.id, "claim");
    expect(p).toMatchObject({ status: "claimed", claimant_id: bob });

    await asUser(db, alice);
    expect(await rows(db, "select helper_id, status from public.pin_claims")).toEqual([{ helper_id: bob, status: "offered" }]);
    ({ rows: [p] } = await action(pin.id, "accept"));
    expect(p.status).toBe("active");

    await asUser(db, bob);
    ({ rows: [p] } = await action(pin.id, "complete"));
    expect(p).toMatchObject({ status: "done", claimant_id: null });
    await asAnon(db);
    expect((await rows(db, "select helped_count from public.profiles where id = $1", [bob]))[0].helped_count).toBe(1);

    await asUser(db, alice);
    ({ rows: [p] } = await action(pin.id, "reopen"));
    expect(p.status).toBe("open");
  });

  it("stops a second person claiming the same request", async () => {
    await asUser(db, bob);
    await action(pin.id, "claim");
    await asUser(db, carol);
    await expect(action(pin.id, "claim")).rejects.toThrow(/already responded/);
    await asAdmin(db);
    // Even bypassing pin_action, the database refuses a second live claim.
    await expect(
      db.query("insert into public.pin_claims (pin_id, helper_id) values ($1, $2)", [pin.id, carol]),
    ).rejects.toThrow(/pin_claims_one_live/);
  });

  it("doesn't let authors claim their own pins or strangers act on claims", async () => {
    await expect(action(pin.id, "claim")).rejects.toThrow(/your own pin/);
    await asUser(db, bob);
    await action(pin.id, "claim");
    await asUser(db, carol);
    await expect(action(pin.id, "accept")).rejects.toThrow(/Only the author/);
    await expect(action(pin.id, "withdraw")).rejects.toThrow(/Only the helper/);
    await expect(action(pin.id, "complete")).rejects.toThrow(/can't complete/);
    await expect(rows(db, "select * from public.pin_claims")).resolves.toEqual([]);
    // The helper can't complete before the author accepts.
    await asUser(db, bob);
    await expect(action(pin.id, "complete")).rejects.toThrow(/can't complete/);
  });

  it("lets the helper withdraw and the author decline", async () => {
    await asUser(db, bob);
    await action(pin.id, "claim");
    let { rows: [p] } = await action(pin.id, "withdraw");
    expect(p).toMatchObject({ status: "open", claimant_id: null });
    await asUser(db, carol);
    await action(pin.id, "claim");
    await asUser(db, alice);
    ({ rows: [p] } = await action(pin.id, "decline"));
    expect(p.status).toBe("open");
    ({ rows: [p] } = await action(pin.id, "cancel"));
    expect(p.status).toBe("cancelled");
  });

  it("can't be called anonymously and can't claim events", async () => {
    await asAnon(db);
    await expect(action(pin.id, "claim")).rejects.toThrow(/permission denied/);
    await asUser(db, alice);
    const event = await insertPin(db, {
      type: "event",
      community_category: "culture",
      starts_at: new Date(Date.now() + 864e5).toISOString(),
      ends_at: new Date(Date.now() + 2 * 864e5).toISOString(),
    });
    await asUser(db, bob);
    await expect(action(event.id, "claim")).rejects.toThrow(/can't be claimed/);
  });

  it("respects blocks in both directions", async () => {
    await asUser(db, alice);
    await db.query("insert into public.blocked_users (blocked_id) values ($1)", [bob]);
    await asUser(db, bob);
    await expect(action(pin.id, "claim")).rejects.toThrow(/can't respond/);
    expect(await rows(db, "select * from public.blocked_users")).toEqual([]);
  });
});

describe("messages", () => {
  it("are private to the author and helper while the claim is live", async () => {
    await asUser(db, alice);
    const pin = await insertPin(db);
    await asUser(db, bob);
    await action(pin.id, "claim");
    const [claim] = await rows(db, "select id from public.pin_claims");
    await db.query("insert into public.messages (claim_id, body) values ($1, 'I can come at 5')", [claim.id]);
    await asUser(db, alice);
    await db.query("insert into public.messages (claim_id, body) values ($1, 'Great, thanks!')", [claim.id]);
    expect((await rows(db, "select body from public.messages order by created_at")).map((m) => m.body)).toEqual([
      "I can come at 5",
      "Great, thanks!",
    ]);
    await asUser(db, carol);
    expect(await rows(db, "select * from public.messages")).toEqual([]);
    await expect(
      db.query("insert into public.messages (claim_id, body) values ($1, 'hi')", [claim.id]),
    ).rejects.toThrow();
    await asUser(db, bob);
    await action(pin.id, "withdraw");
    await expect(
      db.query("insert into public.messages (claim_id, body) values ($1, 'still there?')", [claim.id]),
    ).rejects.toThrow(/closed/);
  });
});

describe("saves, confirmations and reports", () => {
  let pin;
  beforeEach(async () => {
    await asUser(db, alice);
    pin = await insertPin(db);
  });

  it("keep counters in step and lists private", async () => {
    await asUser(db, bob);
    await db.query("insert into public.saved_pins (pin_id) values ($1)", [pin.id]);
    await db.query("insert into public.pin_confirmations (pin_id) values ($1)", [pin.id]);
    await expect(
      db.query("insert into public.pin_confirmations (pin_id) values ($1)", [pin.id]),
    ).rejects.toThrow(/duplicate/);
    let [p] = await rows(db, "select saves, confirmations from public.pins");
    expect(p).toEqual({ saves: 1, confirmations: 1 });
    await db.query("delete from public.pin_confirmations where pin_id = $1", [pin.id]);
    [p] = await rows(db, "select saves, confirmations from public.pins");
    expect(p).toEqual({ saves: 1, confirmations: 0 });
    await asUser(db, carol);
    expect(await rows(db, "select * from public.saved_pins")).toEqual([]);
    await asUser(db, alice);
    await expect(
      db.query("insert into public.pin_confirmations (pin_id) values ($1)", [pin.id]),
    ).rejects.toThrow(/own pin/);
  });

  it("stores reports server-side, once per person, and hides heavily reported pins", async () => {
    await expect(
      db.query("insert into public.reports (pin_id, reason) values ($1, 'spam')", [pin.id]),
    ).rejects.toThrow(/own pin/);
    await asUser(db, bob);
    await db.query("insert into public.reports (pin_id, reason) values ($1, 'Looks like spam')", [pin.id]);
    await expect(
      db.query("insert into public.reports (pin_id, reason) values ($1, 'Again')", [pin.id]),
    ).rejects.toThrow(/duplicate/);
    expect(await rows(db, "select reporter_id, status from public.reports")).toEqual([{ reporter_id: bob, status: "open" }]);
    await expect(
      db.query("update public.reports set status = 'dismissed'"),
    ).resolves.toMatchObject({ affectedRows: 0 });

    await asUser(db, carol);
    await db.query("insert into public.reports (pin_id, reason) values ($1, 'Misleading')", [pin.id]);
    expect(await rows(db, "select reporter_id from public.reports")).toHaveLength(1);
    const dave = await createUser(db, "dave@example.com");
    await asUser(db, dave);
    await db.query("insert into public.reports (pin_id, reason) values ($1, 'Unsafe')", [pin.id]);
    expect(await rows(db, "select id from public.pins")).toEqual([]);
    await asUser(db, alice);
    expect(await rows(db, "select id from public.pins")).toHaveLength(1);
  });

  it("lets moderators review reports", async () => {
    await asUser(db, bob);
    await db.query("insert into public.reports (pin_id, reason) values ($1, 'Looks like spam')", [pin.id]);
    await asAdmin(db);
    await db.query("update public.profiles set is_moderator = true where id = $1", [carol]);
    await asUser(db, carol);
    expect(await rows(db, "select reason from public.reports")).toEqual([{ reason: "Looks like spam" }]);
    await db.query("update public.reports set status = 'dismissed', reviewed_by = $1, reviewed_at = now()", [carol]);
  });
});

describe("API surface", () => {
  it("exposes only pin_action as a callable function", async () => {
    await asAnon(db);
    await expect(db.query("select private.blur_location(1, 1)")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.verified_email_domains")).rejects.toThrow(/permission denied/);
    await expect(db.query("select deleted_at from public.pins")).rejects.toThrow(/permission denied/);
    await expect(db.query("select report_count from public.pins")).rejects.toThrow(/permission denied/);
  });
});

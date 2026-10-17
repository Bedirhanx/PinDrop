import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// Two real accounts using the real Supabase project: proves pins, links,
// claims, saves and reports are shared between different people.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!url || !anonKey || !serviceKey, "Needs Supabase keys in .env.local");
test.describe.configure({ mode: "serial" });

const admin = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
const run = Date.now().toString(36);
const people = {};
let pinUrl;
const title = `E2E desk move ${run}`;

// Creates a confirmed account and returns its browser session.
async function makePerson(name) {
  const email = `pindrop-e2e-${run}-${name}@example.com`;
  const password = `pw-${run}-${Math.random().toString(36).slice(2)}A1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `E2E ${name}` },
  });
  if (error) throw error;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  return { id: data.user.id, name: `E2E ${name}`, session: login.session };
}

// Opens a browser signed in as `person` (supabase-js reads its session from
// localStorage under sb-<project ref>-auth-token).
async function browserFor(browser, person) {
  const context = await browser.newContext({
    geolocation: { latitude: 37.3192, longitude: -122.0454 },
    permissions: ["geolocation"],
  });
  const ref = new URL(url).hostname.split(".")[0];
  await context.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [`sb-${ref}-auth-token`, JSON.stringify(person.session)],
  );
  return context.newPage();
}

test.beforeAll(async () => {
  people.alice = await makePerson("alice");
  people.bob = await makePerson("bob");
});

test.afterAll(async () => {
  for (const person of Object.values(people)) {
    if (person?.id) await admin.auth.admin.deleteUser(person.id);
  }
});

test("signed-in state persists across reloads", async ({ browser }) => {
  const page = await browserFor(browser, people.alice);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /My account/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /My account/ })).toBeVisible();
  await page.goto("/account");
  await expect(page.getByText("E2E alice", { exact: true }).first()).toBeVisible();
  await page.context().close();
});

test("Alice drops a pin and Bob sees it on another browser", async ({ browser }) => {
  const alice = await browserFor(browser, people.alice);
  await alice.goto("/");
  await alice.getByRole("button", { name: /Drop a pin/ }).click();
  await alice.getByPlaceholder("What could use a little help?").fill(title);
  await alice.getByRole("button", { name: /Continue/ }).click();
  await alice.getByRole("button", { name: /Choose location/ }).click();
  await alice.getByRole("button", { name: /Publish pin/ }).click();
  const similar = alice.getByRole("button", { name: "Post a separate pin" });
  if (await similar.isVisible({ timeout: 2000 }).catch(() => false)) await similar.click();
  await expect(alice).toHaveURL(/\/p\/[0-9a-f-]{36}$/);
  await expect(alice.locator("#pin-title")).toHaveText(title);
  pinUrl = alice.url();
  // The author can't claim their own request.
  await expect(alice.getByRole("button", { name: "I can help" })).toHaveCount(0);

  const bob = await browserFor(browser, people.bob);
  await bob.goto(pinUrl);
  await expect(bob.locator("#pin-title")).toHaveText(title);
  await bob.goto("/");
  await bob.getByLabel("Search opportunities in this area").fill(run);
  await expect(bob.locator(".feed-card", { hasText: title })).toBeVisible();
  await alice.context().close();
  await bob.context().close();
});

test("a signed-out visitor can open the shared link", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(pinUrl);
  await expect(page.locator("#pin-title")).toHaveText(title);
  const html = await (await page.request.get(pinUrl)).text();
  expect(html).toContain(`<meta property="og:title" content="${title}"`);
  await page.close();
});

test("Bob saves the pin and it stays saved after refresh", async ({ browser }) => {
  const bob = await browserFor(browser, people.bob);
  await bob.goto(pinUrl);
  await bob.getByRole("button", { name: "Save", exact: true }).click();
  await expect(bob.getByRole("button", { name: "Saved" })).toBeVisible();
  await bob.reload();
  await expect(bob.getByRole("button", { name: "Saved" })).toBeVisible();
  await bob.context().close();
});

test("Bob offers help, Alice accepts, they message, and Bob completes it", async ({ browser }) => {
  const bob = await browserFor(browser, people.bob);
  await bob.goto(pinUrl);
  await bob.getByRole("button", { name: "I can help" }).click();
  await expect(bob.getByText(/Waiting for E2E alice/)).toBeVisible();

  const alice = await browserFor(browser, people.alice);
  await alice.goto(pinUrl);
  await expect(alice.getByText(/E2E bob/).first()).toBeVisible();
  await alice.getByRole("button", { name: "Accept offer" }).click();
  await expect(alice.locator(".status-badge")).toHaveText("In progress");
  await alice.getByLabel("Write a message").fill("Thanks! Tomorrow at 5?");
  await alice.getByRole("button", { name: "Send message" }).click();

  await bob.reload();
  await expect(bob.getByText("Thanks! Tomorrow at 5?")).toBeVisible();
  await bob.getByRole("button", { name: "Mark as done" }).click();
  await expect(bob.locator(".status-badge")).toHaveText("Completed");

  await alice.reload();
  await expect(alice.locator(".status-badge")).toHaveText("Completed");
  await alice.context().close();
  await bob.context().close();
});

test("a second person can't claim a request that's already claimed", async () => {
  const pinId = pinUrl.split("/p/")[1];
  const asAlice = createClient(url, anonKey, { auth: { persistSession: false } });
  await asAlice.auth.setSession(people.alice.session);
  await asAlice.rpc("pin_action", { pin_id: pinId, action: "reopen" });
  const asBob = createClient(url, anonKey, { auth: { persistSession: false } });
  await asBob.auth.setSession(people.bob.session);
  const carol = await makePerson("carol");
  people.carol = carol;
  const asCarol = createClient(url, anonKey, { auth: { persistSession: false } });
  await asCarol.auth.setSession(carol.session);
  // Both claim at the same moment; exactly one wins.
  const results = await Promise.all([
    asBob.rpc("pin_action", { pin_id: pinId, action: "claim" }),
    asCarol.rpc("pin_action", { pin_id: pinId, action: "claim" }),
  ]);
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.filter((r) => r.error)).toHaveLength(1);
  // And nobody can edit or delete someone else's pin from DevTools.
  const edit = await asBob.from("pins").update({ title: "hacked" }).eq("id", pinId).select();
  expect(edit.error || edit.data.length === 0).toBeTruthy();
  const del = await asBob.rpc("pin_action", { pin_id: pinId, action: "delete" });
  expect(del.error?.message).toMatch(/Only the author/);
});

test("Bob reports and blocks; Alice deletes her pin", async ({ browser }) => {
  const bob = await browserFor(browser, people.bob);
  await bob.goto(pinUrl);
  await bob.getByRole("button", { name: "Report this pin" }).click();
  await bob.getByLabel("Report reason").fill("E2E test report");
  await bob.getByRole("button", { name: "Submit report" }).click();
  await expect(bob.getByText(/Report sent/)).toBeVisible();
  await bob.getByRole("button", { name: "Report this pin" }).click();
  await bob.getByLabel("Report reason").fill("Again");
  await bob.getByRole("button", { name: "Submit report" }).click();
  await expect(bob.getByText(/already reported/)).toBeVisible();
  await bob.keyboard.press("Escape");

  await bob.getByRole("button", { name: "Block E2E alice" }).click();
  await bob.getByRole("button", { name: "Block", exact: true }).click();
  await expect(bob.getByText(/blocked on all your devices/)).toBeVisible();
  await bob.goto("/settings");
  await expect(bob.getByText("E2E alice")).toBeVisible();
  await bob.getByRole("button", { name: "Unblock" }).click();
  await bob.context().close();

  const alice = await browserFor(browser, people.alice);
  await alice.goto(pinUrl);
  await alice.getByRole("button", { name: /Delete my pin/ }).click();
  await alice.getByRole("button", { name: "Delete pin" }).click();
  await expect(alice).toHaveURL(/\/$/);
  await alice.goto(pinUrl);
  await expect(alice.getByText("This pin isn’t on the map anymore.")).toBeVisible();
  await alice.context().close();
});

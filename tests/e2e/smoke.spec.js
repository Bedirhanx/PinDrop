import { expect, test } from "@playwright/test";

// Core flows that work with or without the community server.

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.errorsSeen = errors;
});

test.afterEach(async ({ page }) => {
  // A page that deliberately answers 404 logs that response; nothing else may.
  const errors = page.errorsSeen.filter(
    (text) => !(page.expects404 && /status of 404/.test(text)),
  );
  expect(errors, "console errors").toEqual([]);
});

test("map loads with pins and the feed", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".feed-card").first()).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".map-loading")).toHaveCount(0);
});

test("opens a pin, shares its link, and survives back, forward and refresh", async ({ page, browser }) => {
  await page.goto("/");
  await page.locator(".feed-card").first().click();
  await expect(page).toHaveURL(/\/p\/sample-/);
  const title = await page.locator("#pin-title").textContent();
  await page.goBack();
  await expect(page.locator("#pin-title")).toHaveCount(0);
  await page.goForward();
  await expect(page.locator("#pin-title")).toHaveText(title);
  await page.reload();
  await expect(page.locator("#pin-title")).toHaveText(title);

  // A different browser opens the same link.
  const other = await browser.newPage();
  await other.goto(page.url());
  await expect(other.locator("#pin-title")).toHaveText(title);
  await other.close();
});

test("unknown and malformed pin links show not-found", async ({ page, request }) => {
  page.expects404 = true;
  expect((await request.get("/p/not-a-real-id")).status()).toBe(404);
  await page.goto("/p/8f6c2a6e-6d9c-4a54-9a4a-0b6a7f4c1d11");
  await expect(page.getByText("This pin isn’t on the map anymore.")).toBeVisible();
});

test("search and filters narrow the list", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".feed-card").first()).toBeVisible();
  const all = await page.locator(".feed-card").count();
  await page.getByLabel("Search opportunities in this area").fill("garden");
  await expect.poll(() => page.locator(".feed-card").count()).toBeLessThan(all);
  await page.getByLabel("Search opportunities in this area").fill("");
  await page.locator(".map-filters").getByRole("button", { name: "Events" }).click();
  await expect(page.locator(".feed-card").first()).toContainText("Event");
});

test("walking directions preview a route", async ({ page }) => {
  await page.goto("/p/sample-campus-0");
  await page.getByRole("button", { name: /Navigate here/ }).click();
  await expect(page.locator(".route-summary")).toContainText(/min|Route unavailable/);
});

test("settings persist after refresh", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("public pages render", async ({ page }) => {
  for (const [path, heading] of [
    ["/about", /pin away/],
    ["/solution", /hard to find/],
    ["/contact", /hear from you/],
    ["/signin", /Welcome back/],
    ["/signup", /Join your neighbors/],
  ]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toContainText(heading);
  }
});

test("filter chips show what's active and clear all resets the results", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".feed-card").first()).toBeVisible();
  // Wait until pins from the server have arrived (cached and sample pins show
  // first), so the numbers below don't change mid-test.
  await expect(page.locator(".map-status")).toHaveText(/Live community map|Preview/);
  const count = () => page.locator("#pin-results b").textContent().then(Number);
  // The count always matches the cards on screen.
  const matches = async () => (await count()) === (await page.locator(".feed-card").count());
  await expect.poll(matches).toBe(true);
  const all = await count();

  await page.locator(".map-filters").getByRole("button", { name: "Events" }).click();
  await expect(page.getByRole("button", { name: "Remove filter: Events" })).toBeVisible();
  await expect.poll(matches).toBe(true);
  expect(await count()).toBeLessThan(all);

  // A search with no matches explains why and offers a reset.
  await page.getByLabel("Search opportunities in this area").fill("zzzz-no-such-pin");
  await expect(page.getByText("No pins match your filters.")).toBeVisible();
  await expect(page.locator("#pin-results b")).toHaveText("0");
  await page.locator(".empty").getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByLabel("Search opportunities in this area")).toHaveValue("");
  await expect(page.locator(".active-filters")).toHaveCount(0);
  expect(await count()).toBe(all);

  // Removing a single chip only clears that filter.
  await page.locator(".map-filters").getByRole("button", { name: "Events" }).click();
  await page.getByLabel("Search opportunities in this area").fill("garden");
  await page.getByRole("button", { name: /Remove filter: “garden”/ }).click();
  await expect(page.getByLabel("Search opportunities in this area")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Remove filter: Events" })).toBeVisible();
  await page.locator(".active-filters").getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator(".active-filters")).toHaveCount(0);
});

test("feed cards show type, distance and sample label, and clamp descriptions", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".feed-card").first();
  await expect(card.locator(".type-chip")).toBeVisible();
  await expect(card.locator(".card-distance")).toHaveText(/\d+(\.\d)? (m|km)/);
  await expect(card.locator(".sample-label")).toBeVisible();
  const clamp = await card.locator("p").evaluate((el) => getComputedStyle(el).webkitLineClamp);
  expect(clamp).toBe("2");
  // The detail view shows the full description.
  await card.click();
  const full = await page.locator(".detail-description").evaluate((el) => getComputedStyle(el).webkitLineClamp);
  expect(full).toBe("none");
});

test("reduced motion turns animations off and shows content immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const card = page.locator(".feed-card").first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.goto("/about");
  // Below-the-fold sections are fully visible without scrolling them in.
  const step = page.locator(".steps li").first();
  expect(await step.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});

test("phone forms don't trigger iPhone zoom and the pages scroll", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone-only behaviour");
  for (const path of ["/signin", "/signup", "/contact"]) {
    await page.goto(path);
    const sizes = await page
      .locator("input:not([type=checkbox]), textarea, select")
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(sizes.length).toBeGreaterThan(0);
    // iOS Safari zooms the page when a field under 16px gets focus.
    expect(Math.min(...sizes), `${path} field font size`).toBeGreaterThanOrEqual(16);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  }
});

test("the question box offers the helper when it's set up, otherwise Contact", async ({ page }) => {
  await page.goto("/solution");
  const box = page.locator(".ask-helper");
  await box.scrollIntoViewIfNeeded();
  const available = await page.request.get("/api/chat").then((r) => r.json()).then((d) => d.available);
  if (!available) {
    await expect(box.getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/contact");
  }

  // With the helper switched on, the button opens the chat panel.
  await page.route("**/api/chat", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { available: true } }) : route.continue(),
  );
  await page.reload();
  await page.locator(".ask-helper").scrollIntoViewIfNeeded();
  await page.locator(".ask-helper").getByRole("button", { name: "Ask the helper" }).click();
  await expect(page.getByRole("dialog", { name: "PinDrop helper" })).toBeVisible();
  await expect(page.locator("#chat-input")).toBeFocused();
});

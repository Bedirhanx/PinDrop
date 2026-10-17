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
    ["/contact", /hear from you/],
    ["/signin", /Welcome back/],
    ["/signup", /Join your neighbors/],
  ]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toContainText(heading);
  }
});

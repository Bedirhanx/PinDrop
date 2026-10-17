import { expect, test } from "@playwright/test";

// Regression: when the map failed, the "Loading" indicator and the error used
// to show at the same time, with no way to recover. These tests break the map
// on purpose and check the fallback, the list, and Retry.

// Records whether the loading indicator and the error were ever on screen
// together, and lets a test switch WebGL off.
async function instrument(page, { blockWebGL = false } = {}) {
  await page.addInitScript((block) => {
    window.__blockWebGL = block;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (window.__blockWebGL && /webgl/.test(type)) return null;
      return getContext.call(this, type, ...rest);
    };
    window.__bothShown = false;
    new MutationObserver(() => {
      if (document.querySelector(".map-loading") && document.querySelector(".map-failed")) {
        window.__bothShown = true;
      }
    }).observe(document, { childList: true, subtree: true });
  }, blockWebGL);
}

const worker = "**/vendor/maplibre-gl-worker.mjs*";

test("a map that can't load shows one error with Retry, and recovers", async ({ page }) => {
  await instrument(page);
  await page.route(worker, (route) => route.abort());
  await page.goto("/");

  const failure = page.locator(".map-failed");
  await expect(failure).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".map-loading")).toHaveCount(0);
  await expect(failure.getByRole("button", { name: "Retry" })).toBeVisible();

  // The list, search, filters and pin details keep working without the map.
  await expect(page.locator(".feed-card").first()).toBeVisible();
  await page.locator(".map-filters").getByRole("button", { name: "Events" }).click();
  await page.getByLabel("Search opportunities in this area").fill("cleanup");
  await expect(page.getByRole("button", { name: /Remove filter: Events/ })).toBeVisible();
  const results = await page.locator(".feed-card").count();
  expect(results).toBeGreaterThan(0);
  await page.locator(".feed-card").first().click();
  await expect(page.locator("#pin-title")).toBeVisible();

  // "Browse list" returns to the results and focuses them.
  await failure.getByRole("button", { name: "Browse list" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#pin-results")).toBeFocused();

  // Retry once the worker is reachable again: the page reloads to get fresh
  // map workers, the map loads, and the filters and search are kept.
  expect(await page.evaluate(() => window.__bothShown)).toBe(false);

  // On phones the list now covers the map, so retry from the list notice.
  await page.unroute(worker);
  await expect(page.locator(".map-unavailable")).toBeVisible();
  await page.locator(".map-unavailable").getByRole("button", { name: "Retry map" }).click();
  await expect(page.locator(".map-loading")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".map-failed")).toHaveCount(0);
  await expect(page.locator(".map-unavailable")).toHaveCount(0);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: /Remove filter: Events/ })).toBeVisible();
  await expect(page.getByLabel("Search opportunities in this area")).toHaveValue("cleanup");
  await expect(page.locator(".feed-card")).toHaveCount(results);

  expect(await page.evaluate(() => window.__bothShown)).toBe(false);
});

test("without WebGL the map fails cleanly and Retry recovers", async ({ page }) => {
  await instrument(page, { blockWebGL: true });
  await page.goto("/");
  await expect(page.locator(".map-failed")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".map-loading")).toHaveCount(0);
  await expect(page.locator(".feed-card").first()).toBeVisible();

  await page.evaluate(() => (window.__blockWebGL = false));
  await page.locator(".map-failed").getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".map-loading")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".map-failed")).toHaveCount(0);
  await expect(page.locator(".map-unavailable")).toHaveCount(0);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  expect(await page.evaluate(() => window.__bothShown)).toBe(false);
});

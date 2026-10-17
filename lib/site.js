// The public address of the site, used for absolute links in share previews.
export function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000";
  return new URL(configured);
}

export const SITE_NAME = "PinDrop";
export const SITE_DESCRIPTION =
  "A community map for small acts of help: see what neighbors need and offer, lend a hand, and share local resources.";

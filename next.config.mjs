/** @type {import('next').NextConfig} */

// Hosts the browser may talk to, for the Content Security Policy.
function origin(url) {
  try {
    return url ? new URL(url.replace(/\{[^}]+\}/g, "x")).origin : "";
  } catch {
    return "";
  }
}

const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseWs = supabase.replace(/^http/, "ws");
const tiles = origin(process.env.NEXT_PUBLIC_MAP_TILE_URL) || "https://tile.openstreetmap.org";
const routing = [
  process.env.NEXT_PUBLIC_ROUTING_WALKING_URL || "https://routing.openstreetmap.de",
  process.env.NEXT_PUBLIC_ROUTING_CYCLING_URL || "https://routing.openstreetmap.de",
  process.env.NEXT_PUBLIC_ROUTING_DRIVING_URL || "https://router.project-osrm.org",
].map(origin);

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrapping scripts.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${tiles} ${supabase}`,
  "font-src 'self'",
  `connect-src 'self' ${supabase} ${supabaseWs} ${tiles} ${[...new Set(routing)].join(" ")}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
    ];
    // Dev mode needs eval for fast refresh, so the CSP applies to builds only.
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: csp });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;

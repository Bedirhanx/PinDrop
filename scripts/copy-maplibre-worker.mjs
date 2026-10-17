// Copies MapLibre's web worker into public/ so the browser can load it.
// MapLibre 6 looks for the worker next to its own bundle, which no longer
// exists once Next.js bundles the library, so MapView points it here instead.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const target = new URL("../public/vendor/", import.meta.url);

mkdirSync(target, { recursive: true });
copyFileSync(join(dist, "maplibre-gl-worker.mjs"), new URL("maplibre-gl-worker.mjs", target));

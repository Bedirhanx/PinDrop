import "server-only";
// Reads a public pin on the server (for share previews). Uses the public
// REST API with the publishable key, so Row Level Security applies exactly as
// it does in the browser: deleted and hidden pins are never returned.
import { isUuid } from "./rows";
import { sampleById } from "./samples";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Only what a share preview needs. Coordinates are deliberately left out.
const PREVIEW_COLUMNS = "id,type,category,title,description,place_label,approximate,status";

// Returns { pin } when found, { missing: true } when the pin definitely doesn't
// exist, or {} when it couldn't be checked (server unavailable).
export async function getSharedPin(id) {
  const sample = sampleById(id);
  if (sample) {
    return {
      pin: {
        id: sample.id,
        type: sample.type,
        category: sample.category,
        title: sample.title,
        description: sample.description,
        placeLabel: sample.placeLabel,
        sample: true,
      },
    };
  }
  if (!isUuid(id)) return { missing: true };
  if (!url || !key) return {};
  try {
    const response = await fetch(
      `${url}/rest/v1/pins?id=eq.${id}&select=${PREVIEW_COLUMNS}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) return {};
    const [row] = await response.json();
    if (!row) return { missing: true };
    return {
      pin: {
        id: row.id,
        type: row.type,
        category: row.category,
        title: row.title,
        description: row.description,
        placeLabel: row.approximate ? null : row.place_label,
        approximate: row.approximate,
      },
    };
  } catch {
    return {};
  }
}

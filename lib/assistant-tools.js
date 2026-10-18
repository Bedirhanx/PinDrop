import "server-only";
// Tools PinDrop AI can use: search live pins, and check a draft pin. Both are
// read-only: the AI never creates anything. A draft only pre-fills the "Drop a
// pin" form, which the person reviews, places and publishes themselves.
import {
  COMMUNITY_CATEGORIES,
  PAYMENT_LABELS,
  TYPE_CATEGORY_GROUPS,
  URGENCY_LABELS,
} from "./constants";
import { effectiveStatus, matchesSearch, typeLabel, validateDraft } from "./pins";
import { allSamples } from "./samples";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TYPES = ["requesting", "offering", "event", "place", "alert"];

// Which categories each pin type may use, for the AI's instructions.
export const CATEGORY_GUIDE = TYPES.map((type) => {
  const groups = TYPE_CATEGORY_GROUPS[type]
    .map((id) => COMMUNITY_CATEGORIES.find((g) => g.id === id))
    .map((g) => `  - ${g.id} (${g.label}): ${g.items.join("; ")}`);
  return `${type}:\n${groups.join("\n")}`;
}).join("\n");

export const TOOL_DECLARATIONS = [
  {
    name: "search_pins",
    description:
      "Search PinDrop's live pins (requests, offers, events, places, alerts) by keywords. Use whenever the person wants to find, browse or check for something on the map.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A few keywords, e.g. 'calculus tutoring' or 'free food'." },
        type: { type: "string", enum: TYPES, description: "Only this kind of pin, if the person said so." },
      },
      required: ["query"],
    },
  },
  {
    name: "draft_pin",
    description:
      "Prepare a pin for the person to review and post. Use when they want to ask for help, offer something, announce an event, share a place or post an alert. Does not publish anything.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: TYPES },
        community_category: { type: "string", description: "A category group id allowed for this type." },
        category: { type: "string", description: "One item from that group, copied exactly." },
        title: { type: "string", description: "Clear title, 3–80 characters." },
        description: { type: "string", description: "Helpful details, under 1000 characters, no addresses or phone numbers." },
        urgency: { type: "string", enum: Object.keys(URGENCY_LABELS) },
        payment: { type: "string", enum: Object.keys(PAYMENT_LABELS) },
      },
      required: ["type", "community_category", "category", "title"],
    },
  },
];

// Keywords safe to put in a PostgREST filter.
function keywords(query) {
  return String(query || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, 4);
}

function summarize(pin) {
  return {
    id: pin.id,
    title: pin.title,
    type: typeLabel(pin.type),
    category: pin.category,
    // Never the coordinates: approximate pins stay approximate.
    place: pin.approximate ? "Approximate area" : pin.placeLabel || null,
    status: pin.status,
    sample: !!pin.sample,
  };
}

export async function searchPins({ query, type }) {
  const words = keywords(query);
  const results = [];
  if (url && key && words.length) {
    const fields = ["title", "description", "category"];
    const or = words.flatMap((w) => fields.map((f) => `${f}.ilike.*${w}*`)).join(",");
    const params = new URLSearchParams({
      select: "id,type,category,title,description,place_label,approximate,status,expires_at,ends_at,created_at",
      or: `(${or})`,
      status: "in.(open,claimed,active)",
      order: "created_at.desc",
      limit: "20",
    });
    if (TYPES.includes(type)) params.set("type", `eq.${type}`);
    try {
      const response = await fetch(`${url}/rest/v1/pins?${params}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (response.ok) {
        for (const row of await response.json()) {
          const pin = {
            ...row,
            placeLabel: row.place_label,
            expiresAt: row.expires_at,
            endsAt: row.ends_at,
          };
          if (effectiveStatus(pin) !== "archived") results.push(summarize(pin));
        }
      }
    } catch {}
  }
  // Fictional sample pins, clearly marked, so the map isn't empty at launch.
  // Only the campus samples: the Bay Area ones repeat the same listings.
  const samples = allSamples()
    .filter(
      (pin) =>
        /^sample-(campus|deanza)-/.test(pin.id) &&
        (!type || pin.type === type) &&
        words.some((w) => matchesSearch(pin, w)),
    )
    .slice(0, Math.max(0, 6 - results.length))
    .map(summarize);
  return [...results.slice(0, 6), ...samples];
}

// Checks a draft against PinDrop's own rules. Returns the cleaned draft in
// the shape the "Drop a pin" form uses, or the problems to fix.
export function checkDraft(args) {
  const draft = {
    type: args.type,
    communityCategory: args.community_category,
    category: args.category,
    title: String(args.title || "").trim().slice(0, 80),
    description: String(args.description || "").trim().slice(0, 1000),
    urgency: URGENCY_LABELS[args.urgency] ? args.urgency : "flexible",
    payment: PAYMENT_LABELS[args.payment] ? args.payment : "free",
  };
  const errors = { ...validateDraft(draft) };
  if (!TYPES.includes(draft.type)) errors.type = `Use one of: ${TYPES.join(", ")}`;
  if (!TYPE_CATEGORY_GROUPS[draft.type]?.includes(draft.communityCategory)) {
    errors.community_category = "Choose a category group allowed for this type";
  }
  // Paid, barter and event details need fields the form collects; start free.
  delete errors.amount;
  delete errors.exchangeDetails;
  delete errors.endsAt;
  if (draft.payment !== "free" && draft.payment !== "tip") draft.payment = "free";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, draft };
}


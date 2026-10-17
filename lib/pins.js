// Pin rules and helpers: categories, validation, actions, distance and ranking.
import {
  CATEGORY_COLORS,
  COMMUNITY_CATEGORIES,
  LEGACY_CATEGORY_GROUPS,
  LEGACY_TYPE_CATEGORIES,
  PIN_TYPES,
  TYPE_CATEGORY_GROUPS,
} from "./constants";

const DAY = 864e5;

// ---- Categories & types ----------------------------------------------------

export function categoryGroupFor(category) {
  return (
    COMMUNITY_CATEGORIES.find((group) => group.items.includes(category)) ||
    COMMUNITY_CATEGORIES.find(
      (group) => group.id === LEGACY_CATEGORY_GROUPS[category],
    )
  );
}

export function pinGroupId(pin) {
  return pin.communityCategory || categoryGroupFor(pin.category)?.id;
}

export function typeLabel(type) {
  if (type === "help") return "Requesting";
  if (type === "nature") return "Nature spot";
  return PIN_TYPES.find((t) => t.id === type)?.label || type;
}

export function isRequest(type) {
  return type === "help" || type === "requesting";
}

export function isPlace(type) {
  return type === "nature" || type === "place";
}

export function groupsForType(type) {
  const ids = TYPE_CATEGORY_GROUPS[type === "help" ? "requesting" : type];
  return ids
    ? ids.map((id) => COMMUNITY_CATEGORIES.find((group) => group.id === id))
    : [...COMMUNITY_CATEGORIES];
}

export function pinColor(pin) {
  return CATEGORY_COLORS[pinGroupId(pin)] || "#b6a0f5";
}

export function tagStyle(pin) {
  const color = pinColor(pin);
  return {
    backgroundColor: color + "26",
    border: "1px solid " + color + "80",
    color: "var(--ink)",
  };
}

// Name of the map image used for this pin's category symbol.
export function pinIconKey(pin) {
  return `pd-${pinGroupId(pin) || "other"}-${pinColor(pin).slice(1)}`;
}

export function suggestProfession(category, group) {
  const text = category.toLowerCase();
  if (text.includes("electri")) return "electrician";
  if (text.includes("plumb")) return "plumber";
  if (/garden|lawn|plant|snow|compost|tree/.test(text)) return "gardener";
  if (/clean/.test(text)) return "cleaner";
  if (/coding|tech support/.test(text)) return "developer";
  if (/tutor|lesson|study/.test(text)) return "tutor";
  if (/design|writing|photograph|resume/.test(text)) return "creative";
  if (/child|elder|caregiver|appointment/.test(text) || group === "care") {
    return "caregiver";
  }
  if (group === "animals" || /dog|pet/.test(text)) return "petcare";
  if (/ride|moving|truck|delivery|vehicle|carpool/.test(text)) return "driver";
  if (/translat|interpret|guide/.test(text) || group === "newcomers") {
    return "translator";
  }
  if (/food|meal|cook|produce|fridge/.test(text) || group === "food") {
    return "cook";
  }
  if (group === "wellness") return "wellness";
  if (group === "culture" || text.includes("event")) return "community";
  if (group === "home") return "handyman";
  return "general";
}

// Adds tags without duplicates (case-insensitive), up to `limit` tags.
export function mergeTags(current, additions, limit) {
  const result = [...current];
  for (const raw of additions) {
    const tag = raw.trim();
    if (
      !tag ||
      tag.length > 60 ||
      result.some((t) => t.toLocaleLowerCase() === tag.toLocaleLowerCase())
    ) {
      continue;
    }
    if (result.length >= limit) break;
    result.push(tag);
  }
  return result;
}

// ---- Drafts ----------------------------------------------------------------

// Size of the grid cell an approximate location is blurred within.
export const APPROXIMATE_CELL_METRES = 400;

// Moves a point to a random spot inside its ~400 m grid cell. Matches
// private.blur_location in the database, which applies it again on the server.
// Snapping first means several pins posted from one home average out to the
// cell, not the home; the random offset hides where in the cell it is.
export function blurLocation(point, random = Math.random) {
  const latStep = APPROXIMATE_CELL_METRES / 111320;
  const latCell = Math.floor(point.lat / latStep);
  const lngStep =
    APPROXIMATE_CELL_METRES /
    (111320 * Math.max(0.1, Math.cos(((latCell + 0.5) * latStep * Math.PI) / 180)));
  return {
    lat: (latCell + 0.15 + 0.7 * random()) * latStep,
    lng: (Math.floor(point.lng / lngStep) + 0.15 + 0.7 * random()) * lngStep,
  };
}

// Sensitive categories default to an approximate location.
export const PRIVATE_BY_DEFAULT = ["home", "care", "wellness"];

// Returns { field: message } for anything wrong with a new pin.
export function validateDraft(draft) {
  const errors = {};
  const title = (draft.title || "").trim();
  if (title.length < 3) errors.title = "Use at least 3 characters";
  else if (title.length > 80) errors.title = "Keep the title to 80 characters";

  const categoryOk =
    draft.type === "help" || draft.type === "nature"
      ? LEGACY_TYPE_CATEGORIES[draft.type].includes(draft.category)
      : (draft.type === "event" &&
          LEGACY_TYPE_CATEGORIES.event.includes(draft.category)) ||
        categoryGroupFor(draft.category);
  if (
    !categoryOk ||
    (draft.communityCategory &&
      categoryGroupFor(draft.category)?.id !== draft.communityCategory)
  ) {
    errors.category = "Choose a category for this pin type";
  }

  if (
    (draft.availabilityStart && !draft.availabilityEnd) ||
    (!draft.availabilityStart && draft.availabilityEnd) ||
    (draft.availabilityStart &&
      draft.availabilityEnd &&
      draft.availabilityEnd < draft.availabilityStart)
  ) {
    errors.availabilityEnd = "Choose an end date on or after the start date";
  }
  if (draft.expiresAt && !Number.isFinite(Date.parse(draft.expiresAt))) {
    errors.expiresAt = "Choose a valid expiry time";
  }
  if (draft.payment === "paid" && !(draft.amount > 0)) {
    errors.amount = "Enter the offered or requested price";
  }
  if (
    (draft.payment === "barter" || draft.payment === "timeCredit") &&
    !(draft.exchangeDetails || "").trim()
  ) {
    errors.exchangeDetails = "Describe the exchange terms";
  }
  if (
    draft.type === "event" &&
    (!draft.startsAt ||
      !draft.endsAt ||
      !Number.isFinite(Date.parse(draft.startsAt)) ||
      !Number.isFinite(Date.parse(draft.endsAt)) ||
      Date.parse(draft.endsAt) <= Date.parse(draft.startsAt))
  ) {
    errors.endsAt = "An event needs an end time after its start";
  }
  return errors;
}

// Cleans up a valid draft: trims text, applies privacy and default expiry.
export function normalizeDraft(input, now = Date.now()) {
  const draft = { ...input };
  for (const key of [
    "title",
    "description",
    "placeLabel",
    "exchangeDetails",
    "hours",
    "contactNote",
  ]) {
    if (typeof draft[key] === "string") draft[key] = draft[key].trim();
    if (draft[key] === "") delete draft[key];
  }
  draft.description = draft.description || "";
  if (draft.payment !== "paid") {
    delete draft.amount;
    delete draft.currency;
  }
  if (draft.payment !== "barter" && draft.payment !== "timeCredit") {
    delete draft.exchangeDetails;
  }
  if (draft.type !== "event") {
    delete draft.startsAt;
    delete draft.endsAt;
  }
  if (draft.approximate) Object.assign(draft, blurLocation(draft));
  if (draft.startsAt) draft.startsAt = new Date(draft.startsAt).toISOString();
  if (draft.endsAt) draft.endsAt = new Date(draft.endsAt).toISOString();
  if (draft.expiresAt) {
    draft.expiresAt = new Date(draft.expiresAt).toISOString();
  } else if (draft.type === "alert") {
    draft.expiresAt = new Date(now + DAY).toISOString();
  } else if (isRequest(draft.type)) {
    draft.expiresAt = new Date(now + 7 * DAY).toISOString();
  }
  // A custom availability range keeps the pin visible through its last day.
  if (!input.expiresAt && draft.availabilityEnd && draft.expiresAt) {
    const lastDay = new Date(draft.availabilityEnd + "T23:59:59").toISOString();
    if (lastDay > draft.expiresAt) draft.expiresAt = lastDay;
  }
  return draft;
}

// ---- Status & actions ------------------------------------------------------

// Pins people can respond to with "I can help" / "I'm interested".
export function isClaimable(type) {
  return isRequest(type) || type === "offering";
}

// The status to show: open pins past their expiry (or event end) are archived.
export function effectiveStatus(pin, now = Date.now()) {
  if (pin.status === "done" || pin.status === "cancelled") return pin.status;
  if (
    (pin.expiresAt && Date.parse(pin.expiresAt) <= now) ||
    (pin.type === "event" && pin.endsAt && Date.parse(pin.endsAt) <= now)
  ) {
    return "archived";
  }
  return pin.status;
}

export const STATUS_LABELS = {
  open: "Open",
  claimed: "Offer pending",
  active: "In progress",
  done: "Completed",
  cancelled: "Cancelled",
  archived: "Expired",
};

// What the given user may do with a pin. Mirrors public.pin_action in the
// database, which has the final say.
export function allowedActions(pin, userId, now = Date.now()) {
  if (!userId || pin.sample || pin.deletedAt) return [];
  const status = effectiveStatus(pin, now);
  const expired = status === "archived";
  const author = pin.authorId === userId;
  const helper = !!pin.claimantId && pin.claimantId === userId;
  const live = pin.status === "claimed" || pin.status === "active";
  const actions = [];
  if (isClaimable(pin.type)) {
    if (!author && pin.status === "open" && !expired) actions.push("claim");
    if (helper && live) actions.push("withdraw");
    if (author && pin.status === "claimed") actions.push("accept");
    if (author && live) actions.push("decline");
    if ((author && live) || (helper && pin.status === "active")) actions.push("complete");
    if (author && (pin.status === "open" || live) && !expired) actions.push("cancel");
  }
  if (author && (pin.status === "done" || pin.status === "cancelled") && !expired) {
    actions.push("reopen");
  }
  if (author) actions.push("delete");
  return actions;
}

// ---- Geography -------------------------------------------------------------

// Distance in metres between two { lat, lng } points.
export function distance(a, b) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371e3 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// bbox is [west, south, east, north].
export function inBbox(point, bbox) {
  return (
    point.lat >= bbox[1] &&
    point.lat <= bbox[3] &&
    (bbox[0] <= bbox[2]
      ? point.lng >= bbox[0] && point.lng <= bbox[2]
      : point.lng >= bbox[0] || point.lng <= bbox[2])
  );
}

export function formatDistance(metres) {
  return metres < 1e3
    ? `${Math.round(metres)} m`
    : `${(metres / 1e3).toFixed(1)} km`;
}

// Ranks pins by closeness, freshness, confirmations and open requests.
export function rankScore(pin, center, now = Date.now()) {
  return (
    0.45 * Math.exp(-distance(pin, center) / 800) +
    0.25 *
      Math.exp(-Math.max(0, (now - Date.parse(pin.createdAt)) / 36e5) / 72) +
    0.15 * Math.log1p(pin.confirmations) +
    0.15 * Number(isRequest(pin.type) && pin.status === "open")
  );
}

function normalizeText(text) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function matchesSearch(pin, query) {
  const haystack = normalizeText(
    [
      pin.title,
      pin.description,
      pin.category,
      pin.placeLabel,
      pin.authorName,
      pin.authorProfession,
      categoryGroupFor(pin.category)?.label,
      ...(pin.skills || []),
      ...(pin.authorSkills || []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  return normalizeText(query.trim())
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

// ---- Photos ----------------------------------------------------------------

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"];
export const MAX_PHOTO_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// Resizes a photo to at most 1600 px and re-encodes it as WebP, which also
// drops metadata such as GPS position. Returns { blob, previewUrl }.
export async function preparePhoto(file) {
  if (!PHOTO_TYPES.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP or HEIC photo.");
  }
  if (file.size > MAX_PHOTO_INPUT_BYTES) {
    throw new Error("Choose a photo smaller than 15 MB.");
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This photo couldn’t be read. Try a JPEG or PNG.");
  }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob;
    for (const quality of [0.8, 0.65, 0.5]) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") {
        throw new Error("This browser can’t prepare photos. Try another browser.");
      }
      if (blob.size <= MAX_PHOTO_BYTES) {
        return { blob, previewUrl: URL.createObjectURL(blob) };
      }
    }
    throw new Error("This photo is too large after resizing. Choose a smaller image.");
  } finally {
    bitmap.close();
  }
}

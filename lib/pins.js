// Pin rules and helpers: categories, validation, actions, distance and ranking.
import {
  CAMPUS,
  CATEGORY_COLORS,
  COMMUNITY_CATEGORIES,
  LEGACY_CATEGORY_GROUPS,
  LEGACY_TYPE_CATEGORIES,
  MIN_LISTING_ZOOM,
  NEIGHBORHOODS,
  PIN_TYPES,
  SAMPLE_LISTINGS,
  TYPE_CATEGORY_GROUPS,
} from "./constants";

const DAY = 864e5;

export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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

// Snaps a point to the centre of a ~50 m grid cell.
function approximate(point) {
  const latStep = 0.0004491555874955084;
  const lngStep =
    50 / (111320 * Math.max(0.1, Math.cos((point.lat * Math.PI) / 180)));
  return {
    lat: (Math.floor(point.lat / latStep) + 0.5) * latStep,
    lng: (Math.floor(point.lng / lngStep) + 0.5) * lngStep,
  };
}

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
  if (draft.approximate) Object.assign(draft, approximate(draft));
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

export function effectiveStatus(pin, now = Date.now()) {
  if (pin.status === "hidden" || pin.status === "done") return pin.status;
  if (
    (pin.expiresAt && Date.parse(pin.expiresAt) <= now) ||
    (pin.type === "event" && pin.endsAt && Date.parse(pin.endsAt) <= now)
  ) {
    return "archived";
  }
  return pin.status;
}

export function allowedActions(pin, userId) {
  if (pin.deletedAt) return [];
  if (effectiveStatus(pin) !== pin.status) {
    return pin.authorId === userId ? ["delete"] : [];
  }
  const actions = [];
  if (isRequest(pin.type)) {
    if (pin.status === "open") actions.push("claim");
    if (pin.status === "claimed" && pin.claimantId === userId) {
      actions.push("release", "complete");
    }
    if (pin.status === "done" && pin.authorId === userId) {
      actions.push("reopen");
    }
  }
  if (pin.authorId === userId) actions.push("delete");
  return actions;
}

export function applyAction(pin, action, userId, now = new Date().toISOString()) {
  if (!allowedActions(pin, userId).includes(action)) {
    throw new Error("You cannot perform this action on this pin.");
  }
  const next = { ...pin, version: pin.version + 1, updatedAt: now };
  if (action === "claim") {
    next.status = "claimed";
    next.claimantId = userId;
  }
  if (action === "release" || action === "reopen") {
    next.status = "open";
    delete next.claimantId;
  }
  if (action === "complete") next.status = "done";
  if (action === "delete") next.deletedAt = now;
  return next;
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

// ---- Sample pins -----------------------------------------------------------

function samplePin(listing, index, now = Date.now()) {
  const created = new Date(now - index * 45 * 6e4).toISOString();
  const row = Math.floor(index / 6);
  const col = index % 6;
  const { name, profession, skills, ...rest } = listing;
  return {
    id: uuid(),
    ...rest,
    authorName: name,
    authorId: "sample:neighbor:" + index,
    authorProfession: profession,
    authorSkills: skills,
    payment: listing.payment || "free",
    currency: listing.payment === "paid" ? "USD" : undefined,
    sample: true,
    lat: CAMPUS.lat + (row - 2) * 0.00115 + Math.sin(index * 2.3) * 25e-5,
    lng: CAMPUS.lng + (col - 2.5) * 0.00135 + Math.cos(index * 1.7) * 2e-4,
    placeLabel: "De Anza area · illustrative sample location",
    description: listing.description,
    status: "open",
    confirmations: 0,
    saves: 0,
    createdAt: created,
    updatedAt: created,
    lastConfirmedAt: created,
    version: 1,
    ...(listing.type === "event"
      ? {
          startsAt: new Date(now + (3 + (index % 5)) * DAY).toISOString(),
          endsAt: new Date(
            now + (3 + (index % 5)) * DAY + 2 * 36e5,
          ).toISOString(),
        }
      : {}),
    ...(listing.type === "place"
      ? { hours: "Sample resource · confirm actual availability before visiting" }
      : {}),
  };
}

// The first pins a new visitor sees around campus.
export function initialPins(now = Date.now()) {
  const campus = [
    ["help", "Litter", "A little cleanup, a big difference", "Some wrappers have collected by the campus walkway. Bring a bag and lend a hand.", 5e-4, -0.0012],
    ["nature", "Reading spot", "Your next chapter starts here", "A peaceful spot for a book between classes. Sample discovery; check access when visiting.", -6e-4, 5e-4],
    ["help", "Recycling", "An extra pair of hands", "A few cardboard boxes need carrying to recycling. A small favor goes a long way.", 0.001, 6e-4],
    ["nature", "Shade", "A moment under the trees", "A shaded place to slow down and catch your breath. Sample campus discovery.", -0.0014, -8e-4],
    ["nature", "Garden", "Take the scenic way home", "Greenery along the campus path. Leave plants for everyone to enjoy.", 0.0012, -7e-4],
  ].map(([type, category, title, description, dLat, dLng], index) => {
    const created = new Date(now - index * 36e5).toISOString();
    return {
      id: uuid(),
      type,
      category,
      title,
      description,
      lat: CAMPUS.lat + dLat,
      lng: CAMPUS.lng + dLng,
      placeLabel: "De Anza · Sample pin",
      authorId: "sample:" + index,
      authorName: ["Maya", "Sam", "Oliver", "Nora", "Leah"][index],
      status: "open",
      confirmations: 0,
      saves: 0,
      lastConfirmedAt: created,
      createdAt: created,
      updatedAt: created,
      version: 1,
    };
  });
  const neighborhood = SAMPLE_LISTINGS.slice(0, 30 - campus.length).map(
    (listing, index) => samplePin(listing, index, now),
  );
  return [...campus, ...neighborhood];
}

// Fictional listings for Bay Area neighborhoods inside the visible map area.
// IDs are stable so each sample is only added once.
export function bayAreaSamples(bbox, zoom, now = Date.now()) {
  if (zoom < MIN_LISTING_ZOOM) return [];
  return NEIGHBORHOODS.flatMap((area, areaIndex) => {
    if (
      area.lat + 0.008 < bbox[1] ||
      area.lat - 0.008 > bbox[3] ||
      area.lng + 0.009 < bbox[0] ||
      area.lng - 0.009 > bbox[2]
    ) {
      return [];
    }
    return SAMPLE_LISTINGS.slice(0, 18)
      .map((listing, index) => ({
        ...samplePin(listing, index, now),
        id: `019b0000-0000-7000-8000-${(areaIndex * 100 + index + 1).toString(16).padStart(12, "0")}`,
        authorId: `sample:bay:${area.id}:${index}`,
        title: `${listing.title} · ${area.name}`.slice(0, 80),
        lat:
          area.lat +
          (Math.floor(index / 6) - 1) * 0.0032 +
          Math.sin(index * 2.3) * 65e-5,
        lng:
          area.lng + ((index % 6) - 2.5) * 0.0028 + Math.cos(index * 1.7) * 5e-4,
        placeLabel: `${area.name} · illustrative sample location`,
        description: `${listing.description} Fictional example in ${area.name}; not a confirmed listing.`,
      }))
      .filter((pin) => inBbox(pin, bbox));
  });
}

// ---- Photos ----------------------------------------------------------------

// Resizes a photo to at most 1600 px and re-encodes it, which drops metadata.
export async function preparePhoto(file) {
  if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 12 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.8);
    if (dataUrl.length > 25e5) {
      throw new Error(
        "This photo is too large after resizing. Choose a smaller image.",
      );
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}

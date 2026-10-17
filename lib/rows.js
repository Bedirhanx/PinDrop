// Converts between database rows (snake_case) and the pin objects the app
// uses (camelCase). Shared by the browser and the server.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

export function photoUrlFor(path) {
  return path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/pin-photos/${path}`
    : undefined;
}

const FIELDS = {
  id: "id",
  authorId: "author_id",
  type: "type",
  communityCategory: "community_category",
  category: "category",
  title: "title",
  description: "description",
  lat: "lat",
  lng: "lng",
  approximate: "approximate",
  placeLabel: "place_label",
  payment: "payment",
  amount: "amount",
  currency: "currency",
  exchangeDetails: "exchange_details",
  urgency: "urgency",
  availabilityStart: "availability_start",
  availabilityEnd: "availability_end",
  startsAt: "starts_at",
  endsAt: "ends_at",
  expiresAt: "expires_at",
  hours: "hours",
  contactNote: "contact_note",
  skills: "skills",
  contactTags: "contact_tags",
  photoPath: "photo_path",
  status: "status",
  claimantId: "claimant_id",
  confirmations: "confirmations",
  saves: "saves",
  lastConfirmedAt: "last_confirmed_at",
  version: "version",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

// Fields a person may set when creating a pin. The server decides the rest.
const WRITABLE = [
  "type",
  "communityCategory",
  "category",
  "title",
  "description",
  "lat",
  "lng",
  "approximate",
  "placeLabel",
  "payment",
  "amount",
  "currency",
  "exchangeDetails",
  "urgency",
  "availabilityStart",
  "availabilityEnd",
  "startsAt",
  "endsAt",
  "expiresAt",
  "hours",
  "contactNote",
  "skills",
  "contactTags",
  "photoPath",
];

export function rowToPin(row) {
  const pin = {};
  for (const [key, column] of Object.entries(FIELDS)) {
    if (row[column] !== null && row[column] !== undefined) pin[key] = row[column];
  }
  if (pin.amount !== undefined) pin.amount = Number(pin.amount);
  pin.lat = Number(pin.lat);
  pin.lng = Number(pin.lng);
  pin.description ??= "";
  pin.skills ??= [];
  pin.contactTags ??= [];
  pin.confirmations ??= 0;
  pin.saves ??= 0;
  pin.version ??= 1;
  pin.authorName = row.author?.display_name || "Neighbor";
  pin.authorVerified = !!row.author?.is_student_verified;
  pin.authorHelped = row.author?.helped_count || 0;
  if (row.claimant?.display_name) pin.claimantName = row.claimant.display_name;
  if (row.hidden_at) pin.hidden = true;
  if (pin.photoPath) pin.photoUrl = photoUrlFor(pin.photoPath);
  return pin;
}

export function pinToRow(draft) {
  const row = {};
  for (const key of WRITABLE) {
    const value = draft[key];
    if (value === undefined || value === null || value === "") continue;
    row[FIELDS[key]] = value;
  }
  return row;
}

// Reads a pin cached in IndexedDB, dropping anything malformed.
export function isValidPin(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.type === "string" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Number.isFinite(Date.parse(value.createdAt))
  );
}

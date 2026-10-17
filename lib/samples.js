// Fictional sample pins that make an empty map easier to understand. They are
// generated in the browser, never stored on the server, always labelled as
// samples, and can't be claimed, saved or reported.
import {
  CAMPUS,
  MIN_LISTING_ZOOM,
  NEIGHBORHOODS,
  SAMPLE_LISTINGS,
} from "./constants";
import { inBbox } from "./pins";

const DAY = 864e5;

export function isSampleId(id) {
  return typeof id === "string" && id.startsWith("sample-");
}

function samplePin(listing, index, now) {
  const created = new Date(now - index * 45 * 6e4).toISOString();
  const row = Math.floor(index / 6);
  const col = index % 6;
  const { name, profession, skills, ...rest } = listing;
  return {
    id: `sample-deanza-${index}`,
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
    skills: listing.skills || [],
    contactTags: [],
    createdAt: created,
    updatedAt: created,
    lastConfirmedAt: created,
    version: 1,
    ...(listing.type === "event"
      ? {
          startsAt: new Date(now + (3 + (index % 5)) * DAY).toISOString(),
          endsAt: new Date(now + (3 + (index % 5)) * DAY + 2 * 36e5).toISOString(),
        }
      : {}),
    ...(listing.type === "place"
      ? { hours: "Sample resource · confirm actual availability before visiting" }
      : {}),
  };
}

function campusPins(now) {
  const campus = [
    ["help", "Litter", "A little cleanup, a big difference", "Some wrappers have collected by the campus walkway. Bring a bag and lend a hand.", 5e-4, -0.0012],
    ["nature", "Reading spot", "Your next chapter starts here", "A peaceful spot for a book between classes. Sample discovery; check access when visiting.", -6e-4, 5e-4],
    ["help", "Recycling", "An extra pair of hands", "A few cardboard boxes need carrying to recycling. A small favor goes a long way.", 0.001, 6e-4],
    ["nature", "Shade", "A moment under the trees", "A shaded place to slow down and catch your breath. Sample campus discovery.", -0.0014, -8e-4],
    ["nature", "Garden", "Take the scenic way home", "Greenery along the campus path. Leave plants for everyone to enjoy.", 0.0012, -7e-4],
  ].map(([type, category, title, description, dLat, dLng], index) => {
    const created = new Date(now - index * 36e5).toISOString();
    return {
      id: `sample-campus-${index}`,
      type,
      category,
      title,
      description,
      lat: CAMPUS.lat + dLat,
      lng: CAMPUS.lng + dLng,
      placeLabel: "De Anza · Sample pin",
      authorId: "sample:" + index,
      authorName: ["Maya", "Sam", "Oliver", "Nora", "Leah"][index],
      sample: true,
      status: "open",
      confirmations: 0,
      saves: 0,
      skills: [],
      contactTags: [],
      lastConfirmedAt: created,
      createdAt: created,
      updatedAt: created,
      version: 1,
    };
  });
  const neighborhood = SAMPLE_LISTINGS.slice(0, 30 - campus.length).map((listing, index) =>
    samplePin(listing, index, now),
  );
  return [...campus, ...neighborhood];
}

function bayAreaPins(area, now) {
  return SAMPLE_LISTINGS.slice(0, 18).map((listing, index) => ({
    ...samplePin(listing, index, now),
    id: `sample-${area.id}-${index}`,
    authorId: `sample:bay:${area.id}:${index}`,
    title: `${listing.title} · ${area.name}`.slice(0, 80),
    lat: area.lat + (Math.floor(index / 6) - 1) * 0.0032 + Math.sin(index * 2.3) * 65e-5,
    lng: area.lng + ((index % 6) - 2.5) * 0.0028 + Math.cos(index * 1.7) * 5e-4,
    placeLabel: `${area.name} · illustrative sample location`,
    description: `${listing.description} Fictional example in ${area.name}; not a confirmed listing.`,
  }));
}

let all;

// Every sample pin, generated once per page load.
export function allSamples() {
  if (!all) {
    const now = Date.now();
    all = [...campusPins(now), ...NEIGHBORHOODS.flatMap((area) => bayAreaPins(area, now))];
  }
  return all;
}

export function sampleById(id) {
  return isSampleId(id) ? allSamples().find((pin) => pin.id === id) : undefined;
}

// Samples inside the visible map area. None are shown when zoomed far out.
export function samplesInArea(bbox, zoom) {
  if (zoom < MIN_LISTING_ZOOM) return [];
  return allSamples().filter((pin) => inBbox(pin, bbox));
}

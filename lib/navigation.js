"use client";

// Directions, live location and compass hooks.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { distance } from "./pins";

export function googleMapsUrl(destination, mode, origin) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set(
    "travelmode",
    mode === "cycling" ? "bicycling" : mode === "rideshare" ? "driving" : mode,
  );
  if (origin) url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  return url.href;
}

export function rideshareUrl(provider, destination) {
  const url = new URL(
    provider === "uber" ? "https://m.uber.com/ul/" : "https://ride.lyft.com/u",
  );
  if (provider === "uber") {
    url.searchParams.set("action", "setPickup");
    url.searchParams.set("pickup", "my_location");
    url.searchParams.set("dropoff[latitude]", String(destination.lat));
    url.searchParams.set("dropoff[longitude]", String(destination.lng));
  } else {
    url.searchParams.set("destination[latitude]", String(destination.lat));
    url.searchParams.set("destination[longitude]", String(destination.lng));
  }
  return url.href;
}

// OSRM-compatible routing servers. The defaults are free community servers
// (OSRM demo and FOSSGIS) meant for light, fair use; point these at your own
// or a paid OSRM-compatible service for production traffic.
const ROUTERS = {
  walking: process.env.NEXT_PUBLIC_ROUTING_WALKING_URL || "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
  cycling: process.env.NEXT_PUBLIC_ROUTING_CYCLING_URL || "https://routing.openstreetmap.de/routed-bike/route/v1/bike",
  driving: process.env.NEXT_PUBLIC_ROUTING_DRIVING_URL || "https://router.project-osrm.org/route/v1/driving",
};

function routeUrl(from, to, profile) {
  const base = ROUTERS[profile] || ROUTERS.walking;
  return `${base}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
}

function bearing(from, to) {
  const rad = Math.PI / 180;
  const dLng = (to.lng - from.lng) * rad;
  return (
    (Math.atan2(
      Math.sin(dLng) * Math.cos(to.lat * rad),
      Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
        Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLng),
    ) /
      rad +
      360) %
    360
  );
}

// How far `point` is from the route line, and how much route remains after it.
function progressAlong(point, coordinates) {
  let best = Infinity;
  let remaining = 0;
  const lengths = coordinates
    .slice(1)
    .map((c, i) =>
      distance(
        { lng: coordinates[i][0], lat: coordinates[i][1] },
        { lng: c[0], lat: c[1] },
      ),
    );
  let left = lengths.reduce((sum, length) => sum + length, 0);
  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const scale = Math.cos((point.lat * Math.PI) / 180);
    const ax = (a[0] - point.lng) * scale;
    const ay = a[1] - point.lat;
    const bx = (b[0] - point.lng) * scale;
    const by = b[1] - point.lat;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const closest = { lng: a[0] + t * (b[0] - a[0]), lat: a[1] + t * (b[1] - a[1]) };
    const d = distance(point, closest);
    if (d < best) {
      best = d;
      remaining = left - lengths[i] * t;
    }
    left -= lengths[i];
  }
  return { distance: best, remaining };
}

function straightLine(from, to, profile) {
  return {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    distance: distance(from, to),
    duration: 0,
    steps: [],
    profile,
    fallback: true,
  };
}

export function useGeolocation() {
  const [fix, setFix] = useState(null);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState(false);
  const watchId = useRef(null);
  const last = useRef(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    setTracking(false);
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser.");
      return;
    }
    if (watchId.current !== null) return;
    setError("");
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { coords, timestamp } = position;
        setError(
          coords.accuracy > 50
            ? `Location accuracy is ±${Math.round(coords.accuracy)} m. Showing an approximate position.`
            : "",
        );
        const previous = last.current;
        const raw = { lat: coords.latitude, lng: coords.longitude };
        // Smooth small jumps so the marker doesn't jitter.
        const point =
          previous &&
          distance(previous, raw) < 100 &&
          timestamp - previous.timestamp < 3e4
            ? {
                lat: previous.lat * 0.25 + raw.lat * 0.75,
                lng: previous.lng * 0.25 + raw.lng * 0.75,
              }
            : raw;
        const speed =
          coords.speed ??
          (previous
            ? distance(previous, raw) /
              Math.max(1, (timestamp - previous.timestamp) / 1e3)
            : 0);
        const heading = Number.isFinite(coords.heading)
          ? coords.heading
          : previous && speed > 0.5
            ? bearing(previous, raw)
            : (previous?.heading ?? null);
        const next = {
          ...point,
          speed,
          heading,
          accuracy: coords.accuracy,
          timestamp,
        };
        last.current = next;
        setFix(next);
      },
      (failure) => {
        setError(
          failure.code === 1
            ? "Location permission was denied. Enable it in your browser settings to use your location."
            : failure.code === 3
              ? "Finding your location is taking too long. Try again, ideally outdoors."
              : "Your location isn’t available right now. Try again in a moment.",
        );
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 3e3, timeout: 15e3 },
    );
  }, [stop]);

  useEffect(
    () => () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    },
    [],
  );

  return { fix, error, tracking, start, stop };
}

export function useCompass(gpsHeading) {
  const [heading, setHeading] = useState(null);
  const [status, setStatus] = useState("Compass off");
  const cleanup = useRef(() => {});
  const lastReading = useRef(0);

  const enable = async () => {
    const Orientation = window.DeviceOrientationEvent;
    if (!Orientation) {
      setStatus("GPS heading only");
      return;
    }
    try {
      if (
        Orientation.requestPermission &&
        (await Orientation.requestPermission()) !== "granted"
      ) {
        setStatus("Permission denied · GPS fallback");
        return;
      }
      cleanup.current();
      const onOrientation = (event) => {
        let value = event.webkitCompassHeading;
        if (value === undefined && event.absolute && event.alpha !== null) {
          value = 360 - event.alpha;
        }
        if (value === undefined || !Number.isFinite(value)) return;
        lastReading.current = Date.now();
        setHeading((value + (screen.orientation?.angle || 0) + 360) % 360);
        setStatus("Device compass");
      };
      window.addEventListener("deviceorientation", onOrientation);
      window.addEventListener("deviceorientationabsolute", onOrientation);
      const timer = setTimeout(() => {
        if (!lastReading.current) setStatus("No sensor reading · GPS fallback");
      }, 5e3);
      cleanup.current = () => {
        clearTimeout(timer);
        window.removeEventListener("deviceorientation", onOrientation);
        window.removeEventListener("deviceorientationabsolute", onOrientation);
      };
      setStatus("Waiting for compass");
    } catch {
      setStatus("Compass unavailable · GPS fallback");
    }
  };

  useEffect(() => () => cleanup.current(), []);
  useEffect(() => {
    if (gpsHeading !== null && Date.now() - lastReading.current > 4e3) {
      setHeading(gpsHeading);
    }
  }, [gpsHeading]);

  return { heading, status, enable };
}

// Fetches a street route and tracks progress along it.
export function useRoute(destination, fix, profile) {
  // Start over when the destination, mode or preview origin changes.
  const originKey = fix?.timestamp === 0 ? `${fix.lat},${fix.lng}` : "gps";
  const key = `${destination?.id ?? ""}|${profile}|${originKey}`;
  const [state, setState] = useState({ key, route: null, loading: false, error: "" });
  let current = state;
  if (state.key !== key) {
    current = { key, route: null, loading: false, error: "" };
    setState(current);
  }
  const { route, loading, error } = current;

  const request = useRef(null);
  const lastFetch = useRef(0);
  const offRouteCount = useRef(0);
  const latest = useRef({ fix, destination, profile, key });
  useEffect(() => {
    latest.current = { fix, destination, profile, key };
  });

  const fetchRoute = useCallback(async () => {
    const { fix: from, destination: to, profile: mode, key: forKey } = latest.current;
    if (!from || !to) return;
    const update = (changes) =>
      setState((s) => (s.key === forKey ? { ...s, ...changes } : s));
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    lastFetch.current = Date.now();
    update({ loading: true, error: "" });
    const timeout = setTimeout(() => controller.abort(), 12e3);
    try {
      const response = await fetch(routeUrl(from, to, mode), {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Routing service unavailable");
      const data = await response.json();
      if (data.code !== "Ok" || !data.routes?.length) {
        throw new Error("No route found");
      }
      if (request.current !== controller) return;
      const best = data.routes[0];
      if (!Array.isArray(best?.geometry?.coordinates) || !Array.isArray(best.legs)) {
        throw new Error("Unexpected routing response");
      }
      update({
        route: {
          profile: mode,
          distance: best.distance,
          duration: best.duration,
          coordinates: best.geometry.coordinates,
          steps: best.legs.flatMap((leg) =>
            (leg.steps || []).map((step) => ({
              instruction:
                step.maneuver.type === "arrive"
                  ? "Arrive at your destination"
                  : `${step.maneuver.type === "depart" ? "Head" : step.maneuver.type.replaceAll("_", " ")} ${step.maneuver.modifier || ""}${step.name ? " on " + step.name : ""}`.trim(),
              distance: step.distance,
              location: {
                lng: step.maneuver.location[0],
                lat: step.maneuver.location[1],
              },
            })),
          ),
        },
        loading: false,
      });
    } catch {
      if (request.current !== controller) return;
      update({
        route: straightLine(from, to, mode),
        loading: false,
        error:
          "Street directions are unavailable. The dashed line shows direction only; open Google Maps or retry for street directions.",
      });
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    lastFetch.current = 0;
    offRouteCount.current = 0;
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [key]);

  const progress = useMemo(() => {
    if (!route || !fix || !destination) return null;
    if (route.fallback) return { remaining: distance(fix, destination), distance: 0 };
    return progressAlong(fix, route.coordinates);
  }, [route, fix, destination]);
  const remaining = progress ? progress.remaining : (route?.distance ?? 0);
  const arrived = !!(destination && fix && distance(fix, destination) < 15 && fix.accuracy <= 25);

  useEffect(() => {
    if (!destination || !fix || arrived) return;
    if (!route) {
      if (!request.current) fetchRoute();
      return;
    }
    if (route.fallback || !progress) return;
    // Re-route after three readings more than 25 m off the line.
    offRouteCount.current = progress.distance > 25 ? offRouteCount.current + 1 : 0;
    if (offRouteCount.current >= 3 && Date.now() - lastFetch.current > 1e4) {
      offRouteCount.current = 0;
      fetchRoute();
    }
  }, [fix, destination, route, progress, arrived, fetchRoute]);

  return { route, loading, error, remaining, arrived, retry: fetchRoute };
}

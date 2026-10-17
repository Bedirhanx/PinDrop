"use client";

import {
  ArrowLeft,
  Bike,
  Bus,
  Car,
  CircleCheck,
  Compass,
  ExternalLink,
  Footprints,
  LocateFixed,
  RefreshCw,
} from "lucide-react";
import { RideshareIcon } from "./CategoryIcon";
import { CAMPUS } from "@/lib/constants";
import { googleMapsUrl, rideshareUrl } from "@/lib/navigation";
import { distance, formatDistance } from "@/lib/pins";

const MODES = [
  { id: "walking", label: "Walk", Icon: Footprints },
  { id: "cycling", label: "Bike", Icon: Bike },
  { id: "driving", label: "Drive", Icon: Car },
  { id: "transit", label: "Transit", Icon: Bus },
  { id: "rideshare", label: "Rideshare", Icon: RideshareIcon },
];

export default function NavigationPanel({
  pin,
  active,
  mode,
  setMode,
  onStart,
  onStop,
  route,
  loading,
  error,
  remaining,
  arrived,
  onRetry,
  onRecenter,
  headingUp,
  setHeadingUp,
  locationError,
  origin,
  hasLocation,
  onUseCampus,
  onUseMapCenter,
  locating,
}) {
  // Only show the steps still ahead of the traveller.
  const travelled = route ? Math.max(0, route.distance - remaining) : 0;
  const allSteps = route?.steps || [];
  const ends = allSteps.reduce(
    (list, step) => [...list, (list.at(-1) || 0) + step.distance],
    [],
  );
  const steps = allSteps.filter((_, index) => ends[index] >= travelled);
  const external = mode === "transit" || mode === "rideshare";

  return (
    <div className="navigation-content panel-enter">
      <header className="navigation-header">
        <button className="back-button" onClick={onStop}>
          <ArrowLeft size={16} />
          Back to pin
        </button>
        <h2>{pin.title}</h2>
        <div className="transport travel-modes" role="group" aria-label="Travel mode">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              aria-pressed={mode === id}
              className={mode === id ? "chosen" : ""}
              onClick={() => setMode(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="navigation-body">
        <div className="navigation-origin">
          <span>
            From{" "}
            <strong>
              {hasLocation
                ? "your current location"
                : distance(origin, CAMPUS) < 30
                  ? "De Anza College"
                  : "selected map center"}
            </strong>
          </span>
          <small>
            {hasLocation
              ? "Live location is available."
              : "Preview a route without enabling location."}
          </small>
          <div className="origin-options">
            <button className="text-button" onClick={onUseCampus}>
              Start at De Anza
            </button>
            <button className="text-button" onClick={onUseMapCenter}>
              Use map center
            </button>
          </div>
        </div>
        {external ? (
          <div className="external-travel">
            <h3>
              {mode === "transit"
                ? "Find a bus or transit route"
                : "Choose a rideshare app"}
            </h3>
            <p>
              {mode === "transit"
                ? "Open transit directions for routes, stops and departure times."
                : "Your destination will be filled in. Confirm pickup, price and booking in the provider’s app."}
            </p>
            {mode === "transit" ? (
              <a
                className="primary full"
                href={googleMapsUrl(pin, "transit", origin)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open transit directions
                <ExternalLink size={16} />
              </a>
            ) : (
              <>
                <a
                  className="primary full"
                  href={rideshareUrl("uber", pin)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Uber
                  <ExternalLink size={16} />
                </a>
                <a
                  className="secondary full"
                  href={rideshareUrl("lyft", pin)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Lyft
                  <ExternalLink size={16} />
                </a>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="route-summary">
              {arrived ? (
                <>
                  <CircleCheck size={28} />
                  <h3>You’re here.</h3>
                </>
              ) : (
                <>
                  <strong>
                    {loading
                      ? "Finding route…"
                      : route && !route.fallback
                        ? `${Math.max(1, Math.ceil((route.duration * (remaining / Math.max(1, route.distance))) / 60))} min`
                        : route?.fallback
                          ? "Route unavailable"
                          : "Preparing route…"}
                  </strong>
                  <p>
                    {route
                      ? formatDistance(remaining) +
                        (route.fallback
                          ? " · direct distance"
                          : " · " +
                            (active && hasLocation ? "remaining" : "route preview"))
                      : ""}
                  </p>
                </>
              )}
            </div>
            {(locationError || error) && (
              <p className="notice" role="status">
                {locationError || error}
              </p>
            )}
            <button className="primary full" onClick={onStart} disabled={locating}>
              <LocateFixed size={17} />
              {locating
                ? "Finding your location…"
                : active
                ? hasLocation
                  ? "Update my location"
                  : "Retry my location"
                : "Use my location & navigate"}
            </button>
            <p className="form-caption">
              Street routing uses free OpenStreetMap routing servers. Location is used only
              when you choose it. Preview routes use the selected starting
              point.
            </p>
            <a
              className="secondary full"
              href={googleMapsUrl(pin, mode, origin)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Maps
              <ExternalLink size={15} />
            </a>
            {active && hasLocation && (
              <div className="reaction-row">
                <button onClick={onRecenter}>
                  <LocateFixed size={17} />
                  Recenter
                </button>
                <button
                  className={headingUp ? "active" : ""}
                  onClick={() => setHeadingUp(!headingUp)}
                >
                  <Compass size={17} />
                  {headingUp ? "Heading up" : "North up"}
                </button>
              </div>
            )}
            {error && (
              <button className="secondary full" onClick={onRetry}>
                <RefreshCw size={16} />
                Retry street route
              </button>
            )}
            <ol className="directions">
              {steps.map((step, index) => (
                <li key={index}>
                  <span>{index + 1}</span>
                  <div>
                    {step.instruction}
                    <small>{formatDistance(step.distance)}</small>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

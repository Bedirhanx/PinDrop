"use client";

import { ArrowUpRight, Check, MapPin, RotateCcw } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import { PAYMENT_LABELS, URGENCY_LABELS } from "@/lib/constants";
import {
  distance,
  effectiveStatus,
  formatDistance,
  isPlace,
  isRequest,
  STATUS_LABELS,
  tagStyle,
  typeLabel,
} from "@/lib/pins";

export default function PinFeed({
  pins,
  center,
  onSelect,
  emptyHint,
  activeFilters = [],
  onClearFilters,
  zoomedOut = false,
}) {
  if (!pins.length) {
    const filtered = activeFilters.length > 0;
    let title = "A little quiet here.";
    let text = "No pins in this map area yet. Move the map, or drop the first pin here.";
    if (emptyHint) {
      title = "Nothing here yet.";
      text = emptyHint;
    } else if (zoomedOut) {
      title = "Zoom in to discover listings";
      text =
        "Choose a Bay Area neighborhood above or zoom closer. Listings load only for the area you’re viewing.";
    } else if (filtered) {
      title = "No pins match your filters.";
      text = `Nothing in this map area matches ${activeFilters.map((f) => f.label).join(" + ")}. Clear the filters or move the map.`;
    }
    return (
      <div className="feed-scroll">
        <div className="empty">
          <MapPin size={30} aria-hidden="true" />
          <h3>{title}</h3>
          <p>{text}</p>
          {filtered && onClearFilters && (
            <button className="secondary" onClick={onClearFilters}>
              <RotateCcw size={15} aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="feed-scroll">
      {pins.map((pin) => {
        const status = effectiveStatus(pin);
        const done = status === "done";
        const author = pin.authorName || "Neighbor";
        return (
          <button key={pin.id} className="feed-card" onClick={() => onSelect(pin.id)}>
            <div className="card-meta">
              <span className={"tag " + pin.type} style={tagStyle(pin)}>
                {done ? (
                  <Check size={12} />
                ) : (
                  <CategoryIcon
                    category={pin.category}
                    group={pin.communityCategory}
                    size={14}
                  />
                )}
                {done ? "Completed" : pin.category}
              </span>
              <span className="card-distance">
                <span className="sr-only">Distance: </span>
                {formatDistance(distance(center, pin))}
              </span>
            </div>
            <h3>{pin.title}</h3>
            <div className="listing-meta">
              <span className="type-chip">{typeLabel(pin.type)}</span>
              {pin.sample && <span className="sample-label">Sample · fictional</span>}
              {(status === "claimed" || status === "active" || status === "cancelled" || status === "archived") && (
                <span>{STATUS_LABELS[status]}</span>
              )}
              {pin.payment && <span>{PAYMENT_LABELS[pin.payment]}</span>}
              {pin.urgency && pin.urgency !== "flexible" && (
                <span className="urgent">{URGENCY_LABELS[pin.urgency]}</span>
              )}
            </div>
            <p>{pin.description}</p>
            <div className="card-foot">
              <span>
                <i aria-hidden="true">{author[0].toUpperCase()}</i>
                {author}
              </span>
              <span className="card-action">
                {isRequest(pin.type) && status === "open"
                  ? "Lend a hand"
                  : isPlace(pin.type)
                    ? "Explore spot"
                    : "View pin"}
                <ArrowUpRight size={14} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { ArrowUpRight, Check, MapPin } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import { MIN_LISTING_ZOOM, PAYMENT_LABELS, URGENCY_LABELS } from "@/lib/constants";
import {
  distance,
  effectiveStatus,
  formatDistance,
  isPlace,
  isRequest,
  tagStyle,
  typeLabel,
} from "@/lib/pins";
import { useUi } from "@/lib/store";

export default function PinFeed({ pins, center, onSelect }) {
  const zoom = useUi((s) => s.zoom);

  if (!pins.length) {
    const zoomedOut = zoom < MIN_LISTING_ZOOM;
    return (
      <div className="feed-scroll">
        <div className="empty">
          <MapPin size={30} />
          <h3>
            {zoomedOut ? "Zoom in to discover listings" : "A little quiet here."}
          </h3>
          <p>
            {zoomedOut
              ? "Choose a Bay Area neighborhood above or zoom closer. Listings load only for the area you’re viewing."
              : "Try another filter, or drop the first pin in this area."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-scroll">
      {pins.map((pin) => {
        const done = effectiveStatus(pin) === "done";
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
              <span>{formatDistance(distance(center, pin))}</span>
            </div>
            <h3>{pin.title}</h3>
            <div className="listing-meta">
              <span>{typeLabel(pin.type)}</span>
              {pin.sample && <span className="sample-label">Sample pin</span>}
              {pin.payment && <span>{PAYMENT_LABELS[pin.payment]}</span>}
              {pin.urgency && pin.urgency !== "flexible" && (
                <span className="urgent">{URGENCY_LABELS[pin.urgency]}</span>
              )}
            </div>
            <p>{pin.description}</p>
            <div className="card-foot">
              <span>
                <i>{pin.authorName[0]}</i>
                {pin.authorName}
              </span>
              <span className="card-action">
                {isRequest(pin.type) && pin.status === "open"
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

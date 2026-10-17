"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Clock,
  HandHeart,
  MapPin,
  Navigation,
  RotateCcw,
  Share2,
  Trash2,
} from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import Dialog from "./Dialog";
import { PAYMENT_LABELS, URGENCY_LABELS } from "@/lib/constants";
import { formatDay } from "@/lib/dates";
import {
  allowedActions,
  categoryGroupFor,
  distance,
  effectiveStatus,
  formatDistance,
  tagStyle,
  typeLabel,
} from "@/lib/pins";
import { usePins, useUi, writeSetting } from "@/lib/store";

const ACTION_MESSAGES = {
  delete: "Pin deleted.",
  complete: "A little better, thanks to you.",
};

export default function PinDetail({ pin, profile, center, onClose, onNavigate }) {
  const notify = useUi((s) => s.notify);
  const saved = usePins((s) => s.saved);
  const confirmed = usePins((s) => s.confirmed);
  const { act, react, report } = usePins.getState();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const status = effectiveStatus(pin);
  const actions = allowedActions({ ...pin, status }, profile.id);
  const isSaved = saved.includes(pin.id);
  const isConfirmed = confirmed.includes(pin.id);

  async function run(task) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }

  const doAction = (action) =>
    run(async () => {
      await act(pin.id, action);
      if (action === "delete") onClose();
      notify(ACTION_MESSAGES[action] || "Pin updated.");
    });

  return (
    <div className="detail-content panel-enter">
      <button className="back-button" onClick={onClose}>
        <ArrowLeft size={16} /> Back to neighborhood
      </button>
      <div className="detail-tags">
        <span className={"tag " + pin.type} style={tagStyle(pin)}>
          <CategoryIcon category={pin.category} group={pin.communityCategory} size={15} />
          {pin.category}
        </span>
        <span className="status-badge">{status}</span>
      </div>
      <h2>{pin.title}</h2>
      <div className="listing-meta">
        <span>{typeLabel(pin.type)}</span>
        {pin.communityCategory && (
          <span>{categoryGroupFor(pin.category)?.label}</span>
        )}
        {pin.urgency && (
          <span className={pin.urgency === "now" ? "urgent" : ""}>
            {URGENCY_LABELS[pin.urgency]}
          </span>
        )}
      </div>
      {pin.sample && (
        <p className="sample-notice">
          Illustrative sample · this person, listing and location are fictional.
          Availability and resources are not confirmed.
        </p>
      )}
      {pin.type === "alert" && (
        <p className="notice">Community alert · not emergency dispatch.</p>
      )}
      {pin.payment && (
        <div className="listing-terms">
          <strong>
            {PAYMENT_LABELS[pin.payment]}
            {pin.payment === "paid" && pin.amount
              ? ` · ${new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: pin.currency || "USD",
                }).format(pin.amount)}`
              : ""}
          </strong>
          {pin.exchangeDetails && <p>{pin.exchangeDetails}</p>}
          <small>
            Terms are arranged between neighbors. PinDrop does not process
            payments or time credits.
          </small>
        </div>
      )}
      {pin.skills?.length ? (
        <div className="skills-list">
          {pin.skills.map((skill) => (
            <span key={skill}>{skill} · self-reported</span>
          ))}
        </div>
      ) : null}
      {["care", "home", "wellness"].includes(pin.communityCategory) && (
        <p className="notice">
          Identity, qualifications, and background checks have not been
          verified by PinDrop.
        </p>
      )}
      <p className="detail-description">
        {pin.description || "A little discovery for the neighborhood."}
      </p>
      {pin.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="detail-photo" src={pin.photoUrl} alt={pin.title} />
      )}
      <div className="place-row">
        <MapPin size={17} />
        <div>
          {pin.approximate
            ? "Approximate area · exact address not stored"
            : pin.placeLabel || "Selected map location"}
          <small>{formatDistance(distance(center, pin))} from map center</small>
        </div>
      </div>
      {pin.type === "event" && (
        <div className="place-row">
          <Clock size={17} />
          <div>
            {new Date(pin.startsAt).toLocaleString()}
            <small>Ends {new Date(pin.endsAt).toLocaleString()}</small>
          </div>
        </div>
      )}
      {pin.availabilityStart && pin.availabilityEnd && (
        <div className="place-row">
          <Clock size={17} />
          <div>
            Availability
            <small>
              {formatDay(pin.availabilityStart)} — {formatDay(pin.availabilityEnd)}{" "}
              · inclusive
            </small>
          </div>
        </div>
      )}
      {!!pin.contactTags?.length && (
        <div className="skills-list" aria-label="Meeting preferences">
          {pin.contactTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {pin.contactNote && (
        <p className="notice">Contact / meeting note: {pin.contactNote}</p>
      )}
      {pin.hours && <p className="notice">Hours / access: {pin.hours}</p>}
      {pin.expiresAt && (
        <p className="form-caption">
          Expires {new Date(pin.expiresAt).toLocaleString()}
        </p>
      )}
      <div className="author-line">
        <span className="avatar">{pin.authorName.slice(0, 1)}</span>
        <div>
          Shared by{" "}
          <strong>{pin.authorId === profile.id ? "you" : pin.authorName}</strong>
          <small>
            {new Date(pin.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </small>
        </div>
      </div>
      {(pin.authorProfession || pin.authorSkills?.length) && (
        <div className="neighbor-credentials">
          {pin.authorProfession && <strong>{pin.authorProfession}</strong>}
          <div className="skills-list">
            {pin.authorSkills?.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
          <small>Neighbor’s self-reported profession &amp; skills</small>
        </div>
      )}
      <div className="detail-actions">
        {actions.includes("claim") && (
          <button className="primary full" disabled={busy} onClick={() => doAction("claim")}>
            <HandHeart size={18} /> I can help
          </button>
        )}
        {actions.includes("complete") && (
          <button className="primary full" disabled={busy} onClick={() => doAction("complete")}>
            <Check size={18} /> Mark as fixed
          </button>
        )}
        {actions.includes("release") && (
          <button className="secondary full" disabled={busy} onClick={() => doAction("release")}>
            Release claim
          </button>
        )}
        {actions.includes("reopen") && (
          <button className="secondary full" disabled={busy} onClick={() => doAction("reopen")}>
            <RotateCcw size={16} /> Reopen request
          </button>
        )}
        <button className="secondary full" onClick={onNavigate}>
          <Navigation size={17} /> Navigate here
        </button>
        <div className="reaction-row">
          <button
            className={isSaved ? "active" : ""}
            disabled={busy}
            onClick={() => run(() => react(pin.id, "save"))}
          >
            <Bookmark size={17} /> {isSaved ? "Saved" : "Save"}
          </button>
          <button
            className={isConfirmed ? "active" : ""}
            disabled={busy}
            onClick={() => run(() => react(pin.id, "confirm"))}
          >
            <Check size={17} /> Confirm · {pin.confirmations}
          </button>
        </div>
        <button
          className="text-button"
          onClick={async () => {
            const link = new URL("/p/" + pin.id, location.origin).href;
            try {
              await navigator.clipboard.writeText(link);
              notify("Link copied. Pins are saved in this browser, so the link opens here.");
            } catch {
              notify("Copy this page’s URL to share its link.");
            }
          }}
        >
          <Share2 size={15} /> Copy pin link
        </button>
        {actions.includes("delete") && (
          <button className="text-button danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} /> Delete my pin
          </button>
        )}
      </div>
      {pin.authorId !== profile.id && (
        <div className="safety-actions">
          <button className="text-button" onClick={() => setReporting(true)}>
            Report this pin
          </button>
          <button
            className="text-button danger"
            onClick={() => {
              const ui = useUi.getState();
              const blocked = [...new Set([...ui.blocked, pin.authorId])];
              ui.set({ blocked });
              writeSetting("pindrop-blocked", JSON.stringify(blocked));
              onClose();
              notify("This neighbor’s pins are hidden on this device.");
            }}
          >
            Block neighbor’s pins
          </button>
        </div>
      )}
      <Dialog
        open={reporting}
        onClose={() => setReporting(false)}
        title="Report this pin"
        description="Explain what needs attention. Reports are saved on this device."
      >
        <textarea
          className="report-input"
          aria-label="Report reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={4}
        />
        <button
          className="primary full"
          disabled={busy || reason.trim().length < 3}
          onClick={() =>
            run(async () => {
              await report(pin.id, reason);
              setReporting(false);
              notify("Report saved on this device.");
            })
          }
        >
          Submit report
        </button>
      </Dialog>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this pin?"
        description="It will be removed from your map and feed."
      >
        <div className="dialog-actions">
          <button className="secondary" onClick={() => setConfirmDelete(false)}>
            Keep pin
          </button>
          <button
            className="primary danger-fill"
            disabled={busy}
            onClick={() => doAction("delete")}
          >
            Delete pin
          </button>
        </div>
      </Dialog>
    </div>
  );
}

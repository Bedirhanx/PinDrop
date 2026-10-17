"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Check,
  Clock,
  HandHeart,
  LoaderCircle,
  MapPin,
  Navigation,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import Conversation from "./Conversation";
import Dialog from "./Dialog";
import { PAYMENT_LABELS, URGENCY_LABELS } from "@/lib/constants";
import { formatDay } from "@/lib/dates";
import { fetchLiveClaim, subscribe } from "@/lib/api";
import {
  allowedActions,
  APPROXIMATE_CELL_METRES,
  categoryGroupFor,
  distance,
  effectiveStatus,
  formatDistance,
  isClaimable,
  isRequest,
  STATUS_LABELS,
  tagStyle,
  typeLabel,
} from "@/lib/pins";
import { usePins, useUi } from "@/lib/store";

const ACTION_MESSAGES = {
  claim: "Offer sent. The author can see it now.",
  withdraw: "You’ve stepped back from this pin.",
  accept: "Offer accepted. Say hello below.",
  decline: "The pin is open again.",
  complete: "A little better, thanks to you.",
  cancel: "Pin cancelled.",
  reopen: "Pin reopened.",
  delete: "Pin deleted.",
};

function formatDate(value, options) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, options) : "";
}

export default function PinDetail({ pin, userId, center, onClose, onNavigate, onError }) {
  const notify = useUi((s) => s.notify);
  const isSaved = usePins((s) => s.saved.includes(pin.id));
  const isConfirmed = usePins((s) => s.confirmed.includes(pin.id));
  const backend = usePins((s) => s.backend);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [reportError, setReportError] = useState("");
  const [busy, setBusy] = useState("");
  const [claimState, setClaim] = useState(null);

  const status = effectiveStatus(pin);
  const actions = allowedActions(pin, userId);
  const isAuthor = !!userId && pin.authorId === userId;
  const isHelper = !!userId && pin.claimantId === userId;
  const live = pin.status === "claimed" || pin.status === "active";
  const authorName = pin.authorName || "Neighbor";

  // The live claim (who offered) is visible only to its two participants.
  const showClaim = backend && !pin.sample && live && (isAuthor || isHelper);
  useEffect(() => {
    if (!showClaim) return;
    let cancelled = false;
    const load = () =>
      fetchLiveClaim(pin.id)
        .then((next) => !cancelled && setClaim(next))
        .catch(() => {});
    load();
    const unsubscribe = subscribe("pin_claims", `pin_id=eq.${pin.id}`, load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [showClaim, pin.id, pin.status, pin.claimantId]);
  const claim = showClaim ? claimState : null;

  async function run(name, task) {
    setBusy(name);
    try {
      await task();
    } catch (error) {
      onError(error);
    } finally {
      setBusy("");
    }
  }

  const doAction = (action) =>
    run(action, async () => {
      await usePins.getState().act(pin.id, action);
      if (action === "delete") {
        setConfirmDelete(false);
        onClose();
      }
      notify(ACTION_MESSAGES[action] || "Pin updated.");
    });

  const actionButton = (action, children, className = "secondary full") =>
    actions.includes(action) ? (
      <button className={className} disabled={!!busy} onClick={() => doAction(action)}>
        {busy === action && <LoaderCircle size={16} className="spin" />}
        {children}
      </button>
    ) : null;

  // "I can help" is shown to signed-out visitors too; it asks them to sign in.
  const canOfferSignedOut =
    !userId && !pin.sample && isClaimable(pin.type) && pin.status === "open" && status === "open";

  return (
    <article className="detail-content panel-enter" aria-labelledby="pin-title">
      <button className="back-button" onClick={onClose}>
        <ArrowLeft size={16} /> Back to neighborhood
      </button>
      <div className="detail-tags">
        <span className={"tag " + pin.type} style={tagStyle(pin)}>
          <CategoryIcon category={pin.category} group={pin.communityCategory} size={15} />
          {pin.category}
        </span>
        <span className={"status-badge status-" + status}>{STATUS_LABELS[status] || status}</span>
      </div>
      <h2 id="pin-title">{pin.title}</h2>
      <div className="listing-meta">
        <span>{typeLabel(pin.type)}</span>
        {pin.communityCategory && <span>{categoryGroupFor(pin.category)?.label}</span>}
        {pin.urgency && (
          <span className={pin.urgency === "now" ? "urgent" : ""}>{URGENCY_LABELS[pin.urgency]}</span>
        )}
      </div>
      {pin.sample && (
        <p className="sample-notice">
          Illustrative sample · this person, listing and location are fictional. Availability and
          resources are not confirmed, and sample pins can’t be claimed, saved or reported.
        </p>
      )}
      {pin.hidden && isAuthor && (
        <p className="notice" role="status">
          This pin is hidden from others while several reports are reviewed.
        </p>
      )}
      {pin.type === "alert" && <p className="notice">Community alert · not emergency dispatch.</p>}
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
          <small>Terms are arranged between neighbors. PinDrop does not process payments or time credits.</small>
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
          Identity, qualifications, and background checks have not been verified by PinDrop.
        </p>
      )}
      <p className="detail-description">{pin.description || "A little discovery for the neighborhood."}</p>
      {pin.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="detail-photo" src={pin.photoUrl} alt={`Photo for ${pin.title}`} loading="lazy" />
      )}
      <div className="place-row">
        <MapPin size={17} aria-hidden="true" />
        <div>
          {pin.approximate
            ? `Approximate area · within about ${APPROXIMATE_CELL_METRES} m`
            : pin.placeLabel || "Selected map location"}
          {pin.approximate && pin.placeLabel && <small>{pin.placeLabel}</small>}
          <small>{formatDistance(distance(center, pin))} from map center</small>
        </div>
      </div>
      {pin.type === "event" && pin.startsAt && (
        <div className="place-row">
          <Clock size={17} aria-hidden="true" />
          <div>
            {formatDate(pin.startsAt)}
            {pin.endsAt && <small>Ends {formatDate(pin.endsAt)}</small>}
          </div>
        </div>
      )}
      {pin.availabilityStart && pin.availabilityEnd && (
        <div className="place-row">
          <Clock size={17} aria-hidden="true" />
          <div>
            Availability
            <small>
              {formatDay(pin.availabilityStart)} — {formatDay(pin.availabilityEnd)} · inclusive
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
      {pin.contactNote && <p className="notice">Contact / meeting note: {pin.contactNote}</p>}
      {pin.hours && <p className="notice">Hours / access: {pin.hours}</p>}
      {pin.expiresAt && (
        <p className="form-caption">
          {status === "archived" ? "Expired" : "Expires"} {formatDate(pin.expiresAt)}
        </p>
      )}
      <div className="author-line">
        <span className="avatar" aria-hidden="true">
          {authorName.slice(0, 1).toUpperCase()}
        </span>
        <div>
          Shared by <strong>{isAuthor ? "you" : authorName}</strong>
          {pin.authorVerified && (
            <span className="verified-badge" title="Verified student email">
              <BadgeCheck size={14} /> Verified student
            </span>
          )}
          <small>
            {formatDate(pin.createdAt, { month: "short", day: "numeric" })}
            {pin.authorHelped > 0 && ` · helped ${pin.authorHelped} ${pin.authorHelped === 1 ? "time" : "times"}`}
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

      {live && (isAuthor || isHelper) && (
        <section className="claim-panel" aria-label="Response">
          {isAuthor && claim && (
            <p>
              <strong>{claim.helperName}</strong>{" "}
              {pin.status === "claimed"
                ? isRequest(pin.type)
                  ? "offered to help."
                  : "is interested."
                : "is helping with this."}
              {claim.helperHelped > 0 && (
                <small>
                  Has helped {claim.helperHelped} {claim.helperHelped === 1 ? "time" : "times"} before.
                </small>
              )}
            </p>
          )}
          {isAuthor && !claim && <p>Someone responded to this pin.</p>}
          {isHelper && (
            <p>
              {pin.status === "claimed"
                ? `Waiting for ${authorName} to accept your offer.`
                : `${authorName} accepted. Coordinate below, then mark it done.`}
            </p>
          )}
          {claim && <Conversation claim={claim} pinId={pin.id} userId={userId} onError={onError} />}
        </section>
      )}

      <div className="detail-actions">
        {actionButton(
          "claim",
          <>
            {busy !== "claim" && <HandHeart size={18} />}
          {isRequest(pin.type) ? "I can help" : "I’m interested"}
          </>, "primary full",
        )}
        {canOfferSignedOut && (
          <button
            className="primary full"
            onClick={() =>
              onError({ signIn: true, message: "Sign in to respond. It only takes an email." })
            }
          >
            <HandHeart size={18} />
            {isRequest(pin.type) ? "I can help" : "I’m interested"}
          </button>
        )}
        {actionButton(
          "accept",
          <>
            {busy !== "accept" && <Check size={18} />} Accept offer
          </>, "primary full",
        )}
        {actionButton(
          "complete",
          <>
            {busy !== "complete" && <Check size={18} />} Mark as done
          </>, "primary full",
        )}
        {actionButton(
          "decline",
          <>
            {pin.status === "active" ? "Remove helper & reopen" : "Decline offer"}
          </>,
        )}
        {actionButton(
          "withdraw",
          <>
            Withdraw my offer
          </>,
        )}
        {actionButton(
          "reopen",
          <>
            {busy !== "reopen" && <RotateCcw size={16} />} Reopen
          </>,
        )}
        <button className="secondary full" onClick={onNavigate}>
          <Navigation size={17} /> Navigate here
        </button>
        {!pin.sample && (
          <div className="reaction-row">
            <button
              className={isSaved ? "active" : ""}
              aria-pressed={isSaved}
              disabled={busy === "save"}
              onClick={() =>
                run("save", async () => {
                  const saved = await usePins.getState().toggle("save", pin.id);
                  notify(saved ? "Saved. Find it under the Saved filter." : "Removed from your saved pins.");
                })
              }
            >
              <Bookmark size={17} />{" "}
              {busy === "save" ? (isSaved ? "Removing…" : "Saving…") : isSaved ? "Saved" : "Save"}
            </button>
            {!isAuthor && (
              <button
                className={isConfirmed ? "active" : ""}
                aria-pressed={isConfirmed}
                disabled={busy === "confirm"}
                title="Confirm this pin is still accurate"
                onClick={() =>
                  run("confirm", async () => {
                    const confirmed = await usePins.getState().toggle("confirm", pin.id);
                    notify(confirmed ? "Thanks for confirming this pin." : "Confirmation removed.");
                  })
                }
              >
                <Check size={17} /> {busy === "confirm" ? "Updating…" : "Still accurate"} · {pin.confirmations}
              </button>
            )}
          </div>
        )}
        <button
          className="text-button"
          disabled={busy === "share"}
          onClick={async () => {
            const link = new URL("/p/" + pin.id, window.location.origin).href;
            setBusy("share");
            try {
              if (navigator.share && matchMedia("(pointer: coarse)").matches) {
                await navigator.share({ title: pin.title, url: link });
                return;
              }
              if (!navigator.clipboard) throw new Error("Clipboard unavailable");
              await navigator.clipboard.writeText(link);
              notify("Link copied. Anyone with the link can open this pin.");
            } catch (error) {
              if (error?.name !== "AbortError") {
                notify(`Couldn’t copy the link. Copy it from the address bar instead: ${link}`, "error");
              }
            } finally {
              setBusy("");
            }
          }}
        >
          <Share2 size={15} /> Share pin link
        </button>
        {actionButton(
          "cancel",
          <>
            <X size={15} /> Cancel this pin
          </>, "text-button",
        )}
        {actions.includes("delete") && (
          <button className="text-button danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} /> Delete my pin
          </button>
        )}
      </div>
      {!isAuthor && !pin.sample && (
        <div className="safety-actions">
          <button
            className="text-button"
            onClick={() => {
              if (!userId) {
                onError({ signIn: true, message: "Sign in to report pins, so reports can’t be spammed." });
                return;
              }
              setReportError("");
              setReporting(true);
            }}
          >
            Report this pin
          </button>
          <button
            className="text-button danger"
            onClick={() => {
              if (!userId) {
                onError({ signIn: true, message: "Sign in to block neighbors." });
                return;
              }
              setConfirmBlock(true);
            }}
          >
            Block {authorName}
          </button>
        </div>
      )}
      <Dialog
        open={reporting}
        onClose={() => setReporting(false)}
        title="Report this pin"
        description="Tell us what needs attention. Reports go to PinDrop moderators; pins reported by several people are hidden until reviewed."
      >
        <label className="sr-only" htmlFor="report-reason">
          Report reason
        </label>
        <textarea
          id="report-reason"
          className="report-input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={4}
          aria-describedby="report-error"
        />
        <p id="report-error" className="field-error" role="alert">
          {reportError}
        </p>
        <button
          className="primary full"
          disabled={busy === "report" || reason.trim().length < 3}
          onClick={async () => {
            setBusy("report");
            setReportError("");
            try {
              await usePins.getState().report(pin.id, reason);
              setReporting(false);
              setReason("");
              notify("Report sent. Thank you for looking out for the neighborhood.");
            } catch (error) {
              if (error.signIn) onError(error);
              else setReportError(error.message);
            } finally {
              setBusy("");
            }
          }}
        >
          {busy === "report" ? "Sending…" : "Submit report"}
        </button>
      </Dialog>
      <Dialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title={`Block ${authorName}?`}
        description="You won’t see their pins, and neither of you can respond to or message the other. You can unblock them in Settings."
      >
        <div className="dialog-actions">
          <button className="secondary" onClick={() => setConfirmBlock(false)}>
            Keep
          </button>
          <button
            className="primary danger-fill"
            disabled={busy === "block"}
            onClick={() =>
              run("block", async () => {
                await usePins.getState().block(pin.authorId, authorName);
                setConfirmBlock(false);
                onClose();
                notify(`${authorName} is blocked on all your devices.`);
              })
            }
          >
            {busy === "block" ? "Blocking…" : "Block"}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this pin?"
        description="It will be removed from the map for everyone."
      >
        <div className="dialog-actions">
          <button className="secondary" onClick={() => setConfirmDelete(false)}>
            Keep pin
          </button>
          <button className="primary danger-fill" disabled={busy === "delete"} onClick={() => doAction("delete")}>
            {busy === "delete" ? "Deleting…" : "Delete pin"}
          </button>
        </div>
      </Dialog>
    </article>
  );
}

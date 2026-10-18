"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Gift,
  HandHeart,
  ImagePlus,
  LoaderCircle,
  MapPin,
  MapPinned,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { DateTimePicker, CalendarField } from "./Calendar";
import Dialog from "./Dialog";
import { MeetingTags, SkillsPicker } from "./TagPicker";
import {
  COMMUNITY_CATEGORIES,
  PAYMENT_LABELS,
  PIN_TYPES,
  URGENCY_LABELS,
} from "@/lib/constants";
import { addDays, today } from "@/lib/dates";
import {
  APPROXIMATE_CELL_METRES,
  groupsForType,
  preparePhoto,
  PRIVATE_BY_DEFAULT,
  validateDraft,
} from "@/lib/pins";

const TYPE_ICONS = [HandHeart, Gift, CalendarDays, MapPinned, TriangleAlert];
const STEP_ONE_FIELDS = ["title", "category", "description"];

// Sensitive categories (home, care, wellness) start with an approximate
// location; switching away restores the person's own choice.
function privacyDefault(groupId, current) {
  if (PRIVATE_BY_DEFAULT.includes(groupId)) return true;
  return current.approximateChosen ?? false;
}

// `initial` pre-fills the form, e.g. with a pin drafted by PinDrop AI.
export default function CreatePinDialog({ open, onClose, center, onPlace, initial }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(() => {
    const start = {
      type: "requesting",
      communityCategory: "everyday",
      category: COMMUNITY_CATEGORIES[0].items[0],
      title: "",
      description: "",
      placeLabel: "",
      payment: "free",
      currency: "USD",
      urgency: "flexible",
      approximate: false,
      skills: [],
      contactTags: [],
    };
    if (!initial) return start;
    const merged = { ...start, ...initial };
    return { ...merged, approximate: privacyDefault(merged.communityCategory, merged) };
  });
  const [errors, setErrors] = useState({});
  const [customDates, setCustomDates] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const heading = useRef(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.current?.closest(".dialog-card")?.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }, [step]);

  const setField = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };
  const field = (name) => ({
    value: values[name] ?? "",
    onChange: (event) => setField(name, event.target.value),
  });

  const { type, payment } = values;
  const groups = groupsForType(type);
  const group = groups.find((g) => g.id === values.communityCategory) || groups[0];
  const needsVerificationNote = ["home", "care", "wellness"].includes(group.id);
  const timingHasError = !!(
    errors.amount ||
    errors.exchangeDetails ||
    errors.endsAt ||
    errors.expiresAt ||
    errors.availabilityEnd
  );

  function chooseType(nextType) {
    const nextGroups = groupsForType(nextType);
    const nextGroup =
      nextGroups.find((g) => g.id === values.communityCategory) || nextGroups[0];
    setValues((current) => ({
      ...current,
      type: nextType,
      communityCategory: nextGroup.id,
      approximate: privacyDefault(nextGroup.id, current),
      category: nextGroup.items.includes(current.category)
        ? current.category
        : nextGroup.items[0],
    }));
    setErrors((current) => ({ ...current, category: undefined }));
  }

  function onSubmit(event) {
    event.preventDefault();
    const found = validateDraft({ ...values, ...center });
    if (step === 0) {
      const stepErrors = Object.fromEntries(
        STEP_ONE_FIELDS.filter((name) => found[name]).map((name) => [name, found[name]]),
      );
      setErrors(stepErrors);
      if (!Object.keys(stepErrors).length) setStep(1);
      return;
    }
    if (customDates && (!values.availabilityStart || !values.availabilityEnd)) {
      found.availabilityEnd = "Choose both a start and end date";
    }
    setErrors(found);
    if (Object.keys(found).length) {
      if (STEP_ONE_FIELDS.some((name) => found[name])) setStep(0);
      return;
    }
    onPlace({ ...values, ...center });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Drop a pin"
      description={
        step === 0
          ? "Start with a title and a category. Everything else can wait."
          : type === "event"
            ? "Set your event dates. Add other details if useful."
            : "Only add what’s useful. You can go straight to the map."
      }
      className="create-pin-dialog"
    >
      <form className="pin-form pin-wizard" onSubmit={onSubmit} noValidate>
        <ol className="creation-progress" aria-label="Pin creation progress">
          <li className={step === 0 ? "current" : "complete"} aria-current={step === 0 ? "step" : undefined}>
            <span>{step === 1 ? <Check size={13} /> : "1"}</span>
            Your pin
          </li>
          <li className={step === 1 ? "current" : ""} aria-current={step === 1 ? "step" : undefined}>
            <span>2</span>
            Details <small>optional</small>
          </li>
        </ol>
        <div className="wizard-heading sr-only">
          <h3 tabIndex={-1} ref={heading}>
            {step === 0 ? "What would you like to share?" : "Add a little more context"}
          </h3>
          <p>
            {step === 0
              ? "Choose a type and tell neighbors what’s happening."
              : type === "event"
                ? "Set your event dates. Everything else is optional."
                : "Your pin is ready. Add what’s useful, or go straight to the map."}
          </p>
        </div>

        {step === 0 ? (
          <div className="wizard-step panel-enter">
            <div className="type-options expanded-types" role="group" aria-label="Pin type">
              {PIN_TYPES.map((pinType, index) => {
                const Icon = TYPE_ICONS[index];
                return (
                  <button
                    key={pinType.id}
                    type="button"
                    className={type === pinType.id ? "chosen" : ""}
                    onClick={() => chooseType(pinType.id)}
                    title={pinType.description}
                    aria-pressed={type === pinType.id}
                  >
                    <Icon size={21} />
                    <span>{pinType.label}</span>
                  </button>
                );
              })}
            </div>
            {type === "alert" && (
              <p className="notice">
                Community alerts are not monitored by emergency dispatch. Use
                local emergency services for immediate danger.
              </p>
            )}
            <div className="form-columns category-columns">
              <label>
                Community category
                <select
                  value={group.id}
                  onChange={(event) => {
                    const next = groups.find((g) => g.id === event.target.value);
                    setValues((current) => ({
                      ...current,
                      communityCategory: next.id,
                      category: next.items[0],
                      approximate: privacyDefault(next.id, current),
                    }));
                  }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What kind of {type === "offering" ? "offer" : type === "place" ? "resource" : "pin"}?
                <select {...field("category")}>
                  {group.items.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <span className="field-error" role="alert">{errors.category}</span>
              </label>
            </div>
            <label>
              A short title
              <input
                {...field("title")}
                maxLength={80}
                aria-invalid={!!errors.title}
                autoFocus
                placeholder={
                  type === "offering"
                    ? "What can you offer?"
                    : type === "requesting"
                      ? "What could use a little help?"
                      : "Give your pin a useful title"
                }
              />
              <span className="field-error" role="alert">{errors.title}</span>
            </label>
            <label>
              Description <small>optional</small>
              <textarea
                {...field("description")}
                rows={2}
                maxLength={1000}
                placeholder="What should someone know before responding?"
              />
            </label>
          </div>
        ) : (
          <div className="wizard-step panel-enter">
            <div className="draft-summary">
              <span className="draft-summary-icon">
                <MapPin size={19} />
              </span>
              <div>
                <strong>{values.title}</strong>
                <small>
                  {group.label} · {values.category}
                </small>
              </div>
              <button type="button" className="text-button" onClick={() => setStep(0)}>
                Edit
              </button>
            </div>

            <details className="creation-disclosure" open={type === "event" || timingHasError ? true : undefined}>
              <summary>
                <Clock size={18} />
                <span>
                  <strong>Timing &amp; exchange</strong>
                  <small>
                    {type === "event"
                      ? "Event dates required"
                      : `${customDates ? "Custom dates" : URGENCY_LABELS[values.urgency || "flexible"]} · ${PAYMENT_LABELS[payment || "free"]}`}
                  </small>
                </span>
                <ChevronDown size={17} />
              </summary>
              <div className="disclosure-body">
                <div className="form-columns">
                  <label>
                    Payment or exchange
                    <select {...field("payment")}>
                      {Object.entries(PAYMENT_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    When is it needed?
                    <select
                      value={customDates ? "custom" : values.urgency || "flexible"}
                      onChange={(event) => {
                        const custom = event.target.value === "custom";
                        setCustomDates(custom);
                        setValues((current) => ({
                          ...current,
                          urgency: custom ? "flexible" : event.target.value,
                          ...(custom ? {} : { availabilityStart: undefined, availabilityEnd: undefined }),
                        }));
                        setErrors((current) => ({ ...current, availabilityEnd: undefined }));
                      }}
                    >
                      {Object.entries(URGENCY_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                      <option value="custom">Custom date range…</option>
                    </select>
                  </label>
                </div>
                {customDates && (
                  <div className="availability-field">
                    <CalendarField
                      label="Available / needed from — to"
                      range
                      start={values.availabilityStart}
                      end={values.availabilityEnd}
                      onChange={(start, end) => {
                        setValues((current) => ({
                          ...current,
                          availabilityStart: start,
                          availabilityEnd: end,
                        }));
                        setErrors((current) => ({ ...current, availabilityEnd: undefined }));
                      }}
                    />
                    <p className="form-caption">
                      Choose a start date and an end date. Both days are included.
                    </p>
                    <p className="field-error" role="status">
                      {errors.availabilityEnd}
                    </p>
                  </div>
                )}
                {payment === "paid" && (
                  <div className="form-columns">
                    <label>
                      Amount
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={values.amount ?? ""}
                        onChange={(event) =>
                          setField(
                            "amount",
                            event.target.value === "" ? undefined : Number(event.target.value),
                          )
                        }
                      />
                      <span className="field-error" role="alert">{errors.amount}</span>
                    </label>
                    <label>
                      Currency
                      <select {...field("currency")}>
                        {["USD", "EUR", "GBP", "CAD"].map((code) => (
                          <option key={code}>{code}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {(payment === "barter" || payment === "timeCredit") && (
                  <label>
                    Exchange terms
                    <input
                      {...field("exchangeDetails")}
                      maxLength={300}
                      placeholder={
                        payment === "timeCredit"
                          ? "e.g. 1 hour of help in exchange for 1 hour later"
                          : "e.g. Guitar lessons for cooking lessons"
                      }
                    />
                    <span className="field-error" role="alert">{errors.exchangeDetails}</span>
                  </label>
                )}
                {payment && payment !== "free" && (
                  <p className="form-caption">
                    Arrange payment or exchanges with your neighbor. PinDrop
                    doesn’t process payments.
                  </p>
                )}
                {type === "event" && (
                  <div className="event-date-fields">
                    <DateTimePicker
                      label="Event starts"
                      value={values.startsAt}
                      defaultTime="09:00"
                      onChange={(value) => setField("startsAt", value)}
                    />
                    <DateTimePicker
                      label="Event ends"
                      value={values.endsAt}
                      defaultTime="17:00"
                      min={values.startsAt?.slice(0, 10)}
                      onChange={(value) => setField("endsAt", value)}
                    />
                    <p className="field-error" role="alert">{errors.endsAt}</p>
                  </div>
                )}
                <section className="listing-fieldset expiry-field">
                  <DateTimePicker
                    label="Expires"
                    value={values.expiresAt}
                    onChange={(value) => setField("expiresAt", value)}
                  />
                  <div className="expiry-shortcuts">
                    {[
                      ["Tomorrow", 1],
                      ["In 7 days", 7],
                      ["In 30 days", 30],
                    ].map(([label, days]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setField("expiresAt", addDays(today(), days) + "T23:59")}
                      >
                        {label}
                      </button>
                    ))}
                    <button type="button" onClick={() => setField("expiresAt", undefined)}>
                      Use default
                    </button>
                  </div>
                  <p className="form-caption">
                    Optional · requests default to 7 days; alerts to 24 hours. A
                    custom date range stays visible through its last day unless
                    you choose an earlier expiry.
                  </p>
                  <p className="field-error" role="alert">{errors.expiresAt}</p>
                </section>
              </div>
            </details>

            <details className="creation-disclosure">
              <summary>
                <Sparkles size={18} />
                <span>
                  <strong>Skills &amp; qualifications</strong>
                  <small>
                    {values.skills.length
                      ? `${values.skills.length} tags added`
                      : "Show what you can bring"}
                  </small>
                </span>
                <ChevronDown size={17} />
              </summary>
              <div className="disclosure-body">
                <SkillsPicker
                  category={values.category}
                  group={group.id}
                  value={values.skills}
                  onChange={(skills) => setField("skills", skills)}
                />
                {needsVerificationNote && (
                  <p className="notice">
                    <ShieldCheck size={17} />
                    Qualifications are self-reported. Discuss requirements
                    before arranging care or work in a home.
                  </p>
                )}
              </div>
            </details>

            <details className="creation-disclosure">
              <summary>
                <MessageCircle size={18} />
                <span>
                  <strong>Meeting &amp; location</strong>
                  <small>
                    {values.contactTags.length
                      ? `${values.contactTags.length} meeting preferences`
                      : "Meeting preferences, notes & privacy"}
                  </small>
                </span>
                <ChevronDown size={17} />
              </summary>
              <div className="disclosure-body">
                {type === "place" && (
                  <label>
                    Opening hours / access details
                    <input
                      {...field("hours")}
                      maxLength={200}
                      placeholder="e.g. Daily, 8 am–6 pm · accessible entrance on east side"
                    />
                  </label>
                )}
                <MeetingTags
                  value={values.contactTags}
                  onChange={(tags) => setField("contactTags", tags)}
                />
                <label>
                  Additional contact / meeting note <small>optional · public</small>
                  <input
                    {...field("contactNote")}
                    maxLength={200}
                    placeholder="e.g. Meet at the campus information desk"
                  />
                </label>
                <label>
                  Place description <small>optional</small>
                  <input
                    {...field("placeLabel")}
                    maxLength={150}
                    placeholder="Near the library entrance…"
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={values.approximate}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        approximate: event.target.checked,
                        approximateChosen: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    Show an approximate location
                    <small>
                      Your exact spot never leaves this device: neighbors see a
                      random point within about {APPROXIMATE_CELL_METRES} m. Keep
                      addresses out of your description.
                    </small>
                  </span>
                </label>
              </div>
            </details>

            <details className="creation-disclosure" open={photoError ? true : undefined}>
              <summary>
                <ImagePlus size={18} />
                <span>
                  <strong>Add a photo</strong>
                  <small>
                    {values.photo ? "1 photo added" : "Help neighbors see what you mean"}
                  </small>
                </span>
                <ChevronDown size={17} />
              </summary>
              <div className="disclosure-body">
                <label className="photo-picker">
                  <ImagePlus size={20} />
                  <span>
                    {values.photo ? "Photo added · metadata removed" : "Add a photo"}
                    <small>Optional · JPEG, PNG, WebP or HEIC · location data removed</small>
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    disabled={photoBusy}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setPhotoBusy(true);
                      setPhotoError("");
                      try {
                        const { blob, previewUrl } = await preparePhoto(file);
                        if (values.photoPreview) URL.revokeObjectURL(values.photoPreview);
                        setValues((current) => ({ ...current, photo: blob, photoPreview: previewUrl }));
                      } catch (error) {
                        setPhotoError(error.message);
                      } finally {
                        setPhotoBusy(false);
                      }
                    }}
                  />
                </label>
                {values.photoPreview && (
                  <div className="photo-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={values.photoPreview} alt="Selected photo preview" />
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        URL.revokeObjectURL(values.photoPreview);
                        setValues((current) => ({ ...current, photo: undefined, photoPreview: undefined }));
                      }}
                    >
                      Remove photo
                    </button>
                  </div>
                )}
                <p className="field-error" role="alert">
                  {photoError}
                </p>
              </div>
            </details>
          </div>
        )}

        <footer className="wizard-footer">
          {step === 1 ? (
            <button type="button" className="wizard-back" onClick={() => setStep(0)}>
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <span className="wizard-footer-note">Next: optional details.</span>
          )}
          <button className="primary" disabled={photoBusy}>
            {photoBusy ? (
              <LoaderCircle size={17} className="spin" />
            ) : step === 1 ? (
              <MapPin size={17} />
            ) : null}
            {step === 0 ? "Continue" : "Choose location"}
            <ArrowRight size={16} />
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

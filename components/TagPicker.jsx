"use client";

import { useId, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { MEETING_TAG_GROUPS, PROFESSIONS } from "@/lib/constants";
import { mergeTags, suggestProfession } from "@/lib/pins";

export function TagPicker({ label, selected, onChange, groups, limit }) {
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const inputId = useId();

  const toggle = (tag) =>
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : mergeTags(selected, [tag], limit),
    );

  function addCustom() {
    if (!custom.trim()) return;
    if (selected.length >= limit) {
      setError(`You can select up to ${limit} tags.`);
      return;
    }
    const tags = custom
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.some((tag) => tag.length > 60)) {
      setError("Keep each tag to 60 characters or fewer.");
      return;
    }
    const next = mergeTags(selected, tags, Number.MAX_SAFE_INTEGER);
    if (next.length > limit) {
      setError(
        `You can select up to ${limit} tags. Remove a tag or add fewer at once.`,
      );
      return;
    }
    onChange(next);
    setCustom("");
    setError("");
  }

  return (
    <div className="tag-picker" role="group" aria-label={label}>
      <div className="selected-tags" aria-live="polite">
        {selected.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            aria-label={`Remove ${tag}`}
          >
            <span>{tag}</span>
            <X size={13} />
          </button>
        ))}
        {!selected.length && (
          <span className="form-caption">
            Choose a few tags below or add your own.
          </span>
        )}
      </div>
      {groups.map((group) => (
        <div className="tag-suggestions" key={group.label}>
          <span className="tag-group-label">{group.label}</span>
          <div>
            {group.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={selected.includes(tag)}
                disabled={!selected.includes(tag) && selected.length >= limit}
                onClick={() => toggle(tag)}
              >
                {selected.includes(tag) && <Check size={12} />} {tag}
              </button>
            ))}
          </div>
        </div>
      ))}
      <label htmlFor={inputId} className="form-label">
        Custom {label.toLowerCase()}{" "}
        <small>
          {selected.length}/{limit}
        </small>
      </label>
      <div className="custom-tag-row">
        <input
          id={inputId}
          value={custom}
          maxLength={240}
          placeholder="Add a tag, or several separated by commas"
          onChange={(event) => {
            setCustom(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustom();
            }
          }}
        />
        <button
          type="button"
          className="secondary"
          disabled={!custom.trim() || selected.length >= limit}
          onClick={addCustom}
        >
          <Plus size={16} />
          Add
        </button>
      </div>
      {error && (
        <p className="field-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

export function SkillsPicker({ category, group, value, onChange }) {
  const [choice, setChoice] = useState("auto");
  const suggested = suggestProfession(category, group);
  const profession =
    PROFESSIONS.find((p) => p.id === (choice === "auto" ? suggested : choice)) ||
    PROFESSIONS[0];

  return (
    <section className="listing-fieldset">
      <h3>
        Skills or qualifications <small>optional · self-reported</small>
      </h3>
      <label>
        Profession / area of expertise
        <select value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="auto">
            Suggested for this category ·{" "}
            {PROFESSIONS.find((p) => p.id === suggested)?.label}
          </option>
          {PROFESSIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <TagPicker
        label="Skills"
        selected={value}
        onChange={onChange}
        limit={16}
        groups={[
          { label: "Skills", tags: profession.skills },
          {
            label: "Qualifications · select only those that apply",
            tags: profession.qualifications,
          },
        ]}
      />
      <p className="form-caption">
        Switch professions to combine skills from different areas.
        Qualifications are self-reported.
      </p>
    </section>
  );
}

export function MeetingTags({ value, onChange }) {
  return (
    <section className="listing-fieldset">
      <h3>
        Contact / meeting tags <small>optional · public</small>
      </h3>
      <TagPicker
        label="Meeting tags"
        selected={value}
        onChange={onChange}
        groups={MEETING_TAG_GROUPS}
        limit={8}
      />
    </section>
  );
}

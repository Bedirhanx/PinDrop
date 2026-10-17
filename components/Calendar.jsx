"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  addDays,
  addMonths,
  formatDay,
  fromDay,
  monthGrid,
  monthStart,
  nextRange,
  today,
} from "@/lib/dates";

function CalendarMonth({ month, start, end, range, min, onChoose }) {
  const days = monthGrid(month);
  const now = today();
  const initialFocus = () =>
    start && start.slice(0, 7) === month.slice(0, 7)
      ? start
      : month > min
        ? month
        : min;
  const [focused, setFocused] = useState(initialFocus);
  const grid = useRef(null);

  useEffect(() => {
    setFocused(initialFocus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function onKeyDown(event, day) {
    const moves = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -fromDay(day).getDay(),
      End: 6 - fromDay(day).getDay(),
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    let target = addDays(day, moves[event.key]);
    if (target < min) target = min;
    const button = grid.current?.querySelector(`[data-day="${target}"]`);
    if (button && !button.disabled) {
      setFocused(target);
      button.focus();
    }
  }

  return (
    <div className="calendar-month" ref={grid}>
      <h4>
        {fromDay(month).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })}
      </h4>
      <div className="calendar-weekdays" aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
      <div className="calendar-days">
        {days.map((day) => {
          const inMonth = day.slice(0, 7) === month.slice(0, 7);
          const selected = day === start || day === end;
          const between = !!(range && start && end && day > start && day < end);
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              tabIndex={focused === day ? 0 : -1}
              disabled={day < min || !inMonth}
              className={[
                inMonth ? "" : "outside",
                selected ? "selected" : "",
                between ? "between" : "",
                day === start ? "range-start" : "",
                day === end ? "range-end" : "",
                day === now ? "today" : "",
              ].join(" ")}
              aria-label={fromDay(day).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              aria-pressed={selected}
              aria-current={day === now ? "date" : undefined}
              onKeyDown={(event) => onKeyDown(event, day)}
              onClick={() => {
                setFocused(day);
                onChoose(day);
              }}
            >
              {inMonth ? fromDay(day).getDate() : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarField({
  label,
  start,
  end,
  range = false,
  onChange,
  min = today(),
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(start || min));
  const id = useId();

  function choose(day) {
    if (range) {
      const [nextStart, nextEnd] = nextRange(start, end, day);
      onChange(nextStart, nextEnd);
    } else {
      onChange(day);
    }
  }

  const summary = range
    ? start
      ? `${formatDay(start)} → ${end ? formatDay(end) : "Choose end date"}`
      : "Choose start and end dates"
    : start
      ? formatDay(start)
      : "Choose a date";

  return (
    <div className="calendar-field">
      <span className="form-label" id={id + "-label"}>
        {label}
      </span>
      <button
        type="button"
        className={"calendar-trigger " + (open ? "is-open" : "")}
        aria-expanded={open}
        aria-controls={id}
        aria-labelledby={id + "-label " + id + "-value"}
        onClick={() => {
          if (!open) setMonth(monthStart(start || min));
          setOpen(!open);
        }}
      >
        <CalendarDays size={17} />
        <span id={id + "-value"}>{summary}</span>
        <ChevronRight size={15} className={open ? "turned" : ""} />
      </button>
      {open && (
        <section
          className="calendar-popover panel-enter"
          id={id}
          aria-labelledby={id + "-label"}
        >
          <div className="calendar-toolbar">
            <span>
              {range
                ? start && !end
                  ? "Select an end date"
                  : "Select an availability range"
                : "Select a date"}
            </span>
            <div>
              <button
                type="button"
                aria-label="Previous month"
                disabled={month <= monthStart(min)}
                onClick={() => setMonth(addMonths(month, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setMonth(addMonths(month, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className={"calendar-months " + (range ? "two-months" : "")}>
            <CalendarMonth
              month={month}
              start={start}
              end={end}
              range={range}
              min={min}
              onChoose={choose}
            />
            {range && (
              <CalendarMonth
                month={addMonths(month, 1)}
                start={start}
                end={end}
                range
                min={min}
                onChoose={choose}
              />
            )}
          </div>
          <p className="calendar-selection" aria-live="polite">
            {start
              ? summary
              : range
                ? "Choose a start date, then an end date."
                : "Choose when this pin should expire."}
          </p>
          <div className="calendar-footer">
            <button
              type="button"
              className="text-button"
              onClick={() => onChange(undefined, undefined)}
            >
              <X size={13} />
              Clear dates
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!start || (range && !end)}
              onClick={() => setOpen(false)}
            >
              <Check size={14} />
              Done
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// A date plus hour/minute, stored as "YYYY-MM-DDTHH:MM" local time.
export function DateTimePicker({
  label,
  value,
  onChange,
  defaultTime = "23:59",
  min,
}) {
  const day = value?.slice(0, 10);
  const time = value?.slice(11, 16) || defaultTime;
  const [hour, minute] = time.split(":");
  const minutes = [...new Set(["00", "15", "30", "45", "59", minute])].sort();
  const setTime = (h, m) => {
    if (day) onChange(day + "T" + h + ":" + m);
  };

  return (
    <div className="date-time-picker">
      <CalendarField
        label={label}
        start={day}
        min={min}
        onChange={(next) => onChange(next ? next + "T" + time : undefined)}
      />
      {day && (
        <div className="time-controls">
          <span>Local time</span>
          <select
            aria-label={label + " hour"}
            value={hour}
            onChange={(event) => setTime(event.target.value, minute)}
          >
            {Array.from({ length: 24 }, (_, h) =>
              String(h).padStart(2, "0"),
            ).map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <b>:</b>
          <select
            aria-label={label + " minute"}
            value={minute}
            onChange={(event) => setTime(hour, event.target.value)}
          >
            {minutes.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
        </div>
      )}
    </div>
  );
}

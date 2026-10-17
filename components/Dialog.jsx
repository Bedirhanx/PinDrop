"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// Open dialogs, newest last, so Escape and Tab only affect the top one.
const stack = [];

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className = "",
}) {
  const card = useRef(null);
  const close = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const self = {};
    stack.push(self);
    card.current?.focus();

    const onKey = (event) => {
      if (stack.at(-1) !== self) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
        return;
      }
      // Keep keyboard focus inside the dialog.
      if (event.key === "Tab" && card.current) {
        const items = [...card.current.querySelectorAll(FOCUSABLE)].filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        );
        if (!items.length) return;
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(self), 1);
      if (previous?.isConnected) previous.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <div
        ref={card}
        className={"dialog-card " + className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">PINDROP / COMMUNITY</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p id={descriptionId} className={description ? "dialog-description" : "sr-only"}>
          {description || title}
        </p>
        {children}
      </div>
    </>,
    document.body,
  );
}

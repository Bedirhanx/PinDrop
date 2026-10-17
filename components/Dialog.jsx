"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className = "",
}) {
  const card = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    card.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p
          id={descriptionId}
          className={description ? "dialog-description" : "sr-only"}
        >
          {description || title}
        </p>
        {children}
      </div>
    </>,
    document.body,
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, MessageCircleQuestion } from "lucide-react";
import { OPEN_EVENT } from "./ChatWidget";

// "Have a question?" box. Opens the AI helper when it's set up on this site,
// otherwise points to the contact form, so the button always works.
export default function AskHelper() {
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((response) => response.json())
      .then((data) => setAvailable(!!data.available))
      .catch(() => setAvailable(false));
  }, []);

  return (
    <div className="ask-helper">
      <MessageCircleQuestion size={26} aria-hidden="true" />
      <div>
        <h3>Have a question?</h3>
        <p>
          {available
            ? "Ask the PinDrop helper how anything works, or get help writing your first pin."
            : "Send us a message and a real person on the team will reply."}
        </p>
      </div>
      {available ? (
        <button className="primary" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
          <MessageCircleQuestion size={16} /> Ask the helper
        </button>
      ) : (
        <Link className="secondary" href="/contact" aria-busy={available === null}>
          <Mail size={16} /> Contact us
        </Link>
      )}
    </div>
  );
}

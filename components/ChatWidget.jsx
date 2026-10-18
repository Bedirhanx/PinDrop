"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, MapPin, PenLine, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { isMapPath, storeDraft } from "@/lib/ai-draft";

export const OPEN_EVENT = "pindrop:open-helper";

const GREETING =
  "Hi! I’m PinDrop AI. I can find pins for you, write a pin with you, or answer questions about PinDrop.";

const SUGGESTIONS = [
  "Is anyone offering tutoring?",
  "Help me ask for a ride to the airport on Friday",
  "Any events around campus this week?",
  "How is my location kept private?",
];

const TYPE_NAMES = {
  requesting: "Request",
  offering: "Offer",
  event: "Event",
  place: "Place",
  alert: "Alert",
};

// Shows **bold** as bold. Built from text nodes, so nothing is ever parsed
// as HTML.
function Formatted({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((piece, index) =>
    piece.startsWith("**") && piece.endsWith("**") ? (
      <strong key={index}>{piece.slice(2, -2)}</strong>
    ) : (
      <Fragment key={index}>{piece}</Fragment>
    ),
  );
}

// What the assistant said, as plain text for the next request (the server
// only accepts text turns).
function historyText(message) {
  const notes = [];
  if (message.pins) {
    notes.push(
      message.pins.length
        ? `[Showed pins: ${message.pins.map((p) => p.title).join("; ")}]`
        : "[Search found no pins]",
    );
  }
  if (message.draft) notes.push(`[Drafted a pin: ${message.draft.title}]`);
  return [message.content, ...notes].filter(Boolean).join("\n") || "(no reply)";
}

// PinDrop AI. Shown only when the server has an AI key configured, so there
// is never a button that doesn't work.
export default function ChatWidget({ className = "" }) {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((response) => response.json())
      .then((data) => setAvailable(!!data.available))
      .catch(() => {});
  }, []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  // Other parts of the page (e.g. "Ask PinDrop AI" buttons) can open it.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(question) {
    const content = question.trim();
    if (!content || busy) return;
    const history = [...messages, { role: "user", content }];
    let reply = { role: "assistant", content: "" };
    setMessages([...history, reply]);
    setText("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .slice(-19)
            .map((m) => ({ role: m.role, content: m.role === "user" ? m.content : historyText(m) })),
        }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "PinDrop AI couldn’t answer just now.");
      }
      // One JSON event per line: text, pin results, or a drafted pin.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "text") reply = { ...reply, content: reply.content + event.text };
          else if (event.type === "pins") reply = { ...reply, pins: [...(reply.pins || []), ...event.pins] };
          else if (event.type === "draft") reply = { ...reply, draft: event.draft };
          setMessages([...history, reply]);
        }
        if (done) break;
      }
    } catch (failure) {
      setMessages(history.slice(0, -1));
      setText(content);
      setError(
        failure.name === "TypeError" ? "Can’t reach PinDrop AI. Check your connection." : failure.message,
      );
    } finally {
      setBusy(false);
    }
  }

  function reviewDraft(draft) {
    storeDraft(draft);
    setOpen(false);
    // The "Drop a pin" form lives on the map.
    if (!isMapPath(window.location.pathname)) router.push("/");
  }

  if (!available) return null;

  return (
    <div className={"chat-widget " + className}>
      {open && (
        <section className="chat-panel" role="dialog" aria-label="PinDrop AI">
          <header>
            <strong>
              <Sparkles size={15} aria-hidden="true" /> PinDrop AI
            </strong>
            <small>Finds and drafts pins · can make mistakes</small>
            {messages.length > 0 && (
              <button
                className="icon-button chat-new"
                aria-label="Start a new chat"
                title="New chat"
                disabled={busy}
                onClick={() => {
                  setMessages([]);
                  setError("");
                }}
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button className="icon-button" aria-label="Close PinDrop AI" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <div className="chat-messages" ref={list} aria-live="polite">
            <p className="message">{GREETING}</p>
            {!messages.length && (
              <div className="chat-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} onClick={() => send(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={"chat-turn " + message.role}>
                {(message.content || (!message.pins && !message.draft)) && (
                  <p className={message.role === "user" ? "message mine" : "message"}>
                    {message.content ? (
                      <Formatted text={message.content} />
                    ) : (
                      <LoaderCircle size={14} className="spin" aria-label="Thinking" />
                    )}
                  </p>
                )}
                {message.pins?.length > 0 && (
                  <ul className="chat-pins" aria-label="Pins found">
                    {message.pins.map((pin) => (
                      <li key={pin.id}>
                        <Link href={`/p/${pin.id}`} onClick={() => setOpen(window.innerWidth >= 1024)}>
                          <MapPin size={15} aria-hidden="true" />
                          <span>
                            <strong>{pin.title}</strong>
                            <small>
                              {[pin.type, pin.category, pin.place].filter(Boolean).join(" · ")}
                              {pin.sample && " · fictional sample"}
                            </small>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {message.draft && (
                  <div className="chat-draft">
                    <small>
                      Draft · {TYPE_NAMES[message.draft.type] || message.draft.type} · {message.draft.category}
                    </small>
                    <strong>{message.draft.title}</strong>
                    {message.draft.description && <p>{message.draft.description}</p>}
                    <button className="primary" onClick={() => reviewDraft(message.draft)}>
                      <PenLine size={15} /> Review &amp; post
                    </button>
                    <small>Nothing is posted until you place it on the map and publish.</small>
                  </div>
                )}
              </div>
            ))}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <form
            className="message-form"
            onSubmit={(event) => {
              event.preventDefault();
              send(text);
            }}
          >
            <label className="sr-only" htmlFor="chat-input">
              Message PinDrop AI
            </label>
            <input
              id="chat-input"
              ref={input}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={2000}
              placeholder="Find a pin, write one, or ask…"
              autoComplete="off"
            />
            <button className="primary" disabled={busy || !text.trim()} aria-label="Send">
              {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
            </button>
          </form>
        </section>
      )}
      <button
        className="chat-launcher"
        aria-expanded={open}
        aria-label={open ? "Close PinDrop AI" : "Ask PinDrop AI"}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <X size={24} />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand-mark@2x.webp" alt="" width={36} height={36} />
            <span className="chat-launcher-label">
              Ask PinDrop AI
              <Sparkles size={15} aria-hidden="true" />
            </span>
          </>
        )}
      </button>
    </div>
  );
}

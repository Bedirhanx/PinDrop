"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircleQuestion, Send, X } from "lucide-react";

export const OPEN_EVENT = "pindrop:open-helper";

const GREETING =
  "Hi! I can explain how PinDrop works or help you write a clear pin. What do you need?";

const SUGGESTIONS = [
  "How do I offer help on a request?",
  "Help me write a pin asking for a study partner",
  "How is my location kept private?",
];

// A small help assistant. It's shown only when the server has an AI key
// configured, so there is never a button that doesn't work.
export default function ChatWidget({ className = "" }) {
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

  // Other parts of the page (e.g. "Ask the helper" buttons) can open it.
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
    setMessages([...history, { role: "assistant", content: "" }]);
    setText("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-19) }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The assistant couldn’t answer just now.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: reply }]);
      }
    } catch (failure) {
      setMessages(history.slice(0, -1));
      setText(content);
      setError(
        failure.name === "TypeError"
          ? "Can’t reach the assistant. Check your connection."
          : failure.message,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;

  return (
    <div className={"chat-widget " + className}>
      {open && (
        <section className="chat-panel" role="dialog" aria-label="PinDrop helper">
          <header>
            <strong>PinDrop helper</strong>
            <small>AI assistant · can make mistakes</small>
            <button className="icon-button" aria-label="Close helper" onClick={() => setOpen(false)}>
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
              <p key={index} className={message.role === "user" ? "message mine" : "message"}>
                {message.content || <LoaderCircle size={14} className="spin" aria-label="Thinking" />}
              </p>
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
              Ask the PinDrop helper
            </label>
            <input
              id="chat-input"
              ref={input}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={2000}
              placeholder="Ask about PinDrop…"
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
        aria-label={open ? "Close PinDrop helper" : "Ask the PinDrop helper"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <MessageCircleQuestion size={20} />}
      </button>
    </div>
  );
}

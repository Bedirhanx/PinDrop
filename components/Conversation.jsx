"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { fetchMessages, friendlyError, sendMessage, subscribe } from "@/lib/api";

// Messages between a pin's author and the person responding. Only those two
// people can read or write them (enforced by the database).
export default function Conversation({ claim, pinId, userId, onError }) {
  const [messages, setMessages] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchMessages(claim.id)
        .then((next) => {
          if (cancelled) return;
          setMessages(next);
          setLoadError("");
        })
        .catch((error) => !cancelled && setLoadError(friendlyError(error, "Couldn’t load messages.")));
    load();
    const unsubscribe = subscribe("messages", `claim_id=eq.${claim.id}`, load);
    // Live updates can drop on flaky connections, so poll gently as well.
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 15e3);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, [claim.id]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  async function onSubmit(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendMessage(claim.id, pinId, body);
      setText("");
      setMessages(await fetchMessages(claim.id));
    } catch (error) {
      onError(new Error(friendlyError(error, "Couldn’t send your message.")));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="conversation">
      <h3>Messages</h3>
      <div className="message-list" ref={list} aria-live="polite">
        {loadError && <p className="field-error">{loadError}</p>}
        {!messages && !loadError && <p className="form-caption">Loading messages…</p>}
        {messages?.length === 0 && (
          <p className="form-caption">
            No messages yet. Agree on a time and a public place to meet.
          </p>
        )}
        {messages?.map((message) => (
          <p key={message.id} className={message.senderId === userId ? "message mine" : "message"}>
            {message.body}
            <small>
              {message.senderId === userId ? "You" : "Them"} ·{" "}
              {new Date(message.createdAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </small>
          </p>
        ))}
      </div>
      <form className="message-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={`message-${claim.id}`}>
          Write a message
        </label>
        <input
          id={`message-${claim.id}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          placeholder="Write a message…"
          autoComplete="off"
        />
        <button className="primary" disabled={sending || !text.trim()} aria-label="Send message">
          {sending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
        </button>
      </form>
      <p className="form-caption">Keep personal details private until you’re comfortable. Meet in public places.</p>
    </div>
  );
}

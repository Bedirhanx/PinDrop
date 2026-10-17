"use client";

import { useState } from "react";
import { CircleCheck, LoaderCircle, Send } from "lucide-react";
import { friendlyError } from "@/lib/api";
import { backendConfigured, supabase } from "@/lib/supabase";

const TOPICS = [
  ["general", "General question"],
  ["feedback", "Feedback or an idea"],
  ["safety", "Safety concern"],
  ["bug", "Something isn’t working"],
  ["partnership", "Club, class or organization"],
];

export default function ContactForm() {
  const [values, setValues] = useState({ name: "", email: "", topic: "general", message: "", website: "" });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState("idle"); // idle | sending | sent
  const [failure, setFailure] = useState("");
  const field = (name) => ({
    id: `contact-${name}`,
    value: values[name],
    onChange: (event) => {
      setValues({ ...values, [name]: event.target.value });
      setErrors({ ...errors, [name]: undefined });
    },
    "aria-invalid": !!errors[name],
    "aria-describedby": `contact-${name}-error`,
  });

  function validate() {
    const found = {};
    if (!values.name.trim()) found.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) found.email = "Enter a valid email so we can reply.";
    if (values.message.trim().length < 10) found.message = "Write at least 10 characters.";
    return found;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    // Bots fill in the hidden "website" field; people never see it.
    if (values.website) {
      setState("sent");
      return;
    }
    setState("sending");
    setFailure("");
    try {
      const { error } = await supabase()
        .from("contact_messages")
        .insert({
          name: values.name.trim(),
          email: values.email.trim(),
          topic: values.topic,
          message: values.message.trim(),
        });
      if (error) throw error;
      setState("sent");
    } catch (error) {
      setFailure(friendlyError(error, "Couldn’t send your message. Please try again."));
      setState("idle");
    }
  }

  if (!backendConfigured) {
    return (
      <p className="notice">
        The contact form needs PinDrop’s server, which isn’t configured for this site yet.
      </p>
    );
  }

  if (state === "sent") {
    return (
      <div className="form-success" role="status">
        <CircleCheck size={30} />
        <h2>Thanks, {values.name.trim() || "friend"}!</h2>
        <p>Your message is with the PinDrop team. We’ll reply to {values.email.trim()}.</p>
      </div>
    );
  }

  return (
    <form className="site-form" onSubmit={onSubmit} noValidate>
      <div className="form-columns">
        <label htmlFor="contact-name">
          Name
          <input {...field("name")} autoComplete="name" maxLength={80} />
          <span id="contact-name-error" className="field-error" role="alert">
            {errors.name}
          </span>
        </label>
        <label htmlFor="contact-email">
          Email
          <input {...field("email")} type="email" inputMode="email" autoComplete="email" maxLength={254} />
          <span id="contact-email-error" className="field-error" role="alert">
            {errors.email}
          </span>
        </label>
      </div>
      <label htmlFor="contact-topic">
        What’s it about?
        <select {...field("topic")}>
          {TOPICS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="contact-message">
        Message
        <textarea {...field("message")} rows={6} maxLength={3000} />
        <span id="contact-message-error" className="field-error" role="alert">
          {errors.message}
        </span>
      </label>
      <label className="honeypot" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" {...field("website")} />
      </label>
      {failure && (
        <p className="field-error" role="alert">
          {failure}
        </p>
      )}
      <button className="primary" disabled={state === "sending"}>
        {state === "sending" ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
        {state === "sending" ? "Sending…" : "Send message"}
      </button>
      <p className="form-caption">
        For anything urgent or dangerous, call 911. Reporting a specific pin? Use “Report this pin”
        on the pin itself so moderators see it in context.
      </p>
    </form>
  );
}

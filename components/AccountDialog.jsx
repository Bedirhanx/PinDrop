"use client";

import { useState } from "react";
import { BadgeCheck, HandHeart, LoaderCircle, LogOut, Mail, MapPin, UserRound } from "lucide-react";
import Dialog from "./Dialog";
import { usePins, useUi } from "@/lib/store";

// Google sign-in is shown only once it's enabled in Supabase and here.
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true";

function SignInForm({ onError }) {
  const reason = useUi((s) => s.signInReason);
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");
  // Come back to the same pin or page after following the email link.
  const redirectTo = () =>
    window.location.origin + (window.location.pathname === "/account" ? "/" : window.location.pathname);

  async function onSubmit(event) {
    event.preventDefault();
    setState("sending");
    setError("");
    try {
      await usePins.getState().signInWithEmail(email, redirectTo());
      setState("sent");
    } catch (failure) {
      setError(failure.message);
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="sign-in-sent" role="status">
        <Mail size={28} />
        <h3>Check your email</h3>
        <p>
          We sent a sign-in link to <strong>{email.trim()}</strong>. Open it on any device to sign
          in. It expires in an hour.
        </p>
        <button className="text-button" onClick={() => setState("idle")}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <>
      {reason && <p className="notice">{reason}</p>}
      <form className="sign-in-form" onSubmit={onSubmit} noValidate>
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          aria-describedby="sign-in-error"
          required
        />
        <p id="sign-in-error" className="field-error" role="alert">
          {error}
        </p>
        <button className="primary full" disabled={state === "sending" || !email.trim()}>
          {state === "sending" ? <LoaderCircle size={16} className="spin" /> : <Mail size={16} />}
          {state === "sending" ? "Sending link…" : "Email me a sign-in link"}
        </button>
      </form>
      {GOOGLE_ENABLED && (
        <button
          className="secondary full"
          onClick={() => usePins.getState().signInWithGoogle(redirectTo()).catch(onError)}
        >
          Continue with Google
        </button>
      )}
      <p className="form-caption">
        No password needed. Your email is never shown to other neighbors. Your pins, saved places,
        offers and settings follow you to any device.
      </p>
    </>
  );
}

function Profile({ onShowMine, onError }) {
  const profile = usePins((s) => s.profile);
  const user = usePins((s) => s.user);
  const notify = useUi((s) => s.notify);
  const [name, setName] = useState(profile?.name || "");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!profile) {
    return (
      <p className="form-caption" role="status">
        <LoaderCircle size={16} className="spin" /> Loading your account…
      </p>
    );
  }

  return (
    <>
      <div className="account-summary">
        <span className="avatar large" aria-hidden="true">
          {profile.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{profile.name}</strong>
          <small>{user.email}</small>
          {profile.verified ? (
            <span className="verified-badge">
              <BadgeCheck size={14} /> Verified student email
            </span>
          ) : null}
          <small>
            <HandHeart size={13} /> Helped {profile.helped || 0}{" "}
            {profile.helped === 1 ? "time" : "times"}
          </small>
        </div>
      </div>
      <form
        className="profile-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await usePins.getState().updateProfile(name);
            notify("Your display name was updated.");
          } catch (error) {
            onError(error);
          } finally {
            setSaving(false);
          }
        }}
      >
        <label htmlFor="display-name">
          <UserRound size={18} /> Display name
        </label>
        <div>
          <input
            id="display-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            autoComplete="nickname"
            required
          />
          <button className="secondary" disabled={saving || !name.trim() || name.trim() === profile.name}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <small>This is the only name neighbors see.</small>
      </form>
      <button className="secondary full" onClick={onShowMine}>
        <MapPin size={16} /> My pins &amp; offers
      </button>
      <button
        className="text-button"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          try {
            await usePins.getState().signOut();
            notify("Signed out.");
          } catch (error) {
            onError(error);
          } finally {
            setSigningOut(false);
          }
        }}
      >
        <LogOut size={15} /> {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}

export default function AccountDialog({ onClose, onShowMine, onError }) {
  const backend = usePins((s) => s.backend);
  const user = usePins((s) => s.user);
  const authReady = usePins((s) => s.authReady);

  return (
    <Dialog
      open
      onClose={onClose}
      title={user ? "Your account" : "Sign in to PinDrop"}
      description={
        user
          ? "Your name and activity in the community."
          : "Drop pins, offer help and save places on any device."
      }
      className="account-dialog"
    >
      {!backend ? (
        <p className="notice">
          Accounts need PinDrop’s community server, which isn’t configured for this site yet. You
          can still browse the map and sample pins.
        </p>
      ) : !authReady ? (
        <p className="form-caption">
          <LoaderCircle size={16} className="spin" /> Checking your sign-in…
        </p>
      ) : user ? (
        <Profile onShowMine={onShowMine} onError={onError} />
      ) : (
        <SignInForm onError={onError} />
      )}
    </Dialog>
  );
}

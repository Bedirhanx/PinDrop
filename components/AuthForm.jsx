"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, LogOut, Mail, Map } from "lucide-react";
import { friendlyError } from "@/lib/api";
import { signOut, useSession } from "@/lib/session";
import { backendConfigured, supabase } from "@/lib/supabase";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true";

// Passwordless sign-in and sign-up. Both send a one-time email link; sign-up
// also sets the display name neighbors will see.
export default function AuthForm({ mode }) {
  const signUp = mode === "signup";
  const { ready, user } = useSession();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");

  if (!backendConfigured) {
    return <p className="notice">Accounts need PinDrop’s server, which isn’t configured for this site yet.</p>;
  }
  if (!ready) {
    return (
      <p className="form-caption" role="status">
        <LoaderCircle size={16} className="spin" /> Checking your sign-in…
      </p>
    );
  }
  if (user) {
    return (
      <div className="form-success" role="status">
        <h2>You’re signed in.</h2>
        <p>{user.email}</p>
        <div className="hero-actions">
          <Link className="primary" href="/">
            <Map size={16} /> Open the map
          </Link>
          <button className="secondary" onClick={() => signOut()}>
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>
    );
  }
  if (state === "sent") {
    return (
      <div className="form-success" role="status">
        <Mail size={30} />
        <h2>Check your email</h2>
        <p>
          We sent a {signUp ? "link to finish creating your account" : "sign-in link"} to{" "}
          <strong>{email.trim()}</strong>. Open it on any device. It expires in an hour.
        </p>
        <button className="text-button" onClick={() => setState("idle")}>
          Use a different email
        </button>
      </div>
    );
  }

  async function onSubmit(event) {
    event.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    if (signUp && !name.trim()) {
      setError("Choose a display name neighbors will see.");
      return;
    }
    if (signUp && !agree) {
      setError("Please agree to the community guidelines.");
      return;
    }
    setState("sending");
    setError("");
    const { error: failure } = await supabase().auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        shouldCreateUser: signUp,
        ...(signUp ? { data: { full_name: name.trim().slice(0, 40) } } : {}),
      },
    });
    if (failure) {
      setState("idle");
      setError(
        failure.code === "over_email_send_rate_limit"
          ? "PinDrop has reached its email limit for now, so no link was sent. Please try again in an hour."
          : failure.status === 429
            ? "Too many attempts. Wait a minute, then try again."
          : /signups not allowed|user not found/i.test(failure.message)
            ? "No account uses that email yet. Sign up instead."
            : friendlyError(failure, "Couldn’t send the email. Please try again."),
      );
      return;
    }
    setState("sent");
  }

  return (
    <>
      <form className="site-form" onSubmit={onSubmit} noValidate>
        {signUp && (
          <label htmlFor="auth-name">
            Display name
            <input
              id="auth-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              autoComplete="nickname"
              placeholder="How neighbors will see you"
            />
          </label>
        )}
        <label htmlFor="auth-email">
          Email
          <input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        {signUp && (
          <label className="checkbox-row">
            <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
            <span>
              I’ll be kind, keep personal details private, and meet in public places.
              <small>PinDrop doesn’t verify identities or qualifications.</small>
            </span>
          </label>
        )}
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="primary" disabled={state === "sending"}>
          {state === "sending" ? <LoaderCircle size={16} className="spin" /> : <Mail size={16} />}
          {state === "sending" ? "Sending…" : signUp ? "Create my account" : "Email me a sign-in link"}
        </button>
      </form>
      {GOOGLE_ENABLED && (
        <button
          className="secondary full"
          onClick={async () => {
            const { error: failure } = await supabase().auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: `${window.location.origin}/` },
            });
            if (failure) setError(friendlyError(failure, "Couldn’t start Google sign-in."));
          }}
        >
          Continue with Google
        </button>
      )}
      <p className="form-caption auth-switch">
        {signUp ? (
          <>
            Already have an account? <Link href="/signin">Sign in</Link>
          </>
        ) : (
          <>
            New to PinDrop? <Link href="/signup">Create an account</Link>
          </>
        )}
      </p>
    </>
  );
}

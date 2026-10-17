"use client";

// The signed-in user for the public pages (About, Contact, Sign in).
import { useEffect, useState } from "react";
import { backendConfigured, supabase } from "./supabase";

export function useSession() {
  const [state, setState] = useState({ ready: !backendConfigured, user: null });

  useEffect(() => {
    if (!backendConfigured) return;
    const client = supabase();
    client.auth.getSession().then(({ data }) =>
      setState({ ready: true, user: data.session?.user ?? null }),
    );
    const { data } = client.auth.onAuthStateChange((_event, session) =>
      setState({ ready: true, user: session?.user ?? null }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}

export async function signOut() {
  if (backendConfigured) await supabase().auth.signOut();
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Map, Menu, X } from "lucide-react";
import { signOut, useSession } from "@/lib/session";

const LINKS = [
  { href: "/", label: "Map" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
];

export function Brand() {
  return (
    <Link className="brand" href="/">
      <span className="brand-symbol">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand-mark.webp" srcSet="/brand-mark.webp 1x, /brand-mark@2x.webp 2x" alt="" width={35} height={35} />
      </span>
      PinDrop
      <span className="brand-period">.</span>
    </Link>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, user } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <header className="site-header">
      <Brand />
      <button
        className="icon-button site-menu-button"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {menuOpen ? <X size={19} /> : <Menu size={19} />}
      </button>
      <nav id="site-nav" className={"site-nav" + (menuOpen ? " open" : "")} aria-label="Main">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        <span className="site-nav-auth">
          {!ready ? null : user ? (
            <>
              <Link className="primary" href="/">
                <Map size={16} /> Open the map
              </Link>
              <button
                className="secondary"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await signOut();
                  setSigningOut(false);
                  setMenuOpen(false);
                  router.refresh();
                }}
              >
                <LogOut size={16} /> {signingOut ? "Logging out…" : "Log out"}
              </button>
            </>
          ) : (
            <>
              <Link className="secondary" href="/signin" onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
              <Link className="primary" href="/signup" onClick={() => setMenuOpen(false)}>
                Sign up
              </Link>
            </>
          )}
        </span>
      </nav>
    </header>
  );
}

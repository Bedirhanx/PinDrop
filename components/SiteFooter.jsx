import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <strong>
          PinDrop<span className="brand-period">.</span>
        </strong>
        <p>Small acts. Better places. A community map for De Anza &amp; beyond.</p>
      </div>
      <nav aria-label="Footer">
        <div>
          <h2>Explore</h2>
          <Link href="/">Community map</Link>
          <Link href="/about">About us</Link>
          <Link href="/solution">Our solution</Link>
          <Link href="/about#team">Our team</Link>
          <Link href="/about#how-it-works">How it works</Link>
        </div>
        <div>
          <h2>Account</h2>
          <Link href="/signin">Sign in</Link>
          <Link href="/signup">Sign up</Link>
          <Link href="/settings">Settings</Link>
        </div>
        <div>
          <h2>Help</h2>
          <Link href="/contact">Contact us</Link>
          <Link href="/about#safety">Safety &amp; privacy</Link>
        </div>
      </nav>
      <p className="site-footer-note">
        PinDrop doesn’t process payments or verify qualifications, and isn’t an emergency service.
        In an emergency, call 911. Map data © OpenStreetMap contributors.
      </p>
    </footer>
  );
}

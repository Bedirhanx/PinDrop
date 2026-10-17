import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Gift,
  HandHeart,
  MapPin,
  MapPinned,
  MessageCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import Reveal from "@/components/Reveal";

export const metadata = {
  title: "About us",
  description:
    "PinDrop is a community map where neighbors around De Anza College and the Bay Area ask for help, offer it, and share local resources.",
};

const STEPS = [
  { icon: MapPin, title: "Open the map", text: "See what people nearby need and offer, right now." },
  { icon: HandHeart, title: "Respond to a pin", text: "Tap “I can help” or “I’m interested”. The author accepts, and you can message privately." },
  { icon: BadgeCheck, title: "Get it done", text: "Meet up, lend a hand, then mark it done. Every finished pin builds your helping record." },
];

const KINDS = [
  { icon: HandHeart, label: "Requests", text: "Moving a desk, a ride to the store, a study partner." },
  { icon: Gift, label: "Offers", text: "Tutoring, tools to borrow, free textbooks, spare food." },
  { icon: CalendarDays, label: "Events", text: "Cleanups, club meetups, workshops and potlucks." },
  { icon: MapPinned, label: "Places", text: "Food pantries, quiet study spots, accessible entrances." },
  { icon: TriangleAlert, label: "Alerts", text: "Lost pets, hazards and neighborhood updates." },
];

export default function About() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <Reveal as="p" className="eyebrow">
            DE ANZA &amp; BEYOND
          </Reveal>
          <Reveal as="h1" delay={80}>
            Your neighborhood,
            <br />
            <span className="hero-accent">a pin away.</span>
          </Reveal>
          <Reveal as="p" delay={160} className="hero-lead">
            PinDrop is a shared map for small acts of help. Ask for a hand, offer what you can,
            and find the people and places that make a community work.
          </Reveal>
          <Reveal delay={240} className="hero-actions">
            <Link className="primary" href="/">
              Open the map <ArrowRight size={16} />
            </Link>
            <Link className="secondary" href="/signup">
              Create a free account
            </Link>
          </Reveal>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="hero-ring" />
          <span className="hero-ring delay" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-mark@2x.webp" alt="" className="hero-logo" width={192} height={192} />
          <span className="hero-pin p1" style={{ background: "#f4bc6a" }} />
          <span className="hero-pin p2" style={{ background: "#69c8bd" }} />
          <span className="hero-pin p3" style={{ background: "#ee9cbd" }} />
          <span className="hero-pin p4" style={{ background: "#b6a0f5" }} />
        </div>
      </section>

      <section className="site-section" id="how-it-works">
        <Reveal as="h2">How it works</Reveal>
        <ol className="steps">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <Reveal as="li" key={title} delay={index * 120}>
              <span className="step-icon">
                <Icon size={22} />
              </span>
              <strong>
                {index + 1}. {title}
              </strong>
              <p>{text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="site-section">
        <Reveal as="h2">What you’ll find</Reveal>
        <div className="kinds">
          {KINDS.map(({ icon: Icon, label, text }, index) => (
            <Reveal key={label} delay={index * 90} className="kind-card">
              <Icon size={22} />
              <strong>{label}</strong>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="site-section split" id="safety">
        <Reveal>
          <h2>Safety &amp; privacy, built in</h2>
          <ul className="checklist">
            <li>
              <ShieldCheck size={18} /> Home, care and wellness pins show only an approximate area
              (about 400 m). Your exact spot never leaves your device.
            </li>
            <li>
              <MessageCircle size={18} /> Messages are private to the two people on a request. Your
              email is never shown.
            </li>
            <li>
              <TriangleAlert size={18} /> Report or block anyone. Pins reported by several people
              are hidden until reviewed.
            </li>
          </ul>
        </Reveal>
        <Reveal delay={120} className="callout">
          <h3>Our mission</h3>
          <p>
            PinDrop started at De Anza College with a simple idea: most help people need is small,
            and someone nearby is usually glad to give it. We make that easy to see and safe to act
            on.
          </p>
          <Link className="text-button" href="/contact">
            Get in touch <ArrowRight size={15} />
          </Link>
        </Reveal>
      </section>

      <Reveal as="section" className="site-cta">
        <h2>Ready to drop your first pin?</h2>
        <p>It takes less than a minute, with no password to remember.</p>
        <div className="hero-actions">
          <Link className="primary" href="/signup">
            Sign up free
          </Link>
          <Link className="secondary" href="/">
            Browse the map first
          </Link>
        </div>
      </Reveal>
    </>
  );
}

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

// The people building PinDrop.
const TEAM = [
  { name: "Bedirhan Erdemli", photo: "/team/bedirhan-erdemli.webp", linkedin: "https://www.linkedin.com/in/bedirhan-yusuf-erdemli" },
  { name: "Shafagh Mehrabi", photo: "/team/shafagh-mehrabi.webp", linkedin: "https://www.linkedin.com/in/shafagh-mehrabi" },
  { name: "Yixin Lin", photo: "/team/yixin-lin.webp", linkedin: "https://www.linkedin.com/in/yixin-lin-1680yx" },
  { name: "Yeowon Jun", photo: "/team/yeowon-jun.webp", linkedin: "https://www.linkedin.com/in/yeowon-jun-53a37b443" },
  { name: "Sammy Elzein", photo: "/team/sammy-elzein.webp", linkedin: "https://www.linkedin.com/in/sammy-elzein-04721839a" },
];

const KINDS = [
  { icon: HandHeart, label: "Requests", text: "Moving a desk, a ride to the store, a study partner." },
  { icon: Gift, label: "Offers", text: "Tutoring, tools to borrow, free textbooks, spare food." },
  { icon: CalendarDays, label: "Events", text: "Cleanups, club meetups, workshops and potlucks." },
  { icon: MapPinned, label: "Places", text: "Food pantries, quiet study spots, accessible entrances." },
  { icon: TriangleAlert, label: "Alerts", text: "Lost pets, hazards and neighborhood updates." },
];

// Lucide has no brand icons, so the LinkedIn mark is drawn here.
function LinkedInIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

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

      <section className="site-section" id="team">
        <Reveal as="h2">Meet the team</Reveal>
        <Reveal as="p" delay={60} className="hero-lead team-lead">
          De Anza students building the neighborhood map we wanted to use.
        </Reveal>
        <ul className="team">
          {TEAM.map((person, index) => (
            <Reveal as="li" key={person.name} delay={index * 100} className="team-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={person.photo} alt={person.name} width={160} height={160} loading="lazy" />
              <strong>{person.name}</strong>
              {person.linkedin && (
                <a
                  href={person.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${person.name} on LinkedIn (opens in a new tab)`}
                >
                  <LinkedInIcon /> LinkedIn
                </a>
              )}
            </Reveal>
          ))}
        </ul>
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

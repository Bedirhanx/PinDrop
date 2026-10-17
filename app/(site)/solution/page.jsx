import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  EyeOff,
  HandHeart,
  Lock,
  Map as MapIcon,
  MapPinned,
  MessageCircle,
  MessagesSquare,
  Search,
  ShieldCheck,
  Sparkles,
  UserX,
  WifiOff,
} from "lucide-react";
import Reveal from "@/components/Reveal";

export const metadata = {
  title: "Our solution",
  description:
    "Help around campus is scattered and easy to miss. PinDrop puts what neighbors need and offer on one shared map, with privacy and safety built in.",
};

const PROBLEMS = [
  {
    icon: MessagesSquare,
    title: "Help is scattered",
    text: "Requests and offers live in dozens of group chats, flyers and word of mouth. If you’re not in the right chat, you never see them.",
  },
  {
    icon: UserX,
    title: "Asking feels awkward",
    text: "It’s hard to ask strangers for a hand, and harder to know who nearby could actually help right now.",
  },
  {
    icon: EyeOff,
    title: "Good offers go unseen",
    text: "Free food, spare textbooks, empty seats in a car and open study groups disappear before the people who need them find out.",
  },
];

const SOLUTION = [
  {
    icon: MapIcon,
    title: "One shared map",
    text: "Requests, offers, events, places and alerts from everyone, in one place, filtered by what you need and how close it is.",
  },
  {
    icon: HandHeart,
    title: "Respond in one tap",
    text: "“I can help” or “I’m interested” sends an offer. The author accepts, so only one person takes each request.",
  },
  {
    icon: MessageCircle,
    title: "Coordinate privately",
    text: "The two people on a request get a private conversation. No phone numbers or emails need to be shared.",
  },
  {
    icon: BadgeCheck,
    title: "Close the loop",
    text: "Mark it done when it’s done. Every finished request adds to the helper’s record, so reliable neighbors stand out.",
  },
];

const SAFEGUARDS = [
  {
    icon: EyeOff,
    text: "Home, care and wellness pins show only an approximate area (about 400 m). The exact spot never leaves your device.",
  },
  {
    icon: Lock,
    text: "Rules are enforced by the database itself, not just the app: nobody can edit, delete or claim someone else’s pin.",
  },
  {
    icon: ShieldCheck,
    text: "Anyone can report or block. Pins reported by several people are hidden until a moderator reviews them.",
  },
  {
    icon: WifiOff,
    text: "Recently viewed pins stay available offline, and the list still works if the map can’t load.",
  },
];

const NEXT = [
  { icon: BadgeCheck, title: "Verified student badges", text: "Built in; switched on once the college email domain is confirmed." },
  { icon: Bell, title: "Notifications", text: "Alerts when someone responds to your pin or messages you." },
  { icon: Search, title: "Saved searches", text: "Get told when a new pin matches what you’re looking for." },
];

export default function Solution() {
  return (
    <>
      <section className="site-section narrow solution-intro">
        <Reveal as="p" className="eyebrow">
          THE PROBLEM
        </Reveal>
        <Reveal as="h1" delay={60}>
          Help is all around campus.
          <br />
          <span className="hero-accent">It’s just hard to find.</span>
        </Reveal>
        <Reveal as="p" delay={120} className="hero-lead">
          Every day someone needs a ride, a study partner or an extra pair of hands, and someone
          nearby would gladly help. They just never find each other.
        </Reveal>
      </section>

      <section className="site-section" aria-labelledby="problems">
        <h2 id="problems" className="sr-only">
          What gets in the way
        </h2>
        <div className="kinds problems">
          {PROBLEMS.map(({ icon: Icon, title, text }, index) => (
            <Reveal key={title} delay={index * 100} className="kind-card problem-card">
              <Icon size={22} />
              <strong>{title}</strong>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="site-section" id="solution">
        <Reveal as="p" className="eyebrow">
          OUR SOLUTION
        </Reveal>
        <Reveal as="h2" delay={60}>
          <MapPinned size={28} className="inline-icon" aria-hidden="true" /> One map for what your
          community needs and offers.
        </Reveal>
        <ol className="steps solution-steps">
          {SOLUTION.map(({ icon: Icon, title, text }, index) => (
            <Reveal as="li" key={title} delay={index * 110}>
              <span className="step-icon">
                <Icon size={22} />
              </span>
              <strong>{title}</strong>
              <p>{text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="site-section split" id="safety">
        <Reveal>
          <h2>Safe by design</h2>
          <ul className="checklist">
            {SAFEGUARDS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={18} /> {text}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="callout">
          <h3>Who it’s for</h3>
          <p>
            Students who need a hand or have one to give, clubs looking for volunteers and members,
            and anyone around De Anza sharing food, resources and local events.
          </p>
          <Link className="text-button" href="/about#how-it-works">
            See how it works <ArrowRight size={15} />
          </Link>
        </Reveal>
      </section>

      <section className="site-section" aria-labelledby="next">
        <Reveal as="h2" id="next">
          <Sparkles size={24} className="inline-icon" aria-hidden="true" /> What’s next
        </Reveal>
        <Reveal as="p" delay={60} className="hero-lead team-lead">
          Planned improvements, not available yet.
        </Reveal>
        <div className="kinds">
          {NEXT.map(({ icon: Icon, title, text }, index) => (
            <Reveal key={title} delay={index * 90} className="kind-card planned">
              <Icon size={22} />
              <strong>
                {title} <span className="planned-label">Planned</span>
              </strong>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal as="section" className="site-cta">
        <h2>See what your neighbors need today.</h2>
        <p>Open the map, no account needed to look around.</p>
        <div className="hero-actions">
          <Link className="primary" href="/">
            Open the map <ArrowRight size={16} />
          </Link>
          <Link className="secondary" href="/signup">
            Create a free account
          </Link>
        </div>
      </Reveal>
    </>
  );
}

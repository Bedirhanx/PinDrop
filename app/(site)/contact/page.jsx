import { Clock, MessageCircle, ShieldCheck } from "lucide-react";
import ContactForm from "@/components/ContactForm";
import Reveal from "@/components/Reveal";

export const metadata = {
  title: "Contact",
  description: "Questions, ideas or safety concerns? Send the PinDrop team a message.",
};

export default function Contact() {
  return (
    <section className="site-section narrow">
      <Reveal as="p" className="eyebrow">
        CONTACT
      </Reveal>
      <Reveal as="h1" delay={60}>
        We’d love to hear from you.
      </Reveal>
      <Reveal as="p" delay={120} className="hero-lead">
        Questions, ideas, a club that wants to get involved, or something that doesn’t feel right:
        send it here and a real person will read it.
      </Reveal>
      <Reveal delay={180} className="contact-grid">
        <ContactForm />
        <aside className="contact-aside">
          <p>
            <Clock size={18} /> We usually reply within two school days.
          </p>
          <p>
            <ShieldCheck size={18} /> Safety reports are read first.
          </p>
          <p>
            <MessageCircle size={18} /> Your message is visible only to PinDrop moderators.
          </p>
        </aside>
      </Reveal>
    </section>
  );
}

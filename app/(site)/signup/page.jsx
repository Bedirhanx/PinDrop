import AuthForm from "@/components/AuthForm";
import Reveal from "@/components/Reveal";

export const metadata = { title: "Sign up" };

export default function Page() {
  return (
    <section className="site-section auth-page">
      <Reveal className="auth-card">
        <p className="eyebrow">SIGN UP</p>
        <h1>Join your neighbors.</h1>
        <p className="hero-lead">Create a free account to drop pins, offer help and save places on any device.</p>
        <AuthForm mode="signup" />
      </Reveal>
    </section>
  );
}

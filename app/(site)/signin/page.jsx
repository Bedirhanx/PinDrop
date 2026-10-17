import AuthForm from "@/components/AuthForm";
import Reveal from "@/components/Reveal";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <section className="site-section auth-page">
      <Reveal className="auth-card">
        <p className="eyebrow">SIGN IN</p>
        <h1>Welcome back.</h1>
        <p className="hero-lead">Enter your email and we’ll send you a link. No password needed.</p>
        <AuthForm mode="signin" />
      </Reveal>
    </section>
  );
}

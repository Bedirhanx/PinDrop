import ChatWidget from "@/components/ChatWidget";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

// Shared shell for the public pages: About, Contact, Sign in and Sign up.
export default function SiteLayout({ children }) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="site-main">
        {children}
      </main>
      <SiteFooter />
      <ChatWidget />
    </div>
  );
}

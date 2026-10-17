import { Inter } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "PinDrop · Your world, a pin away",
    template: "%s · PinDrop",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    images: [{ url: "/og-default.jpg", width: 1200, height: 630, alt: "PinDrop" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Shrink the layout when the on-screen keyboard opens (Android), so dialogs
  // and inputs stay above it.
  interactiveWidget: "resizes-content",
  themeColor: "#10182b",
};

// Applies the saved light/dark theme before first paint, avoiding a flash.
const themeScript = `try{if(localStorage.getItem("pindrop-theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

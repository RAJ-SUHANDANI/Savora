/**
 * Root layout: fonts, metadata, and the two global providers.
 *
 * Fonts are loaded through `next/font`, which self-hosts the files at build
 * time. That means no render-blocking request to Google's CDN, no layout shift
 * from a late font swap, and no third-party cookie consent banner — which for a
 * site whose whole premise is "we are worth trusting" is not a small detail.
 */
import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { siteConfig } from "@/lib/site-config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Fraunces is a variable font with three axes worth having:
 *   SOFT (0-100)   — corner rounding; 20 keeps it warm but not playful
 *   WONK (0-1)     — the idiosyncratic, editorial alternates
 *   opsz (9-144)   — optical size, so headings are drawn with the right
 *                    contrast at display sizes and body copy stays legible
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

/**
 * The card image for shared links. Same photograph as the homepage hero, but
 * requested at the 1200x630 every scraper crops to so none of them has to
 * resize it, and with a generous quality so it survives being downscaled twice.
 */
const OG_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&h=630&q=80";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const base = new URL(siteConfig.url);

  return {
    metadataBase: base,
    title: {
      default: `${settings.name} — ${settings.tagline}`,
      template: `%s · ${settings.name}`,
    },
    description: settings.tagline,
    applicationName: settings.name,
    keywords: [
      "restaurant",
      "Mediterranean",
      "seasonal",
      "Colchester",
      "fine dining",
      "table reservation",
    ],
    authors: [{ name: settings.name }],
    openGraph: {
      type: "website",
      siteName: settings.name,
      title: `${settings.name} — ${settings.tagline}`,
      description: settings.tagline,
      locale: "en_GB",
      url: base.toString(),
      // Without this, shared links render as a bare text card. 1200x630 is the
      // size Facebook, WhatsApp, iMessage and X all crop to, so the crop params
      // are baked into the URL rather than left to each scraper.
      images: [
        {
          url: OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `${settings.name} — ${settings.tagline}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: settings.name,
      description: settings.tagline,
      images: [OG_IMAGE],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    formatDetection: { telephone: true },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-icon.png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#15110f" },
  ],
  width: "device-width",
  initialScale: 1,
  // The booking flow and forms should not auto-zoom on iOS when a field is
  // focused, so the maximum scale is left at the default rather than locked.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: settings.name,
    description: settings.tagline,
    servesCuisine: "Mediterranean",
    priceRange: "££",
    telephone: settings.phone,
    email: settings.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: settings.address,
    },
    acceptsReservations: settings.isAcceptingReservations
      ? "https://schema.org/True"
      : "https://schema.org/False",
  };

  return (
    <html
      lang="en-GB"
      // Suppress the theme flash: ThemeProvider sets the class before paint
      // via an inline script, and this matches the light default.
      className={`${inter.variable} ${fraunces.variable}`}
      // `globals.css` sets `scroll-behavior: smooth` on the root, which Next
      // warns about on every navigation: the browser keeps animating the old
      // document while the new route scrolls, so the reader watches the page
      // slide twice. This attribute tells Next it has been handled.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      {/*
        `<head>` deliberately renders no elements of its own.

        React hydrates `<head>` with a forward cursor that skips past DOM nodes
        whose tag it is not currently looking for, but claims one positionally
        when the tag matches. Two inline scripts of ours used to live here, so a
        single `<script>` injected into the head by a browser extension was
        claimed as the theme script, the real theme script was claimed as the
        JSON-LD, and both were reported as attribute mismatches. Because the throw
        happened in the root layout, React attached no event handlers anywhere:
        the admin dashboard painted perfectly and every button was inert.

        With no `<script>` of ours in here, an injected one is a tag React is not
        looking for and is skipped. Do not add an inline script back to the head.
      */}
      <head />
      <body className="min-h-dvh antialiased">
        {/*
          The theme script, first thing in the body instead of in the head. A
          synchronous inline script at the top of the body is executed before the
          parser has created any body content, so it still lands before the first
          paint and a dark-mode visitor never sees a flash of white. Its effect
          is the class it puts on <html>, which is already applied by the time
          React hydrates, so <html>'s suppressHydrationWarning covers it.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('savora-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t==='dark'||(t!=='light'&&m);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
        {/*
          JSON-LD is read the same from the body as from the head, and out here
          it cannot collide with an extension the way an inline head script did.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}

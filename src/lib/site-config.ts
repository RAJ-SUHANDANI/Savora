/**
 * Site-wide constants that are not owner-editable: canonical URL, social
 * handles, coordinates, and copy that appears in more than one place.
 *
 * Anything the restaurant owner should be able to change lives in
 * `RestaurantSettings` and is read through `getSettings()` instead.
 */
export const siteConfig = {
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  name: "Savora",
  tagline: "Seasonal Mediterranean cooking in the heart of the city",
  description:
    "A small Mediterranean kitchen in Colchester. We cook what is good that week, from growers and fishermen we know by name, and we would rather seat thirty people well than sixty quickly.",
  /** Used for the social feed section; no API key required to render. */
  instagram: {
    handle: "@savora.colchester",
    profileUrl: "https://instagram.com/savora.colchester",
  },
  address: {
    street: "18 Alder Lane",
    city: "Colchester",
    postcode: "CO1 1SP",
    country: "United Kingdom",
    /**
     * Colchester Old Town, used for the embedded map. These are real
     * coordinates for the town centre so the map is not a placeholder.
     */
    lat: 51.8869,
    lng: 0.9023,
  },
  /**
   * Map URLs.
   *
   * Google Maps rather than OpenStreetMap, because that is where people
   * actually are when they tap "Directions" — it hands off to the native app
   * on a phone, and it is what the directions button in every other app on
   * their device already points at.
   *
   * Both are built from the official, key-free URL formats:
   *   • embed  — `maps.google.com/maps?q=<lat>,<lng>&z=<zoom>&output=embed`
   *   • link    — `google.com/maps/search/?api=1&query=<address>`
   * No Maps JavaScript API and therefore no billing account, which is what
   * keeps this project free to run.
   */
  mapEmbedUrl: "https://maps.google.com/maps?q=51.8869,0.9023&z=16&hl=en&output=embed",
  mapLinkUrl:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("18 Alder Lane, Colchester CO1 1SP"),
  /** Directions to the restaurant, for the "Directions" buttons. */
  directionsUrl:
    "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent("18 Alder Lane, Colchester CO1 1SP"),
  phone: "+44 1206 555 0188",
  email: "reservations@savora.example",
  /** Legal / footer links. */
  privacySlug: "/privacy",
} as const;

export const navLinks = [
  { href: "/menu", label: "Menu" },
  { href: "/reserve", label: "Reserve" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export const footerLinks = [
  {
    heading: "Visit",
    links: [
      { href: "/reserve", label: "Book a table" },
      { href: "/menu", label: "The menu" },
      { href: "/about", label: "Our story" },
      { href: "/contact", label: "Getting here" },
    ],
  },
  {
    heading: "Your account",
    links: [
      { href: "/account", label: "My bookings" },
      { href: "/account/favourites", label: "Saved dishes" },
      { href: "/signin", label: "Sign in" },
    ],
  },
  {
    heading: "The fine print",
    links: [
      { href: "/newsletter", label: "Newsletter" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

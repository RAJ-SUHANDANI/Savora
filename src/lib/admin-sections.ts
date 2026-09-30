/**
 * The admin section registry.
 *
 * One list, and everything that describes the back-of-house app reads from it:
 * the sidebar, the mobile rail, the top bar's "you are here" line, and the
 * orientation panel on the overview.
 *
 * ## Why this file exists
 *
 * The request behind it was that a signed-in member of staff should be able to
 * tell, at a glance, *what this application is and where things are*. That is
 * not a styling problem, it is a missing piece of information — a six-item
 * sidebar labelled "Reservations / Menu / Tables / Customers / Settings" is
 * perfectly clear to the person who designed it and opaque to someone who has
 * opened the dashboard for the first time.
 *
 * So each section carries a sentence saying what it is for, and a short list of
 * the actions it allows. The sentence is what the top bar shows under the
 * section name; the list is what the orientation panel shows. Neither can fall
 * behind the other, because there is only one copy of the copy.
 *
 * Every entry in `canDo` has to correspond to a control that actually exists in
 * that section. An overclaim is worse than an omission: someone reads "add, edit
 * and remove dishes", finds no remove, and concludes the software is broken
 * rather than that the list was aspirational. Where a feature was deliberately
 * left out, the entry says what *is* there instead.
 *
 * ## Why no icons here
 *
 * `lucide-react` exports React components, and a plain data module that
 * imported them would pull the whole icon set into every server render of the
 * dashboard — including the pages that only need `canDo`. The icon *keys* are
 * plain strings; `admin-nav.tsx` maps them to components on the client, where
 * they are actually needed.
 */

export type AdminSection = {
  /** Route. The overview is `/admin` exactly; the rest are prefixes. */
  href: string;
  /** Full name, for the sidebar and the top bar. */
  label: string;
  /** Two or three characters' worth, for the narrow mobile rail. */
  short: string;
  /** Icon key, resolved in `admin-nav.tsx`. */
  icon: "overview" | "reservations" | "menu" | "tables" | "customers" | "settings";
  /**
   * One sentence, present tense, describing what the section is *for*. Shown in
   * the top bar the moment you land on the section.
   */
  description: string;
  /**
   * The actions that section allows, as short gerund phrases. Shown in the
   * orientation panel so a new starter can see what they are able to change
   * before they go looking for it.
   */
  canDo: readonly string[];
};

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    href: "/admin",
    label: "Overview",
    short: "Home",
    icon: "overview",
    description: "How today and the last thirty days are going, and what needs doing next.",
    canDo: [
      "See covers, bookings and rough occupancy for today",
      "Watch covers and bookings across the last 30 days",
      "Read the estimated takings and the average spend per head",
      "Confirm, seat and cancel anything in today's book from the summary",
    ],
  },
  {
    href: "/admin/reservations",
    label: "Reservations",
    short: "Bookings",
    icon: "reservations",
    description: "The full book, day by day — the screen you will live in during service.",
    canDo: [
      "Step through the book a day at a time, or jump to a date",
      "Filter the day by status, or show only the bookings with no table",
      "Move a booking to a different table",
      "Confirm, seat, complete, mark a no-show, or cancel with a reason",
    ],
  },
  {
    href: "/admin/menu",
    label: "Menu",
    short: "Menu",
    icon: "menu",
    description: "The dishes guests see on the public menu, and what is available to order tonight.",
    canDo: [
      "Add a dish and edit any existing one",
      "Mark a dish sold out for the evening without deleting it",
      "Set prices, dietary tags, allergens and a chef's note",
      "Hide a dish from the public menu entirely, or make it a signature",
      "Remove a dish outright, once no guest has it on a saved list",
    ],
  },
  {
    href: "/admin/tables",
    label: "Tables",
    short: "Tables",
    icon: "tables",
    description: "The floor plan the booking engine seats against — capacity and which part of the room a table is in.",
    canDo: [
      "Add a table, change its number or capacity, or remove it",
      "Move a table between the dining room, the terrace and the private room",
      "Take a table out of service while keeping its bookings where they are",
    ],
  },
  {
    href: "/admin/customers",
    label: "Customers",
    short: "Guests",
    icon: "customers",
    description: "Everyone with an account, their history with us, and your private notes about them.",
    canDo: [
      "Search by name, email or phone",
      "See how many times they have eaten, and when they were last in",
      "See what they have coming up and which dishes they have saved",
      "Write a private note — allergies, a favourite corner — and promote a regular to staff",
    ],
  },
  {
    href: "/admin/settings",
    label: "Settings",
    short: "Settings",
    icon: "settings",
    description: "The rules the booking engine obeys — opening hours, holidays and the booking window.",
    canDo: [
      "Set opening hours and services for each day",
      "Close the restaurant on specific dates",
      "Change the booking window, maximum party size and sitting length",
      "Pause online bookings entirely, and change the address guests are given",
    ],
  },
] as const;

/**
 * The section a pathname belongs to.
 *
 * `/admin` matches exactly, so the Overview entry does not stay lit on every
 * nested page; everything else is a prefix test, which is what lets
 * `/admin/reservations` keep working when it grows sub-routes.
 */
export function sectionFor(pathname: string | null): AdminSection {
  const path = pathname ?? "";
  return (
    ADMIN_SECTIONS.find((section) =>
      section.href === "/admin" ? path === "/admin" : path.startsWith(section.href),
    ) ?? ADMIN_SECTIONS[0]
  );
}

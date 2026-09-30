/**
 * Domain constants shared by the server and the browser.
 *
 * This module must stay free of Node built-ins and Prisma imports: it is
 * imported by client components, so anything server-only here would break the
 * bundle.
 */

export const MENU_CATEGORIES = ["STARTERS", "MAINS", "DESSERTS", "DRINKS"] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MenuCategory, string> = {
  STARTERS: "Starters",
  MAINS: "Mains",
  DESSERTS: "Desserts",
  DRINKS: "Drinks",
};

/** Short editorial descriptors shown in the menu section headers. */
export const CATEGORY_TAGLINES: Record<MenuCategory, string> = {
  STARTERS: "Small plates to begin, built for sharing",
  MAINS: "The heart of the kitchen — fire, citrus, patience",
  DESSERTS: "Something sweet to finish",
  DRINKS: "Wine, cocktails and something cold",
};

export const DIETARY_TAGS = [
  "VEGAN",
  "VEGETARIAN",
  "GLUTEN_FREE",
  "DAIRY_FREE",
  "SPICY",
  "NUT_FREE",
  "PORK_FREE",
  "SHELLFISH",
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const TAG_LABELS: Record<DietaryTag, string> = {
  VEGAN: "Vegan",
  VEGETARIAN: "Vegetarian",
  GLUTEN_FREE: "Gluten-free",
  DAIRY_FREE: "Dairy-free",
  SPICY: "Spicy",
  NUT_FREE: "Nut-free",
  PORK_FREE: "No pork",
  SHELLFISH: "Contains shellfish",
};

/** The tags the public menu exposes as filters, in display order. */
export const MENU_FILTER_TAGS: DietaryTag[] = [
  "VEGAN",
  "VEGETARIAN",
  "GLUTEN_FREE",
  "SPICY",
];

/**
 * schema.org `suitableForDiet` values, for the JSON-LD on a dish page.
 *
 * Deliberately partial: schema.org defines diets (Vegan, Vegetarian,
 * GlutenFree, LowLactose, ...) and has no vocabulary for "spicy", "no pork" or
 * "contains shellfish". Mapping those onto invented URLs would be worse than
 * omitting them, because a search engine would then advertise a diet the dish
 * is not actually suitable for.
 */
export const DIET_SCHEMA_URLS: Partial<Record<DietaryTag, string>> = {
  VEGAN: "https://schema.org/VeganDiet",
  VEGETARIAN: "https://schema.org/VegetarianDiet",
  GLUTEN_FREE: "https://schema.org/GlutenFreeDiet",
  DAIRY_FREE: "https://schema.org/LowLactoseDiet",
};

export const ZONES = ["INDOOR", "OUTDOOR", "PRIVATE"] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABELS: Record<Zone, string> = {
  INDOOR: "Indoor dining room",
  OUTDOOR: "Terrace",
  PRIVATE: "Private room",
};

export const ZONE_SHORT: Record<Zone, string> = {
  INDOOR: "Indoor",
  OUTDOOR: "Terrace",
  PRIVATE: "Private",
};

export const RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  SEATED: "Seated",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

/** Statuses that occupy a table and therefore block other bookings. */
export const BLOCKING_STATUSES: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

/** Statuses an owner or guest can still change. */
export const CANCELABLE_STATUSES: ReservationStatus[] = [
  "PENDING",
  "CONFIRMED",
  "SEATED",
];

/** Days of the week, Monday-first, matching `date-fns` ordering. */
export const DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const DAY_SHORT: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** A service window: guests may be seated between `open` and `close` (inclusive of open). */
export type ServiceWindow = readonly [string, string];

/** `openingHours` shape stored in RestaurantSettings. */
export type OpeningHours = Partial<Record<DayKey, ServiceWindow[]>>;

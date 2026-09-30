/**
 * Shared Zod schemas.
 *
 * These validate on both sides: the client uses them with react-hook-form for
 * inline field errors, and the route handlers re-validate with the same schema.
 * Sharing them is the point — a form that is valid in the browser cannot be
 * invalid when it reaches the server, because there is only one definition of
 * "valid".
 */
import { z } from "zod";
import { MENU_CATEGORIES, DIETARY_TAGS, ZONES } from "./constants";

/** Accepts a date the user actually picked, not an arbitrary string. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "That date does not exist");

export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time");

export const email = z.string().trim().toLowerCase().email("Enter a valid email address");

export const phone = z
  .string()
  .trim()
  .min(7, "Enter a contact number")
  .max(24, "That number looks too long")
  .regex(/^[+0-9 ()-]+$/, "Use digits, spaces, + or - only");

/** Prevents a 10MB textarea. Per-field limits live on each schema below. */
const longText = z.string().trim().max(2000, "Please keep this under 2000 characters");

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

export const createReservationSchema = z.object({
  date: isoDate,
  time: hhmm,
  // Zod 4 takes the message as a bare string (Zod 3's `invalid_type_error` is
  // gone). Giving `.int()` and `.min()` their own messages keeps the schema
  // level string scoped to "you sent the wrong type" rather than every check.
  partySize: z.coerce
    .number("Choose a party size")
    .int("Party size must be a whole number")
    .min(1, "At least one guest")
    .max(30, "For larger parties, please call us"),
  guestName: z.string().trim().min(2, "Tell us who the booking is for").max(120, "That name is too long"),
  guestEmail: email,
  guestPhone: phone.optional().or(z.literal("")),
  specialRequests: longText.optional().or(z.literal("")),
  occasion: z.string().trim().max(60).optional().or(z.literal("")),
  zonePref: z.enum(ZONES).optional().nullable(),
  /** Honeypot: bots fill hidden fields, humans never see them. */
  website: z.string().max(0, "Rejected").optional().or(z.literal("")),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/**
 * The guest half of `createReservationSchema`, for the details step of the
 * booking flow.
 *
 * Derived by `pick` rather than written out again: the form cannot drift from
 * what the route enforces, and adding a field to the reservation schema cannot
 * be left half-finished in the browser. Date, time and party size are excluded
 * because they are chosen in the earlier steps and live in the booking store,
 * not in the form.
 */
export const guestDetailsSchema = createReservationSchema.pick({
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  occasion: true,
  specialRequests: true,
  website: true,
});

export type GuestDetails = z.infer<typeof guestDetailsSchema>;

export const updateReservationSchema = z
  .object({
    status: z
      .enum(["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"])
      .optional(),
    date: isoDate.optional(),
    time: hhmm.optional(),
    partySize: z.coerce.number().int().min(1).max(30).optional(),
    tableId: z.string().nullable().optional(),
    zonePref: z.enum(ZONES).nullable().optional(),
    specialRequests: longText.nullable().optional(),
    guestName: z.string().trim().min(2).max(120).optional(),
    guestEmail: email.optional(),
    guestPhone: phone.nullable().optional(),
    cancelReason: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export const menuItemSchema = z.object({
  name: z.string().trim().min(2, "Give the dish a name").max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only")
    .max(140),
  description: z.string().trim().min(10, "Describe the dish").max(600),
  priceCents: z.coerce
    .number("Add a price")
    .int("Use whole pence")
    .min(0, "Price cannot be negative")
    .max(100000, "That price looks too high"),
  category: z.enum(MENU_CATEGORIES),
  imageUrl: z.string().trim().url("Add a valid image URL").max(600),
  tags: z.array(z.enum(DIETARY_TAGS)).max(DIETARY_TAGS.length).default([]),
  ingredients: z.array(z.string().trim().min(1)).max(30).default([]),
  allergens: z.array(z.string().trim().min(1)).max(30).default([]),
  calories: z.coerce.number().int().min(0).max(5000).nullable().optional(),
  isSignature: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  isSoldOut: z.boolean().default(false),
  chefNote: z.string().trim().max(400).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type MenuItemInput = z.infer<typeof menuItemSchema>;

// ---------------------------------------------------------------------------
// Tables & sections
// ---------------------------------------------------------------------------

export const tableSchema = z.object({
  number: z.coerce.number().int().min(1, "Number tables from 1").max(999),
  capacity: z.coerce.number().int().min(1, "At least one seat").max(40),
  zone: z.enum(ZONES),
  sectionId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export type TableInput = z.infer<typeof tableSchema>;

export const sectionSchema = z.object({
  name: z.string().trim().min(2, "Name the section").max(80),
  zone: z.enum(ZONES),
  sortOrder: z.coerce.number().int().min(0).max(99).default(0),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(200),
  address: z.string().trim().min(3).max(200),
  phone: phone,
  email,
  maxPartySize: z.coerce.number().int().min(1).max(40),
  bookingWindowDays: z.coerce.number().int().min(1).max(365),
  diningDurationMin: z.coerce.number().int().min(30).max(360),
  holdDurationMin: z.coerce.number().int().min(1).max(120),
  minNoticeHours: z.coerce.number().int().min(0).max(168),
  timezone: z.string().trim().min(1).max(64),
  isAcceptingReservations: z.boolean(),
  holidays: z.array(isoDate).max(60),
  /**
   * `{ mon: [["18:00","22:00"]], ... }`. Validated per window so a typo like
   * "25:00" is rejected at the edge rather than silently producing a day with
   * no bookable slots.
   */
  openingHours: z.record(
    z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    z
      .array(z.tuple([hhmm, hhmm]))
      .max(4, "At most four services a day")
      .refine(
        (windows) => windows.every(([open, close]) => open < close),
        "A service must end after it starts",
      ),
  ),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(200),
});

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "Tell us your name").max(120),
    email,
    phone: phone.optional().or(z.literal("")),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(200)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z0-9]/, "Include a capital letter or number"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/**
 * Editable account details.
 *
 * `email` is deliberately **absent**. It is the join key for two things — the
 * `signIn` callback's guest-booking claim, and every `guestEmail` on a
 * reservation — so letting it change without a verification round trip would
 * mean a row could be re-pointed at an address nobody proved they control.
 * Changing it is a different, harder feature, not a missing field.
 */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(120),
  phone: phone.optional().or(z.literal("")),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * Password change.
 *
 * `currentPassword` is required, and the action re-verifies it with bcrypt
 * before writing. Without that, any session — including one left open on a
 * shared laptop — could lock the owner out of their own account permanently,
 * because the sign-in form has no reset flow by design.
 *
 * The strength rules are lifted from `signUpSchema` rather than repeated, so a
 * password has to clear the same bar to be set as it did to be created.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(200),
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(200)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z0-9]/, "Include a capital letter or number"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Contact form. */
export const contactSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(120),
  email,
  subject: z.string().trim().min(2, "Add a subject").max(120),
  message: z.string().trim().min(10, "Tell us a little more").max(2000),
  website: z.string().max(0, "Rejected").optional().or(z.literal("")),
});

export type ContactInput = z.infer<typeof contactSchema>;

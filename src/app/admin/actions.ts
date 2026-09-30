"use server";

/**
 * Staff-only mutations.
 *
 * Reservations are the exception: they are *not* written here. Amending a
 * booking can collide with another one, and that logic — the exclusion
 * constraint, the retry, the table re-picker, the notification — already lives
 * in `PATCH /api/reservations/:id` and is covered by the concurrency tests.
 * Reimplementing it in a second place would mean two write paths that drift,
 * and the one that drifted would be the one nobody tested. So the dashboard
 * calls that route and everything else is handled here.
 *
 * Every action re-checks the role rather than trusting that the caller is
 * inside `/admin`: a server action is a public HTTP endpoint, and the layout
 * guard is a redirect, not authorisation.
 */
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { type BannerState, type FieldIssue, fieldsFrom } from "@/lib/action-state";
import { PG_ERROR, pgErrorCode, prisma } from "@/lib/db";
import { updateSettings } from "@/lib/settings-repo";
import { settingsSchema, tableSchema, menuItemSchema } from "@/lib/validation";

/**
 * The action *result* type lives in `@/lib/action-state`, not here.
 *
 * A `"use server"` module may only export async functions. Exporting the type
 * is fine — types are erased — but the `IDLE` constant that went with it was a
 * plain object, and its presence made Next.js's server-actions loader reject
 * this entire module with "can only export async functions, found object". The
 * loader builds one manifest per file, so every action here failed at once:
 * dish edits, table edits, role changes and settings saves all broke together
 * while their pages still rendered. Importing both from a plain module keeps
 * this file to functions only.
 */
type ActionState = BannerState;

/** Shorthand at the four call sites, which all read `parsed.error.issues`. */
function fieldErrors(issues: FieldIssue[]): Record<string, string> {
  return fieldsFrom(issues);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/**
 * Toggles one of the three menu flags.
 *
 * Deliberately takes the field name as an allowlisted union rather than a
 * string: this action writes a boolean straight onto a row, and a typo'd or
 * guessed field name would otherwise become an arbitrary column write.
 */
export async function toggleMenuFlag(
  id: string,
  field: "isAvailable" | "isSoldOut" | "isSignature",
): Promise<void> {
  await requireAdmin();

  const item = await prisma.menuItem.findUnique({ where: { id }, select: { [field]: true } });
  if (!item) return;

  await prisma.menuItem.update({
    where: { id },
    data: { [field]: !item[field] } as never,
  });

  // The public menu and every dish page read this, and the change has to be
  // visible immediately — "we've taken it off but the site still shows it" is
  // the failure an owner actually notices.
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

export async function saveMenuItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing dish id." };

  const parsed = menuItemSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    priceCents: formData.get("priceCents"),
    category: formData.get("category"),
    imageUrl: formData.get("imageUrl"),
    tags: splitList(formData.getAll("tags")),
    ingredients: splitList(formData.getAll("ingredients")),
    allergens: splitList(formData.getAll("allergens")),
    calories: formData.get("calories") === "" ? null : formData.get("calories"),
    isSignature: formData.get("isSignature") === "on",
    isAvailable: formData.get("isAvailable") === "on",
    isSoldOut: formData.get("isSoldOut") === "on",
    chefNote: formData.get("chefNote") || null,
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error.issues),
    };
  }

  const { tags, ingredients, allergens, ...rest } = parsed.data;

  try {
    await prisma.menuItem.update({
      where: { id },
      data: { ...rest, tags, ingredients, allergens },
    });
  } catch (err) {
    // The slug is unique; a duplicate is a typo, not a crash.
    if (pgErrorCode(err) === PG_ERROR.UNIQUE_VIOLATION) {
      return { ok: false, message: "Another dish already uses that web address.", errors: { slug: "Already taken" } };
    }
    throw err;
  }

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
  revalidatePath(`/menu/${rest.slug}`);
  return { ok: true, message: "Saved." };
}

export async function createMenuItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = menuItemSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    priceCents: formData.get("priceCents"),
    category: formData.get("category"),
    imageUrl: formData.get("imageUrl"),
    tags: splitList(formData.getAll("tags")),
    ingredients: splitList(formData.getAll("ingredients")),
    allergens: splitList(formData.getAll("allergens")),
    calories: formData.get("calories") === "" ? null : formData.get("calories"),
    isSignature: formData.get("isSignature") === "on",
    isAvailable: formData.get("isAvailable") === "on",
    isSoldOut: false,
    chefNote: formData.get("chefNote") || null,
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error.issues),
    };
  }

  const { tags, ingredients, allergens, ...rest } = parsed.data;

  try {
    await prisma.menuItem.create({ data: { ...rest, tags, ingredients, allergens } });
  } catch (err) {
    if (pgErrorCode(err) === PG_ERROR.UNIQUE_VIOLATION) {
      return { ok: false, message: "Another dish already uses that web address.", errors: { slug: "Already taken" } };
    }
    throw err;
  }

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
  return { ok: true, message: "Dish added." };
}

/**
 * Deletes a dish outright.
 *
 * ## Why there is a second way to take a dish off the menu
 *
 * `toggleMenuFlag` already hides a dish by marking it unavailable, and that is
 * the right tool for "we have run out" or "we have dropped it for the season" --
 * it is reversible, it keeps the dish's history, and nothing else has to change.
 *
 * A real delete is a different act and has to be guarded differently. The thing
 * that makes it dangerous is not the dish, it is the `Favorite` rows hanging off
 * it: `onDelete: Cascade` would take a guest's saved dishes with them, and the
 * guest never asked for that and is not in the room to object. So the delete
 * stops while anyone has favourited the dish and says how many, rather than
 * either silently cascading or refusing forever.
 *
 * That leaves the owner a real choice, stated plainly: wait until the
 * favourites are gone, or mark the dish sold out and keep the row.
 *
 * ## Past bookings are not a reason to refuse
 *
 * Reservations do not reference dishes, so no history is rewritten. A dish that
 * was served last spring and is being removed now has no booking to invalidate.
 */
export async function deleteMenuItem(id: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();

  const item = await prisma.menuItem.findUnique({
    where: { id },
    select: { name: true, _count: { select: { favorites: true } } },
  });

  if (!item) {
    return { ok: false, message: "That dish is no longer on the menu." };
  }

  const favourites = item._count.favorites;
  if (favourites > 0) {
    return {
      ok: false,
      message: `${item.name} is on ${favourites} guest${favourites === 1 ? "'s" : "s'"} saved list. Mark it sold out instead — that hides it from the menu without deleting anyone's favourites.`,
    };
  }

  await prisma.menuItem.delete({ where: { id } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
  return { ok: true, message: `${item.name} removed from the menu.` };
}

/**
 * Free text -> `string[]`, split on commas and newlines.
 *
 * Accepts `FormDataEntryValue[]` as well as a single entry, because the dietary
 * tags are eight checkboxes sharing one name and `formData.get("tags")` returns
 * only the *first* of them. Reading them with `get` and splitting would silently
 * persist a single tag for a dish that had four ticked — and it would look like
 * the form worked, because the checkbox the owner ticked first is the one that
 * came back. `getAll` plus a flattening split is the only version that is right
 * for both a text field and a checkbox group.
 */
function splitList(value: FormDataEntryValue | FormDataEntryValue[] | null): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .filter((entry): entry is string => typeof entry === "string")
    .flatMap((entry) => entry.split(/[,\n]/))
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export async function saveTable(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const parsed = tableSchema.safeParse({
    number: formData.get("number"),
    capacity: formData.get("capacity"),
    zone: formData.get("zone"),
    sectionId: formData.get("sectionId") || null,
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error.issues),
    };
  }

  try {
    if (id) {
      await prisma.restaurantTable.update({ where: { id }, data: parsed.data });
    } else {
      await prisma.restaurantTable.create({ data: parsed.data });
    }
  } catch (err) {
    // `number` is unique, and a clash here is the one a manager makes by
    // accident when adding a table after a busy service.
    if (pgErrorCode(err) === PG_ERROR.UNIQUE_VIOLATION) {
      return { ok: false, message: "A table with that number already exists.", errors: { number: "Already in use" } };
    }
    throw err;
  }

  revalidatePath("/admin/tables");
  revalidatePath("/admin");
  return { ok: true, message: id ? "Table updated." : "Table added." };
}

export async function toggleTableActive(id: string): Promise<void> {
  await requireAdmin();
  const table = await prisma.restaurantTable.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!table) return;
  await prisma.restaurantTable.update({ where: { id }, data: { isActive: !table.isActive } });
  revalidatePath("/admin/tables");
  revalidatePath("/admin");
}

/**
 * Retires a table.
 *
 * A delete rather than a deactivate when asked, but only when nothing is booked
 * against it: the `onDelete: SetNull` on `Reservation.tableId` would otherwise
 * silently strip the table from future bookings and rewrite history, which is
 * not something to do behind someone's back because they clicked a button.
 */
export async function deleteTable(id: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();

  const upcoming = await prisma.reservation.count({
    where: {
      tableId: id,
      startsAt: { gte: new Date() },
      status: { in: ["PENDING", "CONFIRMED", "SEATED"] },
    },
  });

  if (upcoming > 0) {
    return {
      ok: false,
      message: `This table has ${upcoming} upcoming booking${upcoming === 1 ? "" : "s"}. Reassign ${upcoming === 1 ? "it" : "them"} first, or retire the table instead.`,
    };
  }

  await prisma.restaurantTable.delete({ where: { id } });
  revalidatePath("/admin/tables");
  revalidatePath("/admin");
  return { ok: true, message: "Table removed." };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Saves the staff-only note on a guest.
 *
 * Notes are allergy and seating information the guest did not type themselves,
 * so this is deliberately not editable from anywhere a customer can reach.
 */
export async function saveStaffNote(userId: string, note: string): Promise<void> {
  await requireAdmin();
  const trimmed = note.trim().slice(0, 500);
  await prisma.user.update({
    where: { id: userId },
    data: { staffNotes: trimmed || null },
  });
  revalidatePath("/admin/customers");
}

export async function setUserRole(userId: string, role: "CUSTOMER" | "ADMIN"): Promise<void> {
  const admin = await requireAdmin();

  // An owner who demotes themselves locks every colleague out of the dashboard.
  if (userId === admin.id && role !== "ADMIN") {
    throw new Error("You cannot remove your own administrator access.");
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/customers");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Saves the restaurant settings.
 *
 * `openingHours` and `holidays` are submitted as a single JSON field rather
 * than as one form input per window. Nested arrays of tuples have no sensible
 * flat HTML encoding — `hours.mon.0.open` works until the owner adds a second
 * service, at which point the server has to guess which field belongs to which
 * pair. One JSON field keeps the shape exact.
 */
export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  let openingHours: unknown;
  let holidays: unknown;

  try {
    openingHours = JSON.parse(String(formData.get("openingHours") ?? "{}"));
  } catch {
    return { ok: false, message: "The opening hours could not be read.", errors: { openingHours: "Invalid" } };
  }

  try {
    holidays = JSON.parse(String(formData.get("holidays") ?? "[]"));
  } catch {
    return { ok: false, message: "The closure dates could not be read.", errors: { holidays: "Invalid" } };
  }

  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    tagline: formData.get("tagline"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    maxPartySize: formData.get("maxPartySize"),
    bookingWindowDays: formData.get("bookingWindowDays"),
    diningDurationMin: formData.get("diningDurationMin"),
    holdDurationMin: formData.get("holdDurationMin"),
    minNoticeHours: formData.get("minNoticeHours"),
    timezone: formData.get("timezone"),
    isAcceptingReservations: formData.get("isAcceptingReservations") === "on",
    openingHours,
    holidays,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error.issues),
    };
  }

  const { openingHours: hours, ...rest } = parsed.data;
  await updateSettings({ ...rest, openingHours: hours });

  // Settings feed the header, the footer, the contact page and the booking
  // flow, so this is the one write that invalidates most of the site.
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

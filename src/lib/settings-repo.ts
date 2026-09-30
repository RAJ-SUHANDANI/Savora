/**
 * Settings repository.
 *
 * Prisma 7 cannot represent PostgreSQL's `jsonb` in its type system — the
 * column is declared `Unsupported("jsonb")`, which means the generated client
 * omits it from the model type *and* from the create/update inputs. Rather than
 * scatter `as any` through the codebase, everything that touches `openingHours`
 * goes through this module, and the rest of the app sees a plain typed object.
 *
 * This is the only place in the app that knows `openingHours` is jsonb.
 */
import type { OpeningHours } from "./constants";
import { prisma } from "./db";

/** The shape the app uses. Mirrors `RestaurantSettings` but with real types. */
export type SavoraSettings = {
  id: number;
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  openingHours: OpeningHours;
  holidays: string[];
  maxPartySize: number;
  bookingWindowDays: number;
  diningDurationMin: number;
  holdDurationMin: number;
  minNoticeHours: number;
  timezone: string;
  currency: string;
  isAcceptingReservations: boolean;
  updatedAt: Date;
};

/**
 * Column list kept in sync with the Prisma model. `openingHours` is selected as
 * `jsonb` and arrives from `pg` already parsed into an object, so no
 * `JSON.parse` is needed.
 */
const SETTINGS_COLUMNS = `
  "id", "name", "tagline", "address", "phone", "email",
  "openingHours", "holidays",
  "maxPartySize", "bookingWindowDays", "diningDurationMin", "holdDurationMin",
  "minNoticeHours", "timezone", "currency", "isAcceptingReservations", "updatedAt"
`;

type RawSettingsRow = {
  id: number;
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  openingHours: unknown;
  holidays: string[];
  maxPartySize: number;
  bookingWindowDays: number;
  diningDurationMin: number;
  holdDurationMin: number;
  minNoticeHours: number;
  timezone: string;
  currency: string;
  isAcceptingReservations: boolean;
  updatedAt: Date;
};

function toSettings(row: RawSettingsRow): SavoraSettings {
  return {
    ...row,
    // A row written before the hours were configured parses to {}; normalise
    // so callers never have to null-check.
    openingHours: (row.openingHours ?? {}) as OpeningHours,
    holidays: row.holidays ?? [],
  };
}

export async function fetchSettingsRow(): Promise<SavoraSettings | null> {
  const rows = await prisma.$queryRawUnsafe<RawSettingsRow[]>(
    `SELECT ${SETTINGS_COLUMNS} FROM "RestaurantSettings" WHERE "id" = 1`,
  );
  return rows[0] ? toSettings(rows[0]) : null;
}

export type SettingsUpdate = Partial<
  Pick<
    SavoraSettings,
    | "name"
    | "tagline"
    | "address"
    | "phone"
    | "email"
    | "holidays"
    | "maxPartySize"
    | "bookingWindowDays"
    | "diningDurationMin"
    | "holdDurationMin"
    | "minNoticeHours"
    | "timezone"
    | "currency"
    | "isAcceptingReservations"
  >
> & { openingHours?: OpeningHours };

/**
 * Applies a partial update to the singleton row.
 *
 * `openingHours` is written with `$2::jsonb` and the rest through Prisma, in one
 * transaction, so a bad JSON blob cannot leave the row half-updated.
 */
export async function updateSettings(update: SettingsUpdate): Promise<SavoraSettings> {
  const { openingHours, ...rest } = update;

  return prisma.$transaction(async (tx) => {
    if (openingHours) {
      // $executeRaw inside the transaction; the JSON is stringified here and
      // cast server-side, so quoting and escaping are handled by the driver.
      await tx.$executeRawUnsafe(
        `UPDATE "RestaurantSettings" SET "openingHours" = $1::jsonb, "updatedAt" = now() WHERE "id" = 1`,
        JSON.stringify(openingHours),
      );
    }

    if (Object.keys(rest).length > 0) {
      // Prisma handles the remaining scalar columns, including the enum-ish
      // text[] and boolean fields, and generates the parameterised update.
      await tx.restaurantSettings.update({ where: { id: 1 }, data: rest as never });
    }

    const rows = await tx.$queryRawUnsafe<RawSettingsRow[]>(
      `SELECT ${SETTINGS_COLUMNS} FROM "RestaurantSettings" WHERE "id" = 1`,
    );
    return toSettings(rows[0]);
  });
}

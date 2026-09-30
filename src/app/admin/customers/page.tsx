import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { CustomerManager, type Guest } from "@/components/admin/customer-manager";
import { PageHeader } from "@/components/admin/page-header";
import { pluralise } from "@/lib/format";

export const metadata: Metadata = { title: "Guests — Savora" };
export const dynamic = "force-dynamic";

/**
 * Guests.
 *
 * ## The stats come from the bookings table, not a counter column
 *
 * `visits` counts `COMPLETED` reservations and nothing else. A `PENDING` booking
 * is a plan, a `CANCELLED` one never happened, and a `NO_SHOW` is a relationship
 * problem the guest probably does not remember. Deriving it on read means the
 * number is right immediately after any amendment, with no write path to forget.
 *
 * ## One aggregate query, not one per guest
 *
 * The naive version of this page is a `findMany` for the users and then an N+1
 * over the reservations to count them. That is fine at seven guests and painful
 * at seven hundred, so the counts come from a single `groupBy` keyed on
 * `userId` and joined in memory. A map lookup per guest rather than a query per
 * guest is the difference between a page that loads in a query and a page that
 * loads in N.
 *
 * ## The search is case-insensitive, and that is not optional here
 *
 * The cluster is created with `--locale=C` (see `scripts/db-server.mjs`), and
 * in the C collation `LIKE` and `=` are case-*sensitive*. Prisma's default
 * `contains` would therefore find "margaret" and miss "Margaret", which is the
 * most common way a name search appears to be broken. `mode: "insensitive"`
 * lowers both sides and is the correct choice.
 *
 * It costs an index: `LOWER(email)` is an expression, not the column, so no
 * btree on `email` can serve it and the search is a sequential scan. That is the
 * right trade at this size — a few thousand guests scan in well under a
 * millisecond — and it is why this page has no functional index in the schema
 * rather than a migration that `db:push` would quietly drop on the next setup.
 * The point to revisit is not the index but the row count: if the guest list
 * ever reaches the tens of thousands, add a `pg_trgm` GIN index on name and
 * email, which *can* serve an arbitrary substring search, rather than trying to
 * make `LOWER()` indexed.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQuery = "" } = await searchParams;

  /**
   * Trim and cap the term before it reaches the query.
   *
   * An unbounded `%` string from a URL is a cheap denial-of-service: a megabyte
   * of wildcards is a megabyte of pattern-matching work per row. 80 characters
   * is well past any real surname, and the cap is enforced on the server rather
   * than by `maxLength` on the input, because a URL is not a form.
   */
  const query = rawQuery.trim().slice(0, 80);

  const now = new Date();

  const [users, completed, upcoming] = await Promise.all([
    prisma.user.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        staffNotes: true,
        createdAt: true,
        _count: { select: { favorites: true } },
      },
    }),

    /**
     * One pass over the completed bookings, grouped by owner.
     *
     * `MAX(startsAt)` gives the last visit in the same query — a second
     * `groupBy` for it would be a second scan of the same rows.
     */
    prisma.reservation.groupBy({
      by: ["userId"],
      where: { userId: { not: null }, status: "COMPLETED" },
      _count: { _all: true, partySize: true },
      _max: { startsAt: true },
    }),

    prisma.reservation.groupBy({
      by: ["userId"],
      where: { userId: { not: null }, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gte: now } },
      _count: { _all: true },
    }),
  ]);

  const session = await currentUser();

  const completedBy = new Map(
    completed
      .filter((row): row is typeof row & { userId: string } => row.userId !== null)
      .map((row) => [row.userId, row]),
  );
  const upcomingBy = new Map(
    upcoming
      .filter((row): row is typeof row & { userId: string } => row.userId !== null)
      .map((row) => [row.userId, row._count._all]),
  );

  /**
   * Occasions, for the little tags under a name.
   *
   * A third grouped query, kept separate because it is a `groupBy` on a column
   * Prisma cannot aggregate by identity. Reading it as a flat
   * `select: { occasion: true }` over the user's reservations and reducing in
   * memory would be simpler, and for the handful of rows involved per guest it
   * is also fine — the reason it is a query is that it can be, not that it must
   * be, and this keeps the row count independent of how often a guest books.
   */
  const occasionRows = users.length
    ? await prisma.reservation.findMany({
        where: {
          userId: { in: users.map((u) => u.id) },
          occasion: { not: null },
          status: { in: ["COMPLETED", "CONFIRMED", "SEATED"] },
        },
        select: { userId: true, occasion: true },
      })
    : [];

  const occasionsBy = new Map<string, Set<string>>();
  for (const row of occasionRows) {
    if (!row.userId || !row.occasion) continue;
    const set = occasionsBy.get(row.userId) ?? new Set<string>();
    set.add(row.occasion);
    occasionsBy.set(row.userId, set);
  }

  const guests: Guest[] = users.map((user) => {
    const done = completedBy.get(user.id);
    return {
      id: user.id,
      // `name` is nullable because an OAuth account can exist before the guest
      // has told us what to call them. Falling back to the local part of the
      // email is more useful to a manager than a blank cell, and a heading with
      // no name in it is the one thing that makes a list unscannable.
      name: user.name?.trim() || user.email.split("@")[0],
      email: user.email,
      phone: user.phone,
      role: user.role as "CUSTOMER" | "ADMIN",
      staffNotes: user.staffNotes,
      // `.toISOString().slice(0, 10)` rather than a `Date`: `formatDate` takes
      // an ISO string, and a `Date` cannot cross into a client component.
      createdAt: user.createdAt.toISOString().slice(0, 10),
      visits: done?._count._all ?? 0,
      covers: done?._count.partySize ?? 0,
      lastVisit: done?._max.startsAt ? done._max.startsAt.toISOString().slice(0, 10) : null,
      upcoming: upcomingBy.get(user.id) ?? 0,
      favorites: user._count.favorites,
      occasions: [...(occasionsBy.get(user.id) ?? [])].slice(0, 4),
      isSelf: session?.id === user.id,
    };
  });

  /**
   * Sorted by how much the restaurant has reason to care: who is coming back
   * soonest, then who has eaten here most. A guest who has never booked and a
   * regular who books monthly are not equally worth having on the first screen.
   */
  guests.sort((a, b) => b.upcoming - a.upcoming || b.visits - a.visits || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        eyebrow="Guests"
        title={query ? `Search results` : "Guests"}
        description={
          query
            ? `${pluralise(guests.length, "guest")} matching “${query}”. Notes here are the only place allergy and seating preferences are stored.`
            : "Everyone with an account, and what the restaurant remembers about them. Bookings made without an account are on the reservations screen instead."
        }
      />

      <CustomerManager guests={guests} query={query} />
    </>
  );
}

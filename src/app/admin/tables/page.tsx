import type { Metadata } from "next";
import { Armchair } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { TableManager, type FloorTable } from "@/components/admin/table-manager";
import { prisma } from "@/lib/db";
import { BLOCKING_STATUSES, type Zone } from "@/lib/constants";
import { pluralise } from "@/lib/format";

export const metadata: Metadata = { title: "Tables — Savora" };
export const dynamic = "force-dynamic";

/**
 * The floor plan, as data.
 *
 * ## "Upcoming" is counted, not stored
 *
 * The `upcoming` figure on each row is a live count of bookings that still
 * occupy the table. It is not denormalised onto the table row, because a
 * denormalised count is wrong the moment a booking is cancelled, a booking is
 * moved to another table, or the clock passes the seated party's `endsAt` — none
 * of which involve the table row being written. A number that silently drifts
 * from the thing it claims to describe is worse than no number, so this is
 * computed on read.
 *
 * ## One grouped query, not N
 *
 * `groupBy` on `tableId` for the blocking statuses only, filtered to
 * `startsAt >= now()`. Counting all bookings would include the restaurant's own
 * history and report table 4 as "126 bookings ahead", which is true and useless.
 */
export default async function AdminTablesPage() {
  const now = new Date();

  const [tables, upcoming] = await Promise.all([
    prisma.restaurantTable.findMany({
      orderBy: { number: "asc" },
      select: { id: true, number: true, capacity: true, zone: true, isActive: true },
    }),

    prisma.reservation.groupBy({
      by: ["tableId"],
      where: {
        tableId: { not: null },
        startsAt: { gte: now },
        status: { in: BLOCKING_STATUSES },
      },
      _count: { _all: true },
    }),
  ]);

  const upcomingByTable = new Map(
    upcoming
      .filter((row): row is typeof row & { tableId: string } => row.tableId !== null)
      .map((row) => [row.tableId, row._count._all]),
  );

  const floor: FloorTable[] = tables.map((table) => ({
    id: table.id,
    number: table.number,
    capacity: table.capacity,
    zone: table.zone as Zone,
    isActive: table.isActive,
    upcoming: upcomingByTable.get(table.id) ?? 0,
  }));

  const totalCovers = floor.reduce((n, t) => n + (t.isActive ? t.capacity : 0), 0);
  const outOfService = floor.filter((t) => !t.isActive);

  return (
    <>
      <PageHeader
        eyebrow="Tables"
        title="The floor"
        description={`${pluralise(floor.length, "table")} · ${pluralise(totalCovers, "cover")} in service. A guest is only ever offered a table that is in service and seats their whole party, so a table taken out of service here disappears from the booking flow immediately.`}
      />

      {outOfService.length > 0 ? (
        <p className="mb-6 flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm text-ink-muted">
          <Armchair size={15} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <span>
            {pluralise(outOfService.length, "table is", "tables are")} out of service:{" "}
            <span className="text-ink">
              {outOfService.map((t) => `table ${t.number}`).join(", ")}
            </span>
            . Existing bookings against {outOfService.length === 1 ? "it" : "them"} stay where they
            are — put {outOfService.length === 1 ? "it" : "them"} back in service or move the
            booking from the book.
          </span>
        </p>
      ) : null}

      <TableManager tables={floor} />
    </>
  );
}

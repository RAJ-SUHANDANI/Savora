/**
 * Account route loading state.
 *
 * Next.js streams this while the server component runs, so it is the only thing
 * a guest sees between clicking a tab and the data arriving. The header and
 * tabs are deliberately absent: they come from the layout, which has already
 * rendered by the time this appears, so repeating them would make the page
 * jump. `ReservationCardSkeleton` mirrors the real card's dimensions, which is
 * the whole point of it — the content lands into the space it already occupies.
 */
import { ReservationCardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="mt-6 space-y-5" role="status" aria-label="Loading your bookings">
        {Array.from({ length: 3 }, (_, i) => (
          <ReservationCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

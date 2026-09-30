import { ChartSkeleton, Skeleton, StatSkeleton } from "@/components/ui/skeleton";

/**
 * Admin route-transition loader.
 *
 * Built from the same skeletons the real pages use, at the same heights, so
 * switching between dashboard sections does not reflow. The chart placeholder
 * stands in for the two-chart grid; the bars are the same shape the Recharts
 * output will have.
 */
export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-9 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />

      <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>

      <div className="mt-10">
        <ChartSkeleton />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );
}

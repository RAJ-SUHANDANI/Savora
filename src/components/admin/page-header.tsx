import { cn } from "@/lib/format";

/**
 * The heading block inside a dashboard page's content area.
 *
 * An `<h2>`, not an `<h1>`. The dashboard's `<h1>` is the section name in
 * `admin/top-bar.tsx`, which is sticky and present on every screen — so a second
 * `h1` here would put two competing document titles on one page and hand a
 * screen reader two competing entry points into the same content. This block is
 * the *page's* subject within that section, which is precisely what a second
 * level means.
 *
 * `actions` is a slot rather than a prop the caller has to position, so the
 * title/subtitle block and the buttons share one baseline rule on every
 * section — the fastest way to make a set of admin pages look like one product
 * is to make their headers behave identically.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className={cn("font-display", eyebrow ? "mt-2" : "", "text-display-md")}>{title}</h2>
        {description ? (
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

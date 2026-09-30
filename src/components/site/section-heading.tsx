/**
 * Section heading.
 *
 * The editorial label + headline + optional lede pattern that opens nearly every
 * section on the site. Centralised so the spacing rhythm and the rule treatment
 * are identical throughout — consistency here is what makes separate pages feel
 * like one publication rather than a set of templates.
 */
import { cn } from "@/lib/format";
import { DrawUnderline, Reveal } from "@/components/ui/reveal";

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
  rule = true,
  className,
  action,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: "left" | "center";
  rule?: boolean;
  className?: string;
  /** Optional trailing element, e.g. a "see the full menu" link. */
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <Reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-4 text-display-lg">{title}</h2>
        {lede ? (
          <p className="mt-5 text-[1.0625rem] leading-relaxed text-ink-muted">{lede}</p>
        ) : null}
      </Reveal>

      {action ? (
        <Reveal index={1} className="shrink-0">
          {action}
        </Reveal>
      ) : null}

      {rule ? <DrawUnderline className="sm:hidden" /> : null}
    </div>
  );
}

/** Lede paragraph used at the top of the longer editorial pages. */
export function Lede({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[1.125rem] leading-relaxed text-ink-muted sm:text-[1.25rem]", className)}>
      {children}
    </p>
  );
}

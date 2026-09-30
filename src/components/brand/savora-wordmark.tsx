import Link from "next/link";
import { cn } from "@/lib/format";
import { SavoraMark } from "./savora-mark";
import { siteConfig } from "@/lib/site-config";

/**
 * The full lockup: the mark, then the wordmark in the display serif.
 *
 * `size` drives both, because the mark and the type have to stay optically
 * related -- a 40px mark beside 24px type is a different logo from a 28px mark
 * beside 17px type. Deriving the type size from the mark size means there is
 * one number to tune per breakpoint instead of two that can drift apart.
 *
 * The wordmark keeps the tracking the display face wants rather than inheriting
 * the tighter tracking the headings use: at logo sizes a little air between
 * letters is what stops it reading as a heading.
 *
 * ## Why the link is 44px tall when the mark is 34px
 *
 * The lockup is the home link, and at 34px it was the smallest tap target in the
 * header. `min-h-11` adds the missing height invisibly -- the header is 96px so
 * nothing below it moves, and the mark stays optically centred because the
 * element is `items-center`. Growing the mark to fill 44px instead would have
 * made the logo taller in the header than the Reserve button beside it.
 */
export function SavoraWordmark({
  size = 34,
  className,
  withRule = true,
  href = "/",
}: {
  size?: number;
  className?: string;
  withRule?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex min-h-11 items-center gap-2.5", className)}
      aria-label={`${siteConfig.name} — home`}
    >
      <SavoraMark size={size} className="shrink-0" />
      <span className="flex items-center gap-2.5">
        <span
          className="font-display leading-none tracking-[0.02em] text-ink"
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          Savora
        </span>
        {withRule ? (
          <span
            className="hidden h-px w-8 origin-left bg-accent transition-transform duration-500 group-hover:scale-x-150 sm:block"
            aria-hidden="true"
          />
        ) : null}
      </span>
    </Link>
  );
}

"use client";

/**
 * Step 3 — the time.
 *
 * The only step that talks to the server, and the one that has to be honest
 * about the difference between "we are full" and "we could not reach the
 * server". Those are visually identical in a grid of greyed-out buttons, and
 * they lead a guest to very different conclusions, so they are rendered
 * differently on purpose.
 *
 * Unavailable slots are shown, not hidden. Hiding them would produce a shorter,
 * tidier grid, but a guest who sees 19:00 missing on a Friday and 19:30 present
 * reads it as a mistake; showing it greyed with "Full" is information.
 *
 * The zone preference is a *preference*, not a filter. "Terrace" means "if you
 * can", and the server still offers an indoor table rather than reporting the
 * terrace as sold out. The chips say so.
 */
import { motion } from "framer-motion";
import { AlertCircle, Info, RefreshCw, Sparkles, Sun, Tent, Warehouse } from "lucide-react";

import { StepHeading } from "@/components/reserve/step-heading";
import { SlotSkeleton } from "@/components/ui/skeleton";
import { EmptyMenu } from "@/components/ui/empty-state";
import type { Availability, Slot, SlotsStatus } from "@/components/reserve/use-slots";
import { ZONES, ZONE_LABELS, ZONE_SHORT, type Zone } from "@/lib/constants";
import { cn, formatTime } from "@/lib/format";
import { gridItem, gridStagger, selectionPulse } from "@/lib/motion";

const ZONE_ICONS: Record<Zone, typeof Sun> = {
  INDOOR: Warehouse,
  OUTDOOR: Sun,
  PRIVATE: Tent,
};

type Props = {
  status: SlotsStatus;
  error: string | null;
  data: Availability | null;
  dateLabel: string;
  partySize: number | null;
  time: string | null;
  zonePref: Zone | null;
  minNoticeHours: number;
  diningDurationMin: number;
  phone: string;
  onSelect: (time: string) => void;
  onZoneChange: (zone: Zone | null) => void;
  onRetry: () => void;
  onChangeDate: () => void;
};

export function TimeStep({
  status,
  error,
  data,
  dateLabel,
  partySize,
  time,
  zonePref,
  minNoticeHours,
  diningDurationMin,
  phone,
  onSelect,
  onZoneChange,
  onRetry,
  onChangeDate,
}: Props) {
  const slots = data?.slots ?? [];
  const openCount = slots.filter((s) => s.available).length;
  const isClosedDay = slots.length === 0;
  const isFullyBooked = !isClosedDay && openCount === 0;

  return (
    <div>
      <StepHeading
        stepLabel="Step three"
        title="What time suits?"
        hint={
          <>
            {dateLabel}
            {partySize ? ` · ${partySize} ${partySize === 1 ? "guest" : "guests"}` : null}
            {` · your table is yours for about ${diningDurationMin} minutes`}
          </>
        }
      />

      {/* ---- Zone preference -------------------------------------------- */}
      <div className="mt-8">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
          <Info size={13} className="text-ink-subtle" aria-hidden="true" />
          Seating preference — we will seat you inside if the terrace is full.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ZoneChip active={zonePref === null} onClick={() => onZoneChange(null)}>
            Anywhere
          </ZoneChip>
          {ZONES.map((zone) => {
            const Icon = ZONE_ICONS[zone];
            return (
              <ZoneChip
                key={zone}
                active={zonePref === zone}
                onClick={() => onZoneChange(zone)}
                icon={<Icon size={13} aria-hidden="true" />}
              >
                {ZONE_LABELS[zone]}
              </ZoneChip>
            );
          })}
        </div>
      </div>

      {/* ---- Slots ------------------------------------------------------ */}
      <div className="mt-9" aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" || status === "idle" ? (
          <SlotSkeleton count={15} />
        ) : status === "error" ? (
          <div className="rounded-2xl border border-wine/25 bg-wine/5 px-5 py-6">
            <p className="flex items-start gap-2.5 text-sm text-wine">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </p>
            <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm mt-4">
              <RefreshCw size={13} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : isClosedDay ? (
          <EmptyMenu
            compact
            title="We are closed that day"
            description="Our kitchen rests on that day of the week. Try another date, or call us and we will see what we can do."
            action={{ href: "/contact", label: "Get in touch" }}
            secondaryAction={{ href: "/menu", label: "Browse the menu" }}
          />
        ) : isFullyBooked ? (
          <EmptyMenu
            compact
            title="Every table is taken"
            description={
              <>
                We have {data?.suitableTables ?? 0}{" "}
                {data?.suitableTables === 1 ? "table" : "tables"} that seat{" "}
                {partySize}, and all of {data?.suitableTables === 1 ? "it is" : "them are"} out at every
                sitting that day. It happens on Thursdays and Fridays. Try another date, or
                telephone us on{" "}
                <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-accent underline underline-offset-2">
                  {phone}
                </a>{" "}
                and we will keep you on the list for cancellations.
              </>
            }
            action={{ href: "/contact", label: "Join the list" }}
            secondaryAction={{ href: "/menu", label: "Look at the menu" }}
          />
        ) : (
          <>
            <motion.ul
              key={`${data?.slots.length}-${zonePref ?? "any"}`}
              variants={gridStagger(0.015)}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
            >
              {slots.map((slot, i) => (
                <SlotButton
                  key={slot.time}
                  slot={slot}
                  index={i}
                  selected={slot.time === time}
                  onSelect={onSelect}
                />
              ))}
            </motion.ul>

            <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-subtle">
              <Sparkles size={12} className="text-saffron" aria-hidden="true" />
              {openCount} of {slots.length} sittings still open
              {minNoticeHours > 0 ? ` · we ask for ${minNoticeHours} hours' notice on the day` : null}
            </p>
          </>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <button type="button" onClick={onChangeDate} className="link-underline text-accent">
          Choose a different date
        </button>
        {zonePref ? (
          <button
            type="button"
            onClick={() => onZoneChange(null)}
            className="link-underline text-ink-muted"
          >
            Clear the {ZONE_SHORT[zonePref].toLowerCase()} preference
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SlotButton({
  slot,
  index,
  selected,
  onSelect,
}: {
  slot: Slot;
  index: number;
  selected: boolean;
  onSelect: (time: string) => void;
}) {
  const disabled = !slot.available;

  return (
    <motion.li variants={gridItem} custom={index}>
      <motion.button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(slot.time)}
        aria-pressed={selected}
        // `selectionPulse` only runs on the chosen button, so the confirmation
        // of a tap is a physical bounce rather than just a colour change.
        variants={selected ? selectionPulse : undefined}
        animate={selected ? "selected" : "idle"}
        className={cn(
          "relative flex h-[4.25rem] w-full flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors duration-200",
          selected
            ? "border-accent bg-accent text-accent-contrast shadow-[var(--shadow-lifted)]"
            : disabled
              ? "cursor-not-allowed border-transparent bg-surface-raised/70 text-ink-subtle"
              : "border-border-subtle bg-surface hover:border-accent/60 hover:bg-surface-raised",
        )}
      >
        <span
          className={cn(
            "font-display text-lg leading-none",
            disabled && "line-through decoration-1 opacity-60",
          )}
        >
          {formatTime(slot.time)}
        </span>

        {disabled ? (
          <span className="text-[0.5625rem] uppercase tracking-[0.12em]">
            {slot.reason === "no-suitable-table" ? "No table" : "Full"}
          </span>
        ) : slot.isLastTable ? (
          <span
            className={cn(
              "text-[0.5625rem] uppercase tracking-[0.12em]",
              selected ? "text-accent-contrast/75" : "text-saffron",
            )}
          >
            Last table
          </span>
        ) : (
          <span
            className={cn(
              "text-[0.5625rem] uppercase tracking-[0.12em]",
              selected ? "text-accent-contrast/60" : "text-ink-subtle",
            )}
          >
            {slot.tablesFree} {slot.tablesFree === 1 ? "table" : "tables"}
          </span>
        )}
      </motion.button>
    </motion.li>
  );
}

function ZoneChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all duration-200",
        active
          ? "border-accent bg-accent text-accent-contrast"
          : "border-border-strong text-ink-muted hover:border-accent/50 hover:text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

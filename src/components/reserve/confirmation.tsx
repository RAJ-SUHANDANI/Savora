"use client";

/**
 * Booking confirmation.
 *
 * The one screen a guest actually remembers, so it does the three things a
 * confirmation owes them: say clearly that the table is theirs, give them the
 * single piece of information they will need at the door (the code), and hand
 * them the means to change their mind without telephoning.
 *
 * The confetti is a soft brand-coloured double fountain rather than a party
 * popper — see `ConfettiBurst`. It is skipped entirely for anyone who has asked
 * for reduced motion, which is handled inside that component rather than here
 * so the rule is in one place.
 */
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, ClipboardCopy, Mail, MapPin, Users } from "lucide-react";

import { AnimatedCheckRing } from "@/components/ui/checkmark";
import { ConfettiBurst } from "@/components/ui/confetti";
import { ZONE_LABELS, type Zone } from "@/lib/constants";
import type { ConfirmedBooking } from "@/store/booking-store";
import { formatDate, formatTime } from "@/lib/format";
import { DURATION, EASE, fadeUpItem, staggerContainer } from "@/lib/motion";

type Props = {
  booking: ConfirmedBooking;
  restaurantName: string;
  address: string;
  phone: string;
  signedIn: boolean;
  onBookAnother: () => void;
};

export function Confirmation({
  booking,
  restaurantName,
  address,
  phone,
  signedIn,
  onBookAnother,
}: Props) {
  const [copied, setCopied] = useState(false);
  const manageHref = `/manage/${booking.id}?token=${booking.manageToken}`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(booking.confirmationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard access can be denied; the code is on screen to read aloud,
      // so failing silently here is better than an error the guest cannot act on.
    }
  };

  return (
    <div className="relative">
      <ConfettiBurst />

      <motion.div
        variants={staggerContainer(0.09, 0.1)}
        initial="hidden"
        animate="visible"
        className="text-center"
      >
        <motion.div variants={fadeUpItem} className="flex justify-center">
          <AnimatedCheckRing className="text-accent" />
        </motion.div>

        <motion.p variants={fadeUpItem} className="eyebrow mt-2">
          Reservation confirmed
        </motion.p>

        <motion.h2 variants={fadeUpItem} className="mt-4 font-display text-display-md">
          Your table is booked, {booking.guestName.split(" ")[0]}.
        </motion.h2>

        <motion.p variants={fadeUpItem} className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
          We have sent the details to{" "}
          <strong className="font-medium text-ink">{booking.guestEmail}</strong>. A reminder
          will follow the day before.
        </motion.p>

        {/* ---- The code ------------------------------------------------ */}
        <motion.div variants={fadeUpItem} className="mt-10">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-subtle">
            Quote this at the door
          </p>
          <div className="mt-3 inline-flex items-center gap-3">
            <span className="rounded-2xl border border-border-strong bg-surface-raised px-6 py-3 font-display text-3xl tracking-[0.18em]">
              {booking.confirmationCode}
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="btn btn-ghost btn-sm"
              aria-label="Copy the confirmation code"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-olive" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <ClipboardCopy size={13} aria-hidden="true" />
                  Copy
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* ---- Details --------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.slow, ease: EASE.out, delay: 0.5 }}
        className="card mx-auto mt-12 max-w-2xl p-7 md:p-9"
      >
        <dl className="grid gap-6 sm:grid-cols-2">
          <Detail icon={<MapPin size={14} />} label="Where">
            {restaurantName}
            <span className="mt-0.5 block text-ink-muted">{address}</span>
          </Detail>
          <Detail icon={<Users size={14} />} label="Who">
            {booking.partySize} {booking.partySize === 1 ? "guest" : "guests"}
            {booking.table ? (
              <span className="mt-0.5 block text-ink-muted">
                Table {booking.table.number}, seats {booking.table.capacity}
                {booking.table.zone ? (
                  <> · {ZONE_LABELS[booking.table.zone as Zone] ?? booking.table.zone}</>
                ) : null}
              </span>
            ) : null}
          </Detail>
        </dl>

        <div className="mt-7 rounded-2xl bg-surface-raised px-6 py-5 text-center">
          <p className="eyebrow">{formatDate(booking.date)}</p>
          <p className="mt-2 font-display text-3xl">{formatTime(booking.time)}</p>
        </div>

        <p className="mt-6 text-center text-sm leading-relaxed text-ink-muted">
          We hold the table for fifteen minutes past your booking time. If you are running
          late, telephone us on{" "}
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="link-underline text-accent">
            {phone}
          </a>{" "}
          and we will keep it.
        </p>
      </motion.div>

      {/* ---- Next steps ----------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-10 flex flex-col items-center gap-4"
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href={manageHref} className="btn btn-primary">
            Change or cancel this booking
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <button type="button" onClick={onBookAnother} className="btn btn-secondary">
            Book another table
          </button>
        </div>

        <p className="flex max-w-md items-center justify-center gap-2 text-center text-xs leading-relaxed text-ink-subtle">
          <Mail size={12} className="shrink-0" aria-hidden="true" />
          {signedIn
            ? "You can also find this booking any time under My bookings."
            : "The link above works without an account — it is unique to this booking."}
        </p>
      </motion.div>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-ink-subtle">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

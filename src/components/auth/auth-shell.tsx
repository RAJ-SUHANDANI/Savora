import Image from "next/image";
import Link from "next/link";
import { Quote } from "lucide-react";

/**
 * Shared frame for `/signin` and `/register`.
 *
 * Both pages are the same shape — an aside selling the restaurant and a card
 * holding one short form — so the frame is written once. The aside is not
 * decoration: a person about to type a password is deciding whether this is a
 * real restaurant or a convincing copy, and the strongest available signal is a
 * room they can see.
 *
 * The photograph is a full-bleed `next/image` so the optimiser handles the
 * responsive widths and the modern format; it sits behind a terracotta wash so
 * the overlaid Fraunces copy keeps its contrast whatever the image happens to
 * be on any given day.
 */
export function AuthShell({
  eyebrow,
  title,
  intro,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="container-editorial py-14 md:py-20">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:gap-16">
        {/* ---- Aside ------------------------------------------------------ */}
        <div className="hidden lg:block">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-4 font-display text-display-md text-balance">{title}</h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted">{intro}</p>

          <figure className="relative mt-10 aspect-[4/5] overflow-hidden rounded-3xl">
            <Image
              src="https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80"
              alt="The dining room at Savora, laid for evening service"
              fill
              sizes="(min-width: 1024px) 26rem, 0px"
              className="object-cover"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-espresso/85 via-espresso/25 to-transparent"
              aria-hidden="true"
            />
            <figcaption className="absolute inset-x-0 bottom-0 p-7">
              <Quote size={18} className="text-saffron" aria-hidden="true" />
              <p className="mt-3 font-display text-xl leading-snug text-cream">
                The best table in the house is the one where nobody is waiting.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-cream/60">
                Elena Vahidi &middot; Head chef
              </p>
            </figcaption>
          </figure>

          {aside}
        </div>

        {/* ---- The form -------------------------------------------------- */}
        <div className="lg:pl-4">
          {/* The aside is hidden on small screens, so the page needs a heading
              of its own there or the card would have no title at all. */}
          <div className="mb-8 lg:hidden">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-3 font-display text-3xl text-balance">{title}</h1>
          </div>

          <div className="card p-7 md:p-9">{children}</div>

          <p className="mt-7 text-center text-xs leading-relaxed text-ink-subtle">
            <Link href="/" className="link-underline">
              Savora
            </Link>{" "}
            &middot; 18 Alder Lane, Colchester &middot;{" "}
            <Link href="/contact" className="link-underline">
              Getting here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

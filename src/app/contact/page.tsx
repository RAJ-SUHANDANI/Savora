/**
 * Contact and directions.
 *
 * The map is an OpenStreetMap embed rather than a Google or Mapbox one,
 * deliberately: OSM needs no API key, no account, and no billing, which is what
 * keeps the site deployable for nothing. A JS SDK would have added a script
 * request, a key in the bundle, and a cost the moment it got traffic.
 */
import type { Metadata } from "next";
import { Car, Train, Footprints, MapPin, Phone, Mail, Clock } from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { ContactForm } from "@/components/site/contact-form";
import { HoursList } from "@/components/site/hours-list";
import { SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/ui/reveal";
import { getSettings } from "@/lib/settings";
import { siteConfig } from "@/lib/site-config";
import { todayIn } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Contact",
  description: `Find ${siteConfig.name} on Alder Lane in ${siteConfig.address.city}, with opening hours, directions and a way to write to us.`,
  alternates: { canonical: "/contact" },
};

/** Editorial directions rather than data — there is no routing engine here. */
const DIRECTIONS = [
  {
    icon: Footprints,
    title: "On foot",
    body: "Two minutes from the high street. Take any road west past the town hall and turn up Alder Lane opposite the old post office. It is signed from the corner.",
    meta: "4 minutes from the centre",
  },
  {
    icon: Train,
    title: "By train",
    body: "Colchester North is a twelve-minute walk. Leave the station south, follow St John's Green, and you will see the lane on your left before you reach the bridge.",
    meta: "12 minutes, mostly flat",
  },
  {
    icon: Car,
    title: "By car",
    body: "There is no parking on the lane itself — it is a single-track street and we would rather you could still leave. The church car park on Crouch Street is two minutes away and free after six.",
    meta: "Crouch Street car park · free after 18:00",
  },
] as const;

export default async function ContactPage() {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);

  return (
    <PublicShell>
      {/* ---- Header ---------------------------------------------------- */}
      <header className="border-b border-border-subtle pb-14 pt-10 md:pb-20 md:pt-16">
        <div className="container-editorial">
          <p className="eyebrow">Getting here</p>
          <h1 className="mt-5 max-w-4xl text-display-xl">
            A quiet lane in the old town, hard to find and worth it.
          </h1>
          <p className="mt-7 max-w-2xl text-[1.125rem] leading-relaxed text-ink-muted">
            Alder Lane is a single-track street with no parking and, on a Friday, a
            queue of taxis. If you are coming for dinner, do leave the car at the
            church and walk.
          </p>
        </div>
      </header>

      {/* ---- Details + map -------------------------------------------- */}
      <section className="py-16 md:py-24">
        <div className="container-editorial">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <Reveal>
              <dl className="space-y-8">
                <div className="flex gap-4">
                  <MapPin size={18} className="mt-1 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <dt className="text-sm font-medium">Address</dt>
                    <dd className="mt-1.5 leading-relaxed text-ink-muted">
                      {settings.address}
                      <br />
                      <a
                        href={siteConfig.directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-underline mt-1 inline-block text-sm text-accent"
                      >
                        Open in Google Maps
                      </a>
                    </dd>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Phone size={18} className="mt-1 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <dt className="text-sm font-medium">Telephone</dt>
                    <dd className="mt-1.5 text-ink-muted">
                      <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="link-underline">
                        {settings.phone}
                      </a>
                      <p className="mt-1.5 text-sm">
                        Best for tonight&rsquo;s bookings and anything urgent.
                      </p>
                    </dd>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Mail size={18} className="mt-1 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <dt className="text-sm font-medium">Email</dt>
                    <dd className="mt-1.5 text-ink-muted">
                      <a href={`mailto:${settings.email}`} className="link-underline">
                        {settings.email}
                      </a>
                    </dd>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Clock size={18} className="mt-1 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
                  <div className="flex-1">
                    <dt className="text-sm font-medium">Opening hours</dt>
                    <dd className="mt-3">
                      <HoursList openingHours={settings.openingHours} today={today} />
                    </dd>
                    {settings.holidays.length > 0 ? (
                      <p className="mt-4 text-sm text-ink-muted">
                        <strong className="font-medium text-ink">Closed:</strong>{" "}
                        {settings.holidays.map((h) => h).join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </dl>

              <a href="/reserve" className="btn btn-primary mt-10">
                Reserve a table
              </a>
            </Reveal>

            <Reveal
              index={1}
              className="grain relative min-h-[24rem] overflow-hidden rounded-[1.75rem] border border-border-subtle lg:min-h-full"
            >
              <iframe
                title={`Map showing ${settings.name} on ${siteConfig.address.street}, ${siteConfig.address.city}`}
                src={siteConfig.mapEmbedUrl}
                className="absolute inset-0 h-full w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- Directions ------------------------------------------------ */}
      <section className="border-y border-border-subtle bg-surface-raised py-20 md:py-28">
        <div className="container-editorial">
          <SectionHeading eyebrow="Arriving" title="How to get to us" rule={false} />
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-12">
            {DIRECTIONS.map(({ icon: Icon, title, body, meta }, i) => (
              <Reveal key={title} index={i}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-terracotta-soft text-accent">
                  <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="mt-6 font-display text-xl">{title}</h3>
                <p className="mt-3.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                <p className="mt-4 text-xs text-ink-subtle">{meta}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Form ------------------------------------------------------- */}
      <section className="py-20 md:py-28">
        <div className="container-editorial">
          <div className="mx-auto max-w-2xl">
            <ContactForm />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

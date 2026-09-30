import Link from "next/link";
import { Clock, MapPin, Phone, Instagram, ArrowUpRight } from "lucide-react";
import { NewsletterForm } from "@/components/layout/newsletter-form";
import { getSettings, openingHoursOf } from "@/lib/settings";
import { DAY_LABELS, DAY_KEYS } from "@/lib/constants";
import { formatTime } from "@/lib/format";
import { footerLinks, siteConfig } from "@/lib/site-config";
import { SavoraWordmark } from "@/components/brand/savora-wordmark";

/**
 * Site footer.
 *
 * Opens with a large editorial statement rather than a link list, because for a
 * restaurant the first thing a visitor wants is the address and the hours —
 * the two facts they came for. Links follow underneath in the conventional
 * three-column arrangement.
 */
export async function SiteFooter() {
  const settings = await getSettings();
  const hours = openingHoursOf(settings);

  return (
    <footer className="mt-32 border-t border-border-subtle bg-surface-sunken">
      <div className="container-editorial py-20">
        {/* Brand lockup. The footer used to open straight into "Find us", which
            meant the last thing on every page had no logo on it at all. */}
        <SavoraWordmark size={40} withRule={false} className="mb-12" />

        {/* Lead block */}
        <div className="grid gap-14 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="eyebrow">Find us</p>
            <h2 className="mt-5 max-w-lg text-display-lg text-balance">
              A small Mediterranean kitchen in Colchester Old Town.
            </h2>
            <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
              {settings.tagline}. We cook what is good that week, and we would rather seat thirty
              people well than sixty quickly.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/reserve" className="btn btn-primary">
                Reserve a table
              </Link>
              <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="btn btn-secondary">
                <Phone size={15} /> Call us
              </a>
            </div>

            {/* `py-2` rather than nothing: the icon and the text together are only 20px
                tall, which is a hard tap on a phone. The padding is invisible
                because the surrounding block is laid out with `space-y-*`, and
                it lifts the hit area to a comfortable 44px. */}
            <a
              href={siteConfig.instagram.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group tap-target mt-5 gap-2 text-sm text-ink-muted transition-colors hover:text-accent"
            >
              <Instagram size={15} />
              {siteConfig.instagram.handle}
              <ArrowUpRight
                size={13}
                className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </a>
          </div>

          {/* Hours and address */}
          <div className="space-y-10">
            <div>
              <p className="flex items-center gap-2 eyebrow">
                <Clock size={13} /> Opening hours
              </p>
              <dl className="mt-5 space-y-2.5">
                {DAY_KEYS.map((day) => {
                  const windows = hours[day] ?? [];
                  return (
                    <div key={day} className="flex items-baseline justify-between gap-4 text-sm">
                      <dt className="text-ink-muted">{DAY_LABELS[day]}</dt>
                      <dd className="text-right tabular-nums">
                        {windows.length === 0 ? (
                          <span className="text-ink-subtle">Closed</span>
                        ) : (
                          windows
                            .map(([open, close]) => `${formatTime(open)}–${formatTime(close)}`)
                            .join(", ")
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>

            <div>
              <p className="flex items-center gap-2 eyebrow">
                <MapPin size={13} /> Address
              </p>
              <address className="mt-4 text-sm not-italic leading-relaxed text-ink-muted">
                {siteConfig.address.street}
                <br />
                {siteConfig.address.city} {siteConfig.address.postcode}
              </address>
              {/* Same reason as the Instagram link above: a bare inline link is 20px tall
                  and is genuinely awkward to hit on a phone. */}
              <a
                href={siteConfig.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline tap-target mt-1 text-sm text-accent"
              >
                Directions in Google Maps
              </a>
            </div>
          </div>
        </div>

        {/* Link columns */}
        <div className="rule mt-16" />

        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {footerLinks.map((group) => (
            <div key={group.heading}>
              <h3 className="eyebrow">{group.heading}</h3>
              <ul className="mt-5 space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="link-underline text-sm text-ink-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="eyebrow">Newsletter</h3>
            <p className="mt-5 text-sm leading-relaxed text-ink-muted">
              Seasonal menus and the occasional extra table. No more than twice a month.
            </p>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border-subtle pt-8 text-xs text-ink-subtle sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()} {settings.name}. All rights reserved.
          </p>
          <p className="flex items-center gap-4">
            <span>18+ · No-smoking policy</span>
            <span aria-hidden="true">·</span>
            <span>Independent since 2016</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

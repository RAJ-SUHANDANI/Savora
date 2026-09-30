/**
 * Privacy notice.
 *
 * Written to be read rather than to be defensible in a tribunal: a guest with a
 * booking should be able to work out in ninety seconds what we hold, who sees
 * it and how to make us delete it. The numbers that the owner can change — the
 * booking window, the hold, the retention periods — are read from settings or
 * stated as constants at the top, so the page cannot quietly drift away from
 * what the software actually does.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Cookie, Database, Eye, Lock, Mail, ShieldCheck, Trash2 } from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { Lede, SectionHeading } from "@/components/site/section-heading";
import { Reveal, RevealSection } from "@/components/ui/reveal";
import { getSettings } from "@/lib/settings";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Savora collects when you book a table, who else sees it, how long we keep it, and how to ask us to delete it.",
  alternates: { canonical: "/privacy" },
};

/** The headline promises, in the order most guests actually care about. */
const PLEDGES = [
  {
    icon: Eye,
    title: "No advertising trackers",
    body: "We run no advertising pixels, no third-party marketing scripts and no cross-site retargeting. There is no profile of you sitting in a data broker, because we never send one there.",
  },
  {
    icon: Database,
    title: "Only what the booking needs",
    body: "A name, an email address, how many of you there are and when you would like to come. A phone number if you would rather we could reach you, and any allergy you tell us about.",
  },
  {
    icon: Mail,
    title: "Marketing only if you ask",
    body: "The confirmation and the reminder are transactional and we will always send them. The newsletter is separate, goes out at most twice a month, and stops the moment you unsubscribe.",
  },
  {
    icon: Trash2,
    title: "Deletion on request, in a month",
    body: "Ask and we remove your account and personal booking details. The only thing that survives is an anonymised count of covers, because the kitchen needs to know what to buy.",
  },
] as const;

/** Where the data actually goes. Deliberately short and specific. */
const PROCESSORS = [
  {
    who: "Our email provider",
    what: "Sends your confirmation, your reminder, and anything you write to us about a booking.",
  },
  {
    who: "Our web host",
    what: "Serves the site and stores the booking database. The database sits in the United Kingdom.",
  },
  {
    who: "The map on the contact page",
    what: "Only if you open it. Google receives the request, and therefore your IP address, the moment the map frame loads.",
  },
  {
    who: "Nobody else",
    what: "We do not sell data, share it with advertisers, or pass it to a booking platform. The only other people who ever see it are a regulator or a court, and only if the law compels us to.",
  },
] as const;

/** Retention. Two years for hospitality; six because HMRC says so. */
const RETENTION = [
  ["Bookings and guest details", "24 months after the dinner, then anonymised"],
  ["Your account and saved dishes", "Until you close it, then 30 days"],
  ["Newsletter subscription", "Until you unsubscribe"],
  ["Invoices and tax records", "6 years — we have no choice on this one"],
] as const;

/** The UK GDPR rights, in plain words rather than statutory ones. */
const RIGHTS = [
  ["Ask for a copy", "We will email you everything we hold about you, in a readable file."],
  ["Get it corrected", "One email and we will fix a wrong name, phone number or address."],
  ["Ask us to delete it", "We will close your account and remove your personal booking details."],
  ["Ask us to stop", "Tell us to pause all non-essential email and we will."],
  ["Ask us to limit it", "We will keep the record but stop using it while a complaint is resolved."],
  ["Take it elsewhere", "You can ask for your bookings as a CSV and take them to another restaurant."],
] as const;

export default async function PrivacyPage() {
  const settings = await getSettings();

  return (
    <PublicShell>
      {/* ---- Header ---------------------------------------------------- */}
      <header className="border-b border-border-subtle pb-14 pt-10 md:pb-20 md:pt-16">
        <div className="container-editorial">
          <p className="eyebrow">Privacy</p>
          <h1 className="mt-5 max-w-4xl text-display-xl">
            What we hold, who sees it, and how to make us delete it.
          </h1>
          <Lede className="mt-8 max-w-2xl">
            A restaurant needs a name, an email address and a date to put a table
            on the list. Everything below is either that, or the reason we cannot
            give it to you. If anything here is unclear, telephone us and a person
            will explain it.
          </Lede>
        </div>
      </header>

      {/* ---- The four promises ------------------------------------------ */}
      <section className="py-20 md:py-28">
        <div className="container-editorial">
          <SectionHeading
            eyebrow="The short version"
            title="Four things worth knowing before you book"
            rule={false}
          />
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:gap-12">
            {PLEDGES.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} index={i}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-terracotta-soft text-accent">
                  <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="mt-6 font-display text-xl leading-snug">{title}</h3>
                <p className="mt-3.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- What we collect -------------------------------------------- */}
      <RevealSection className="border-y border-border-subtle bg-surface-raised py-20 md:py-28">
        <div className="container-editorial">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <p className="eyebrow">What we collect</p>
              <h2 className="mt-4 text-display-lg">The whole list</h2>
              <p className="mt-7 leading-relaxed text-ink-muted">
                There is no hidden appendix. If a field is not on this page, we do
                not ask for it and we do not hold it.
              </p>
            </Reveal>

            <Reveal index={1} className="space-y-6 text-[1.0625rem] leading-relaxed text-ink-muted">
              <p>
                <strong className="font-medium text-ink">When you book a table</strong> we
                take your name, email address, the date and time, the number of
                people, and any dietary requirements or note you type in. A telephone
                number is optional, but it is the quickest way to reach you if
                something has gone wrong on the day.
              </p>
              <p>
                <strong className="font-medium text-ink">When you create an account</strong>{" "}
                we hold that same name and email address, a one-way hash of your
                password that cannot be reversed, and any dishes you have saved. We
                never see, store or email your password.
              </p>
              <p>
                <strong className="font-medium text-ink">When you join the newsletter</strong>{" "}
                we hold your email address and nothing else — no name, no tracking
                pixel in the email to tell whether you opened it.
              </p>
              <p>
                <strong className="font-medium text-ink">When you simply browse</strong> we
                write ordinary server logs: which page was requested, when, and from
                which IP address. They are kept for a fortnight and used only to fix
                broken pages and to see whether anyone is trying to break the booking
                form.
              </p>
            </Reveal>
          </div>
        </div>
      </RevealSection>

      {/* ---- Who else sees it ------------------------------------------- */}
      <section className="py-20 md:py-28">
        <div className="container-editorial">
          <SectionHeading
            eyebrow="Who else sees it"
            title="Three services, and then nobody"
            lede="Every restaurant website runs on someone else&rsquo;s hardware. These are the only three, and each is here for a reason you would recognise."
          />
          <dl className="mt-14 divide-y divide-border-subtle border-y border-border-subtle">
            {PROCESSORS.map(({ who, what }, i) => (
              <Reveal key={who} index={i}>
                <div className="grid gap-2 py-6 sm:grid-cols-[14rem_1fr] sm:gap-8">
                  <dt className="font-display text-lg leading-snug">{who}</dt>
                  <dd className="text-[0.95rem] leading-relaxed text-ink-muted">{what}</dd>
                </div>
              </Reveal>
            ))}
          </dl>

          <Reveal className="mt-10 flex gap-4">
            <ShieldCheck size={18} className="mt-1 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
              We do not run advertising trackers, affiliate pixels, or third-party
              analytics. That is partly a privacy decision and partly an economic
              one: none of them would be worth the money they cost.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---- Retention + rights ------------------------------------------ */}
      <RevealSection className="border-y border-border-subtle bg-surface-raised py-20 md:py-28">
        <div className="container-editorial">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <p className="eyebrow">How long</p>
              <h2 className="mt-4 text-display-lg">Keeping it, then letting go</h2>
              <dl className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
                {RETENTION.map(([what, howLong]) => (
                  <div key={what} className="py-4">
                    <dt className="text-sm font-medium">{what}</dt>
                    <dd className="mt-1 text-sm text-ink-muted">{howLong}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-8 text-sm leading-relaxed text-ink-muted">
                Anonymised means the booking survives as a date and a party size with
                the name stripped out, because counting covers is the only way we
                know how much bread to buy on Friday.
              </p>
            </Reveal>

            <Reveal index={1}>
              <p className="eyebrow">Your rights</p>
              <h2 className="mt-4 text-display-lg">Six things you can ask for</h2>
              <ul className="mt-8 space-y-5">
                {RIGHTS.map(([title, body]) => (
                  <li key={title} className="flex gap-4">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    <p className="text-sm leading-relaxed text-ink-muted">
                      <strong className="font-medium text-ink">{title}.</strong> {body}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-9 text-sm leading-relaxed text-ink-muted">
                We answer every request within a month, in plain English, without
                asking you to prove who you are beyond confirming the email address
                on the booking. If you are not happy with our answer you can complain
                to the Information Commissioner&rsquo;s Office at ico.org.uk.
              </p>
            </Reveal>
          </div>
        </div>
      </RevealSection>

      {/* ---- Cookies ----------------------------------------------------- */}
      <section className="py-20 md:py-28">
        <div className="container-editorial">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <p className="eyebrow">Cookies</p>
              <h2 className="mt-4 text-display-lg">Two, and neither is optional</h2>
            </Reveal>

            <Reveal index={1} className="space-y-6 text-[1.0625rem] leading-relaxed text-ink-muted">
              <p>
                <strong className="font-medium text-ink">One session cookie</strong> keeps
                you signed in and stops a second person using your account on a shared
                computer. It is a strict-necessary cookie, it expires when you close
                the browser, and it is the only thing the site stores on your device
                that identifies you.
              </p>
              <p>
                <strong className="font-medium text-ink">One local storage key</strong>,
                <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-[0.9em]">
                  savora-theme
                </code>
                , remembers whether you chose the light or the dark version of the
                site. It never leaves your browser and it is not a cookie at all.
              </p>
              <p>
                There is no consent banner on this site because there is nothing to
                consent to. A banner asking permission to track you on a page you came
                to in order to book dinner would be a strange thing to be asked to
                read.
              </p>
              <p className="flex gap-4 pt-2">
                <Lock size={17} className="mt-1.5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Bookings are transmitted over HTTPS, and the booking form is the
                  only place on the site that asks for personal details. It posts
                  straight to our own server, not to a third-party booking platform.
                </span>
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- Contact ----------------------------------------------------- */}
      <section className="border-t border-border-subtle bg-surface-raised py-20 text-center md:py-28">
        <div className="container-editorial">
          <Reveal>
            <Cookie size={22} className="mx-auto text-accent/60" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="mx-auto mt-6 max-w-2xl text-display-lg text-balance">
              Anything here unclear, ask a person.
            </h2>
            <p className="mx-auto mt-6 max-w-lg leading-relaxed text-ink-muted">
              Write to{" "}
              <a href={`mailto:${settings.email}`} className="link-underline text-accent">
                {settings.email}
              </a>{" "}
              or telephone {settings.phone}. For anything about an existing booking we
              will also need the date and the name on it.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href="/contact" className="btn btn-primary">
                Contact us
              </Link>
              <Link href="/terms" className="btn btn-secondary">
                Read the booking terms
              </Link>
            </div>
            <p className="mx-auto mt-10 max-w-md text-xs leading-relaxed text-ink-subtle">
              Last reviewed{" "}
              {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              . We will put a note on this page if anything above changes.
            </p>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}

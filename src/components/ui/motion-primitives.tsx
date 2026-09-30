"use client";

import { motion, useMotionValue, useSpring, useInView, useScroll } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { EASE, DURATION, staggerContainer, fadeUpItem, fadeInItem } from "@/lib/motion";
import { cn } from "@/lib/format";

/**
 * Parallax container.
 *
 * `useScroll` on the wrapper plus a spring-smoothed `y` transform gives a slow,
 * weighty drift as the section moves. The spring (rather than a raw
 * `useTransform`) is what makes it feel like a camera and not a glitch: a
 * spring has velocity, so fast flicks carry momentum.
 *
 * The range is deliberately small (6-14% of the element's height). Larger
 * values look impressive in isolation but read as a mistake on a page, because
 * nothing else in the layout moves.
 */
export function Parallax({
  children,
  speed = 0.12,
  className,
}: {
  children: ReactNode;
  /** Fraction of the element's travel to offset by. Keep under 0.2. */
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const raw = useMotionValue(0);
  const smooth = useSpring(raw, { stiffness: 90, damping: 26, mass: 0.6 });
  const inView = useInView(ref, { once: true, margin: "-100px" });

  // Bridge the scroll progress (0→1 as the element crosses the viewport) into
  // the spring, re-centred on 0.5 so the element starts and ends in place.
  useEffect(() => {
    return scrollYProgress.on("change", (v) => smooth.set((v - 0.5) * speed * -1000));
  }, [scrollYProgress, smooth, speed]);

  // The wrapper clips, so the drifting child needs somewhere to drift *to*.
  //
  // `y` ranges over ±(0.5 * speed * 1000) = ±500*speed. Without headroom the
  // translate pushes the bottom of the child past the clip edge and the wrapper
  // silently crops it — which is what cut 21px off the bottom of the About hero
  // image at 390px. Padding the child by the travel and pulling it back by the
  // same amount keeps the wrapper exactly the size it was, gives the drift a
  // symmetric margin to move inside, and never crops.
  const travel = Math.round(500 * speed);

  return (
    <div ref={ref} className={cn("overflow-hidden", className)}>
      <motion.div
        style={{
          y: smooth,
          opacity: inView ? 1 : 0.9,
          // Padding and an equal negative margin: the box grows downward and is
          // pulled back up, so the visible geometry is unchanged.
          paddingBlock: travel,
          marginBlock: -travel,
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Split-text word reveal.
 *
 * Words animate individually with a stagger, which is the effect that makes a
 * headline feel typeset rather than faded in. The split is by word, not
 * character: character splitting breaks the reading rhythm and, for a serif
 * face, severs letterfit ligatures.
 *
 * The parent controls `start` so a headline can be kicked off before its
 * siblings rather than all firing on mount.
 */
export function SplitWords({
  text,
  className,
  delay = 0,
  stagger = 0.045,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: "span" | "h1" | "h2" | "p";
}) {
  const words = text.split(" ");
  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            transition={{
              duration: DURATION.reveal,
              ease: EASE.out,
              delay: delay + i * stagger,
            }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/**
 * Hero with staggered text reveal.
 *
 * The container variant drives the stagger so the eyebrow, headline, copy and
 * CTAs arrive in reading order. The image is offset to the right and given a
 * parallax drift, creating the asymmetric layout the brief asked for without
 * breaking on narrow screens.
 */
export function HeroSection({
  eyebrow,
  title,
  body,
  primaryCta,
  secondaryCta,
  image,
  imageAlt,
  aside,
}: {
  eyebrow: string;
  title: string;
  body: string;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  image: ReactNode;
  imageAlt: string;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden pb-24 pt-8 md:pb-32">
      {/* Warm radial wash behind the headline. */}
      <div
        className="pointer-events-none absolute -left-40 -top-24 h-[34rem] w-[34rem] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-terracotta) 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="container-editorial relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <motion.div variants={staggerContainer(0.11, 0.15)} initial="hidden" animate="visible">
            <motion.p variants={fadeInItem} className="eyebrow">
              {eyebrow}
            </motion.p>

            <SplitWords
              as="h1"
              text={title}
              delay={0.25}
              className="mt-6 text-display-2xl text-balance"
            />

            <motion.p
              variants={fadeUpItem}
              className="mt-8 max-w-lg text-[1.0625rem] leading-relaxed text-ink-muted"
            >
              {body}
            </motion.p>

            <motion.div variants={fadeUpItem} className="mt-10 flex flex-wrap items-center gap-3">
              <Link href={primaryCta.href} className="btn btn-primary group">
                {primaryCta.label}
                <ArrowRight
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </Link>
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="btn btn-secondary">
                  {secondaryCta.label}
                </Link>
              ) : null}
            </motion.div>

            {aside ? (
              <motion.div variants={fadeUpItem} className="mt-12">
                {aside}
              </motion.div>
            ) : null}
          </motion.div>

          {/* Asymmetric image column: taller, and pulled up on desktop. */}
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.1, ease: EASE.out, delay: 0.3 }}
            className="relative lg:-mt-10"
          >
            <div className="grain relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-[var(--shadow-float)] sm:aspect-[5/6] lg:aspect-[3/4]">
              {image}
            </div>
            <span className="sr-only">{imageAlt}</span>

            {/* Overlapping card: a small editorial detail that adds depth and
                gives the composition an anchor in the lower left. */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: EASE.out, delay: 0.8 }}
              className="absolute -bottom-6 -left-4 hidden max-w-[15rem] rounded-2xl border border-border-subtle bg-surface/95 p-5 shadow-[var(--shadow-float)] backdrop-blur-sm sm:block lg:-left-10"
            >
              <p className="eyebrow">Tonight</p>
              <p className="mt-2 font-display text-lg leading-snug">
                The sea bass, the duck, and whatever the garden gave us this morning.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/**
 * Full-bleed video/image hero.
 *
 * The media sits behind a gradient scrim, and the type sits on top. The scrim
 * is a three-stop vertical gradient rather than a flat overlay so the image
 * stays legible at the top while the text below has a reliable ground.
 */
export function MediaHero({
  media,
  children,
  scrim = "from-espresso/85 via-espresso/55 to-espresso/25",
  className,
  minHeight = "min-h-[92dvh]",
}: {
  media: ReactNode;
  children: ReactNode;
  scrim?: string;
  className?: string;
  minHeight?: string;
}) {
  return (
    <section
      className={cn(
        "relative flex items-end overflow-hidden",
        minHeight,
        className,
      )}
    >
      <div className="absolute inset-0 -z-10">{media}</div>
      <div className={cn("absolute inset-0 -z-10 bg-gradient-to-b", scrim)} aria-hidden="true" />
      <div className="container-editorial relative pb-20 pt-40 md:pb-28">{children}</div>
    </section>
  );
}

/** A play button for the hero's video. Styled to feel like a film control. */
export function PlayButton({ onClick, label = "Play film" }: { onClick?: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-3 text-sm text-accent-contrast/90 transition-colors hover:text-accent-contrast"
    >
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-accent-contrast/40 transition-colors group-hover:border-accent-contrast">
        {/* Expanding ring on hover — a "pulse" without an infinite loop. */}
        <span className="absolute inset-0 rounded-full border border-accent-contrast/30 transition-transform duration-500 group-hover:scale-110" />
        <Play size={16} className="ml-0.5 fill-current" />
      </span>
      <span className="link-underline">{label}</span>
    </button>
  );
}

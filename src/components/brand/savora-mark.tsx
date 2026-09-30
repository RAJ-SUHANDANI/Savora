/**
 * The Savora mark.
 *
 * A rosette: three petals at 120 degrees around a terracotta disc, drawn in
 * cream. Chosen over a more literal olive sprig because a sprig collapses at
 * 16px -- stem, four leaves and a fruit all compete for the same pixels -- while
 * three identical radial petals stay legible down to a favicon. The mark is also
 * 3-fold symmetric, so it is correct by construction rather than by eye: one
 * petal is drawn and the other two are that petal rotated.
 *
 * The two colours are fixed rather than `currentColor`. A logo that inverts with
 * the theme stops being a logo -- the reader should recognise it in a dark-mode
 * screenshot the same way they do in a light one -- and a fixed terracotta disc
 * keeps the mark legible on the cream ground, on espresso, and on a photograph.
 */
export function SavoraMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Savora"
    >
      <circle cx="32" cy="32" r="32" fill="#C4623F" />
      <g fill="#FDF8F3">
        {/* Hub. Reaches past each petal's base so no seam shows between them. */}
        <circle cx="32" cy="32" r="9" />
        <g transform="rotate(0 32 32)">
          <path d="M39 32 C43 17 52 17 56 32 C52 47 43 47 39 32 Z" />
        </g>
        <g transform="rotate(120 32 32)">
          <path d="M39 32 C43 17 52 17 56 32 C52 47 43 47 39 32 Z" />
        </g>
        <g transform="rotate(240 32 32)">
          <path d="M39 32 C43 17 52 17 56 32 C52 47 43 47 39 32 Z" />
        </g>
      </g>
    </svg>
  );
}

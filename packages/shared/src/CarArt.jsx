/**
 * The car in the auth scenes, lifted from the supplied artwork.
 *
 * Gradient stops read the scene's palette (`--g1`, `--g2`, `--brass`), so the
 * same drawing sits on the renter's green and the owner's wine without a second
 * copy. Both screens of the signup funnel — the split form and phone
 * verification — use it, so the scene does not change as you move between
 * them.
 *
 * `viewBox` is a prop because the two frames differ in height: verification
 * shows the road and the car (`0 70 600 190`), while signup gives the sky more
 * room (`0 0 600 260`, the artwork's own box). Both are the drawing's natural
 * ratio, so `slice` never crops the car.
 */
export default function CarArt({
  className = 'car-art',
  viewBox = '0 70 600 190',
}) {
  return (
    <svg className={className} viewBox={viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="car-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--g1)" />
          <stop offset="0.55" stopColor="var(--g2)" />
          <stop offset="1" stopColor="#f2b66d" />
        </linearGradient>
        <radialGradient id="car-sun">
          <stop offset="0" stopColor="#fff3c9" />
          <stop offset="1" stopColor="#fff3c9" stopOpacity="0" />
        </radialGradient>
        {/* The body has to end darker than the scene behind it, or the lower
            half of the car dissolves into the background and only the roof
            and wheels read. */}
        <linearGradient id="car-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brass)" />
          <stop offset="0.4" stopColor="var(--g2)" />
          <stop offset="1" stopColor="#05080a" />
        </linearGradient>
        <linearGradient id="car-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3ecd9" stopOpacity="0.75" />
          <stop offset="1" stopColor="#12060b" />
        </linearGradient>
        <linearGradient id="car-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="car-rim">
          <stop offset="0" stopColor="#ecd9a8" />
          <stop offset="1" stopColor="#7f6630" />
        </radialGradient>
        <linearGradient id="car-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ecd9a8" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ecd9a8" stopOpacity="0" />
        </linearGradient>
        <clipPath id="car-clip">
          <path d="M40 192C40 178 60 170 104 164L172 148C202 122 254 104 326 104C396 104 446 120 478 146L536 158C562 164 574 174 574 190L574 202L40 202Z" />
        </clipPath>
      </defs>

      <rect width="600" height="260" fill="url(#car-sky)" />
      <circle cx="430" cy="150" r="110" fill="url(#car-sun)" opacity="0.75" />
      <circle cx="430" cy="150" r="26" fill="#fff3c9" />
      <path d="M0 170L90 120L170 160L270 100L380 165L470 125L600 170V220H0Z" fill="var(--g2)" opacity="0.75" />
      <path d="M0 190L120 150L230 185L350 140L480 190L600 160V230H0Z" fill="var(--g1)" />
      <rect y="214" width="600" height="46" fill="#14060b" />
      <path d="M0 214H600" stroke="#ecd9a8" strokeOpacity="0.4" />

      <ellipse cx="310" cy="222" rx="270" ry="14" fill="#000" opacity="0.5" />
      <g className="car-ground" stroke="#ecd9a8" strokeOpacity="0.35" strokeWidth="2">
        <path d="M-60 240H700" strokeDasharray="30 30" />
      </g>

      <g className="car-body-group">
        <polygon points="570,176 600,176 600,150 575,168" fill="url(#car-beam)" className="car-beam" />
        <path d="M40 192C40 178 60 170 104 164L172 148C202 122 254 104 326 104C396 104 446 120 478 146L536 158C562 164 574 174 574 190L574 202L40 202Z" fill="url(#car-body)" />
        <g clipPath="url(#car-clip)">
          <rect width="600" height="260" fill="url(#car-sheen)" opacity="0.12" />
          <path d="M40 170H574" stroke="#ecd9a8" strokeOpacity="0.5" strokeWidth="1.2" />
        </g>
        <path d="M186 148C214 126 258 114 322 114C386 114 428 126 456 146L186 148Z" fill="url(#car-glass)" />
        <path d="M318 114V148" stroke="#14060b" strokeWidth="3" />
        <rect x="540" y="168" width="22" height="7" rx="3" fill="#ecd9a8" />
        <rect x="44" y="172" width="16" height="6" rx="3" fill="#c94a5a" opacity="0.85" />

        <g>
          <circle cx="150" cy="202" r="34" fill="#050c09" />
          <g className="car-wheel">
            <circle cx="150" cy="202" r="22" fill="url(#car-rim)" />
            <path d="M150 182V222M130 202H170M136 188L164 216M164 188L136 216" stroke="#1a1608" strokeWidth="3" />
          </g>
        </g>
        <g>
          <circle cx="462" cy="202" r="34" fill="#050c09" />
          <g className="car-wheel">
            <circle cx="462" cy="202" r="22" fill="url(#car-rim)" />
            <path d="M462 182V222M442 202H482M448 188L476 216M476 188L448 216" stroke="#1a1608" strokeWidth="3" />
          </g>
        </g>
      </g>
    </svg>
  );
}

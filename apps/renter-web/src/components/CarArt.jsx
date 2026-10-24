import { useId } from 'react';

/**
 * The car drawing from the supplied CAR-ENT artwork.
 *
 * Kept as SVG rather than a photo: the design uses the car as its only
 * illustration, at three sizes (hero stage, card, list row), and it must
 * stay crisp and animatable (wheels spin on hover, the hero idles).
 *
 * `upright` switches to the taller SUV body. `accent` is the paint colour.
 * Gradient ids are per-instance so a grid of cards never shares a definition.
 */
export default function CarArt({ accent = '#c8362f', upright = false, className = '' }) {
  const raw = useId();
  const u = `ce${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const wheels = upright ? [92, 300] : [100, 300];
  const body = upright
    ? 'M20 108C20 96 28 92 42 88L76 80C86 56 104 40 132 38H280C304 38 322 54 336 78L360 86C376 90 382 98 382 110V124C382 128 378 130 374 130H26C22 130 20 128 20 124Z'
    : 'M20 112C20 100 28 96 44 92L88 82C104 62 130 48 164 46H236C268 46 294 62 314 84L356 92C374 96 382 102 382 114V124C382 128 378 130 374 130H26C22 130 20 128 20 124Z';
  const glass = upright
    ? 'M92 80C102 62 116 48 136 46H192V80ZM202 46H276C292 48 304 62 316 80H202Z'
    : 'M100 84C114 66 134 56 164 54H196V84ZM206 54H236C258 56 276 68 292 84H206Z';

  return (
    <svg viewBox="0 0 400 165" role="img" aria-label="Car" className={className}>
      <defs>
        <linearGradient id={u} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
          <stop offset=".8" stopColor="#000" stopOpacity=".25" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fb4c8" />
          <stop offset="1" stopColor="#1b232d" />
        </linearGradient>
        <radialGradient id={`${u}r`}>
          <stop offset="0" stopColor="#e6e6e6" />
          <stop offset="1" stopColor="#6b6b6b" />
        </radialGradient>
      </defs>

      <ellipse cx="200" cy="152" rx="185" ry="9" fill="#000" opacity=".4" />
      <path d={body} fill={accent} />
      <path d={body} fill={`url(#${u})`} />
      <path d={glass} fill={`url(#${u}w)`} />
      <path d="M30 100H370" stroke="#fff" strokeOpacity=".28" strokeWidth="1.5" />
      <rect x="368" y="98" width="14" height="6" rx="3" fill="#fff" />
      <rect x="18" y="98" width="10" height="6" rx="3" fill="#e0303a" />

      {wheels.map((x) => (
        <g key={x}>
          <circle cx={x} cy="128" r="30" fill="var(--arch)" />
          <circle cx={x} cy="128" r="25" fill="#101010" />
          <circle cx={x} cy="128" r="15" fill={`url(#${u}r)`} />
          <g className="wh" style={{ transformOrigin: `${x}px 128px` }}>
            <path
              d={`M${x} 114V142M${x - 14} 128H${x + 14}M${x - 10} 118L${x + 10} 138M${x + 10} 118L${x - 10} 138`}
              stroke="#5a5a5a"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
          <circle cx={x} cy="128" r="4" fill="#333" />
        </g>
      ))}
    </svg>
  );
}

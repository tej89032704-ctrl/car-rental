import { bodyOf } from './lib.js';

/**
 * The reference panel drew every car with one procedural SVG: a body shell and
 * a glass shape per body type, a gradient painted from the car's colour, and
 * wheels that spin while the card is hovered (.stage .w in theme.css).
 *
 * That generator is ported verbatim below, template literal and all -- the
 * markup is built from our own constants and never from user input, so it is
 * rendered through dangerouslySetInnerHTML to keep the SVG byte-identical to
 * the source. Every instance mints its own gradient/clip ids, because two cars
 * of the same colour on one page would otherwise share url(#b3) and cross-tint
 * each other.
 */

const P = {
  Hatchback: [
    'M38 106C34 92 36 70 52 62C74 46 120 38 176 38L254 38C288 40 308 58 322 74L362 82C376 86 378 98 374 106Z',
    'M76 70C94 50 128 44 176 44L250 44C276 46 294 58 308 72Z',
  ],
  Sedan: [
    'M30 106C28 92 32 84 46 80L100 74C118 52 150 40 190 38L246 38C280 40 304 56 322 72L360 80C374 84 376 96 372 106Z',
    'M108 74C124 56 152 46 190 45L242 45C270 47 290 60 306 73Z',
  ],
  Suv: [
    'M32 108C28 90 30 64 44 56L72 46C84 38 100 34 120 34L268 34C294 36 312 52 326 70L362 78C376 82 378 98 374 108Z',
    'M82 66C90 46 104 40 122 40L266 40C286 42 300 54 312 68Z',
  ],
  Van: [
    'M30 108L28 40C28 30 34 28 44 28L250 28C284 30 312 52 330 74L364 82C376 86 378 98 374 108Z',
    'M44 36L248 36C276 38 300 54 318 72L44 72Z',
  ],
};

let U = 0;

function buildCar(type, color) {
  const shape = P[type] || P.Sedan;
  const b = shape[0];
  const g = shape[1];
  const n = ++U;
  const c = color || '#b3262f';

  const spokes = [0, 72, 144, 216, 288]
    .map((a) => `<path d="M0 0L${(15 * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(15 * Math.sin((a * Math.PI) / 180)).toFixed(1)}"/>`)
    .join('');

  const wh = (x) =>
    `<g transform="translate(${x} 108)">` +
    `<circle r="31" fill="#07080a" clip-path="url(#c${n})" transform="translate(${-x} -108) translate(${x} 108)"/>` +
    `<circle r="26" fill="#101216"/>` +
    `<g class="w" style="transform-origin:${x}px 108px">` +
    `<circle r="17" fill="url(#r${n})"/>` +
    `<g stroke="#262a32" stroke-width="3.5" stroke-linecap="round">${spokes}</g>` +
    `<circle r="4" fill="#d5d9e0"/></g></g>`;

  return (
    `<svg class="car" viewBox="0 0 400 150" aria-hidden="true">` +
    `<defs>` +
    `<linearGradient id="b${n}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" style="stop-color:color-mix(in srgb,${c} 60%,#fff)"/>` +
    `<stop offset=".5" style="stop-color:${c}"/>` +
    `<stop offset="1" style="stop-color:color-mix(in srgb,${c} 50%,#000)"/>` +
    `</linearGradient>` +
    `<linearGradient id="g${n}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#55677d"/><stop offset=".6" stop-color="#141a23"/><stop offset="1" stop-color="#2d3a4a"/>` +
    `</linearGradient>` +
    `<radialGradient id="r${n}"><stop offset="0" stop-color="#eceef2"/><stop offset=".7" stop-color="#8a9099"/><stop offset="1" stop-color="#4a4f58"/></radialGradient>` +
    `<clipPath id="c${n}"><path d="${b}"/></clipPath>` +
    `<clipPath id="h${n}"><path d="${g}"/></clipPath>` +
    `<filter id="f${n}"><feGaussianBlur stdDeviation="5"/></filter>` +
    `</defs>` +
    `<ellipse cx="205" cy="136" rx="178" ry="9" fill="#000" opacity=".42" filter="url(#f${n})"/>` +
    `<path d="${b}" fill="url(#b${n})"/>` +
    `<path d="M48 90C150 82 262 82 360 92" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.5"/>` +
    `<path d="${g}" fill="url(#g${n})"/>` +
    `<path d="M150 36L186 36L140 78L104 78Z M220 36L238 36L192 78L174 78Z" fill="#fff" opacity=".13" clip-path="url(#h${n})"/>` +
    `<path d="M196 36V80M262 36V80" stroke="${c}" stroke-width="5" clip-path="url(#h${n})"/>` +
    `<rect x="36" y="101" width="336" height="5" fill="#000" opacity=".28" clip-path="url(#c${n})"/>` +
    `<path d="M358 85L372 90L371 95L357 93Z" fill="#fff6d6"/>` +
    `<rect x="30" y="86" width="8" height="6" rx="2" fill="#e5283a"/>` +
    `${wh(108)}${wh(300)}` +
    `</svg>`
  );
}

export default function CarArt({ category, color }) {
  const html = buildCar(bodyOf(category), color);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

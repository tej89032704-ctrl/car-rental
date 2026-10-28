/**
 * Demo car photos, drawn as SVG instead of shipped as JPEGs.
 *
 * The demo fleet needs images for two reasons: a card without one falls back to
 * the portal's flat artwork, and the gallery on the detail page collapses to
 * "No photos yet" — so neither the card layout nor the gallery can actually be
 * checked against a car that has real photos.
 *
 * The photos are generated rather than bundled because of how uploads work:
 * `uploads/` is gitignored, and the runtime image carries only `dist`, so a
 * JPEG in the repo would never reach the container. Drawing them here means one
 * source of truth in code, no licences, no hotlinked third-party assets, and
 * bytes that the seed writes through the same StorageService a real owner's
 * upload uses — so the serve path, the mime type and the access rules are all
 * exercised for real.
 *
 * Each car gets four views so the gallery has something to page through: a
 * studio side profile (the cover), front, rear and interior. They are flat
 * vector illustrations, not photographs; that is deliberate — a fake photo of a
 * real model would be a lie in a way a stylised render is not.
 */

const W = 1200;
const H = 800;

export interface PhotoCar {
  make: string;
  model: string;
  category: string;
  paint: string;
}

/** Proportions per body type, in one 1200x800 frame. */
interface Geometry {
  front: number;
  rear: number;
  belt: number;
  sill: number;
  roof: number;
  cabFront: number;
  cabRear: number;
  wheel: number;
  wheelFront: number;
  wheelRear: number;
}

const GEOMETRY: Record<string, Geometry> = {
  hatchback: { front: 210, rear: 1010, belt: 468, sill: 604, roof: 330, cabFront: 424, cabRear: 906, wheel: 78, wheelFront: 366, wheelRear: 878 },
  sedan: { front: 168, rear: 1042, belt: 460, sill: 606, roof: 318, cabFront: 430, cabRear: 866, wheel: 80, wheelFront: 344, wheelRear: 892 },
  suv: { front: 162, rear: 1048, belt: 442, sill: 590, roof: 296, cabFront: 402, cabRear: 904, wheel: 92, wheelFront: 352, wheelRear: 890 },
  van: { front: 150, rear: 1060, belt: 452, sill: 598, roof: 282, cabFront: 336, cabRear: 976, wheel: 86, wheelFront: 334, wheelRear: 906 },
  luxury: { front: 158, rear: 1052, belt: 458, sill: 608, roof: 330, cabFront: 448, cabRear: 884, wheel: 84, wheelFront: 348, wheelRear: 896 },
};

function geometryFor(category: string): Geometry {
  return GEOMETRY[String(category || '').toLowerCase()] || GEOMETRY.sedan;
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour. */
function shade(hex: string, amount: number): string {
  const clean = String(hex || '#8A9099').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  const target = amount < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amount));
  const mix = (c: number) => Math.round(c + (target - c) * p).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

/** Flat shelves of colour derived from the car's paint, so one hex is enough. */
function palette(paint: string) {
  return {
    paint,
    light: shade(paint, 0.28),
    deep: shade(paint, -0.38),
    shadow: shade(paint, -0.62),
    tyre: '#15181C',
    rim: '#8F99A6',
    glass: '#9FBBD0',
  };
}

/** Wheel with tyre, rim and spokes. */
function wheel(cx: number, cy: number, r: number, p: ReturnType<typeof palette>) {
  const spokes = [0, 72, 144, 216, 288]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const x2 = cx + Math.cos(a) * r * 0.56;
      const y2 = cy + Math.sin(a) * r * 0.56;
      return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    })
    .join('');
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r + 11}" fill="${p.deep}" opacity="0.55"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.tyre}"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.64).toFixed(1)}" fill="#262B32"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.64).toFixed(1)}" fill="none" stroke="${p.rim}" stroke-width="3" opacity="0.5"/>
      <g stroke="${p.rim}" stroke-width="6" stroke-linecap="round" opacity="0.85">${spokes}</g>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.17).toFixed(1)}" fill="${p.rim}"/>
    </g>`;
}

/** Shared defs: studio backdrop, floor shadow, and (at night) a headlight glow. */
function defs(night: boolean) {
  const wallTop = night ? '#12161F' : '#F2F5FA';
  const wallBottom = night ? '#1D2531' : '#D8DEE9';
  const floorTop = night ? '#0C0F15' : '#C3CAD6';
  const floorBottom = night ? '#05070A' : '#A9B2C1';
  return `
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${wallTop}"/>
      <stop offset="1" stop-color="${wallBottom}"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${floorTop}"/>
      <stop offset="1" stop-color="${floorBottom}"/>
    </linearGradient>
    <radialGradient id="floorShadow">
      <stop offset="0" stop-color="${night ? '#000000' : '#5A6272'}" stop-opacity="${night ? 0.75 : 0.42}"/>
      <stop offset="1" stop-color="${night ? '#000000' : '#5A6272'}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="#FFF4D6" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#FFF4D6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="screen">
      <stop offset="0" stop-color="#4E8FA6"/>
      <stop offset="1" stop-color="#0E2531"/>
    </radialGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${night ? '#1B2A3C' : '#BFD6EA'}"/>
      <stop offset="1" stop-color="${night ? '#2C3F55' : '#E7F0F8'}"/>
    </linearGradient>
  </defs>`;
}

/** Background plate every view sits on. */
function backdrop(night: boolean) {
  return `
    <rect width="${W}" height="${H}" fill="url(#wall)"/>
    <rect y="620" width="${W}" height="${H - 620}" fill="url(#floor)"/>`;
}

/** Side profile — the cover photo. */
function sideView(car: PhotoCar, night: boolean) {
  const g = geometryFor(car.category);
  const p = palette(car.paint);
  const mid = (g.cabFront + g.cabRear) / 2;
  const wheelCy = g.sill + 8;
  const groundY = wheelCy + g.wheel + 14;
  const glassTop = g.roof + 26;
  const glassBottom = g.belt - 12;

  const greenhouse = `
    M ${g.cabFront} ${g.belt}
    L ${g.cabFront + 56} ${g.roof + 12}
    Q ${g.cabFront + 68} ${g.roof} ${g.cabFront + 106} ${g.roof}
    L ${g.cabRear - 68} ${g.roof}
    Q ${g.cabRear - 32} ${g.roof} ${g.cabRear} ${g.belt}
    Z`;

  const window = (x1: number, x2: number, leanIn: number) => `
    <path d="M ${x1} ${glassBottom} L ${x1 + leanIn} ${glassTop} L ${x2} ${glassTop} L ${x2} ${glassBottom} Z"
      fill="${p.glass}" fill-opacity="${night ? 0.5 : 0.66}" stroke="${p.glass}" stroke-opacity="0.25" stroke-width="10" stroke-linejoin="round"/>`;

  const headlightX = g.front + 10;
  const taillightX = g.rear - 96;

  return `${defs(night)}${backdrop(night)}
  <ellipse cx="${(g.front + g.rear) / 2}" cy="${groundY}" rx="${(g.rear - g.front) / 2 + 60}" ry="30" fill="url(#floorShadow)"/>
  ${night ? `<ellipse cx="${g.front + 40}" cy="${groundY - 10}" rx="300" ry="46" fill="url(#glow)" opacity="0.45"/>` : ''}

  <g>
    <rect x="${g.front}" y="${g.belt}" width="${g.rear - g.front}" height="${g.sill - g.belt}" rx="30" fill="${p.paint}"/>
    <path d="${greenhouse}" fill="${p.deep}"/>
    <rect x="${g.front}" y="${g.belt}" width="${g.rear - g.front}" height="${g.sill - g.belt}" rx="30" fill="none" stroke="${p.deep}" stroke-width="3" stroke-opacity="0.35"/>

    ${window(g.cabFront + 74, mid - 20, 40)}
    ${window(mid + 20, g.cabRear - 46, 34)}

    <line x1="${mid}" y1="${g.belt - 4}" x2="${mid}" y2="${g.sill - 4}" stroke="${p.deep}" stroke-width="3" stroke-opacity="0.55"/>
    <line x1="${g.front + 34}" y1="${g.sill - 16}" x2="${g.rear - 34}" y2="${g.sill - 16}" stroke="${shade(car.paint, -0.5)}" stroke-width="7" stroke-opacity="0.5"/>

    ${wheel(g.wheelFront, wheelCy, g.wheel, p)}
    ${wheel(g.wheelRear, wheelCy, g.wheel, p)}

    <path d="M ${g.cabFront - 10} ${g.belt - 20} l 34 -8 l 8 22 l -32 10 z" fill="${p.deep}"/>
    <rect x="${headlightX}" y="${g.belt + 14}" width="86" height="28" rx="13" fill="${night ? '#FFF3D2' : '#E9F2FB'}" stroke="${shade(car.paint, -0.5)}" stroke-width="2"/>
    <rect x="${taillightX}" y="${g.belt + 12}" width="86" height="26" rx="11" fill="#C4202F"/>
    ${night ? `<circle cx="${headlightX + 44}" cy="${g.belt + 28}" r="70" fill="url(#glow)"/>` : ''}
    <rect x="${g.front + 8}" y="${g.sill - 34}" width="58" height="20" rx="9" fill="${shade(car.paint, -0.5)}" opacity="0.75"/>

    <rect x="${mid - 82}" y="${g.belt + 22}" width="46" height="12" rx="6" fill="${shade(car.paint, 0.5)}" opacity="0.9"/>
    <rect x="${mid + 40}" y="${g.belt + 22}" width="46" height="12" rx="6" fill="${shade(car.paint, 0.5)}" opacity="0.9"/>
  </g>`;
}

/** Front view. */
function frontView(car: PhotoCar, night: boolean) {
  const p = palette(car.paint);
  const g = geometryFor(car.category);
  const roofLift = Math.round((604 - g.roof) * 0.42);
  const bodyTop = 336;
  const bodyBottom = 636;

  return `${defs(night)}${backdrop(night)}
  <ellipse cx="600" cy="716" rx="400" ry="34" fill="url(#floorShadow)"/>

  <g>
    <rect x="238" y="${bodyBottom - 92}" width="726" height="92" rx="26" fill="${shade(car.paint, -0.45)}"/>
    <rect x="246" y="${bodyBottom - 40}" width="710" height="44" rx="18" fill="${p.tyre}"/>

    <path d="M 330 ${bodyTop} L 372 ${bodyTop - roofLift} Q 380 ${bodyTop - roofLift - 18} 402 ${bodyTop - roofLift - 18}
             L 798 ${bodyTop - roofLift - 18} Q 820 ${bodyTop - roofLift - 18} 828 ${bodyTop - roofLift}
             L 870 ${bodyTop} Z" fill="${p.deep}"/>

    <path d="M 376 ${bodyTop - 6} L 404 ${bodyTop - roofLift + 4} L 796 ${bodyTop - roofLift + 4} L 824 ${bodyTop - 6} Z"
      fill="${p.glass}" fill-opacity="${night ? 0.42 : 0.6}"/>

    <rect x="252" y="${bodyTop}" width="696" height="${bodyBottom - bodyTop - 60}" rx="48" fill="${p.paint}"/>
    <rect x="252" y="${bodyTop + 96}" width="696" height="86" rx="26" fill="${shade(car.paint, 0.1)}" opacity="0.55"/>

    <rect x="286" y="${bodyTop + 66}" width="158" height="66" rx="18" fill="${night ? '#FFF6DE' : '#EAF3FC'}" stroke="${p.deep}" stroke-width="3"/>
    <rect x="756" y="${bodyTop + 66}" width="158" height="66" rx="18" fill="${night ? '#FFF6DE' : '#EAF3FC'}" stroke="${p.deep}" stroke-width="3"/>
    <circle cx="365" cy="${bodyTop + 99}" r="20" fill="${night ? '#FFF9EA' : '#D3E6F5'}"/>
    <circle cx="835" cy="${bodyTop + 99}" r="20" fill="${night ? '#FFF9EA' : '#D3E6F5'}"/>

    <rect x="434" y="${bodyTop + 150}" width="332" height="92" rx="14" fill="#191D24"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="452" y="${bodyTop + 166 + i * 18}" width="296" height="7" rx="4" fill="${p.rim}" opacity="0.35"/>`).join('')}
    <circle cx="600" cy="${bodyTop + 152}" r="17" fill="${p.light}" opacity="0.85"/>

    <circle cx="330" cy="${bodyBottom - 78}" r="20" fill="${night ? '#FFF6DE' : '#DCE8F4'}" opacity="0.8"/>
    <circle cx="870" cy="${bodyBottom - 78}" r="20" fill="${night ? '#FFF6DE' : '#DCE8F4'}" opacity="0.8"/>

    <rect x="500" y="${bodyBottom - 96}" width="200" height="54" rx="8" fill="#0E1116"/>
    <rect x="510" y="${bodyBottom - 88}" width="180" height="38" rx="5" fill="#E9EDF2" opacity="0.9"/>
    ${night ? `<ellipse cx="600" cy="700" rx="360" ry="60" fill="url(#glow)" opacity="0.35"/>` : ''}
  </g>`;
}

/** Rear view. */
function rearView(car: PhotoCar, night: boolean) {
  const p = palette(car.paint);
  const g = geometryFor(car.category);
  const roofLift = Math.round((604 - g.roof) * 0.4);
  const bodyTop = 330;
  const bodyBottom = 640;

  return `${defs(night)}${backdrop(night)}
  <ellipse cx="600" cy="716" rx="396" ry="32" fill="url(#floorShadow)"/>

  <g>
    <rect x="240" y="${bodyBottom - 88}" width="720" height="88" rx="26" fill="${shade(car.paint, -0.45)}"/>

    <path d="M 340 ${bodyTop} L 380 ${bodyTop - roofLift} Q 388 ${bodyTop - roofLift - 16} 410 ${bodyTop - roofLift - 16}
             L 790 ${bodyTop - roofLift - 16} Q 812 ${bodyTop - roofLift - 16} 820 ${bodyTop - roofLift}
             L 860 ${bodyTop} Z" fill="${p.deep}"/>

    <path d="M 384 ${bodyTop - 6} L 410 ${bodyTop - roofLift + 6} L 790 ${bodyTop - roofLift + 6} L 816 ${bodyTop - 6} Z"
      fill="${p.glass}" fill-opacity="${night ? 0.4 : 0.55}"/>

    <rect x="252" y="${bodyTop}" width="696" height="${bodyBottom - bodyTop - 56}" rx="46" fill="${p.paint}"/>

    <rect x="286" y="${bodyTop + 70}" width="190" height="58" rx="16" fill="#C4202F"/>
    <rect x="724" y="${bodyTop + 70}" width="190" height="58" rx="16" fill="#C4202F"/>
    <rect x="430" y="${bodyTop + 90}" width="340" height="10" rx="5" fill="#C4202F" opacity="0.85"/>

    <line x1="276" y1="${bodyTop + 156}" x2="924" y2="${bodyTop + 156}" stroke="${p.deep}" stroke-width="4" stroke-opacity="0.45"/>
    <circle cx="600" cy="${bodyTop + 178}" r="20" fill="${p.light}" opacity="0.8"/>

    <rect x="498" y="${bodyBottom - 104}" width="204" height="62" rx="10" fill="#0E1116"/>
    <rect x="508" y="${bodyBottom - 96}" width="184" height="46" rx="6" fill="#E9EDF2" opacity="0.9"/>

    <rect x="330" y="${bodyBottom - 60}" width="90" height="30" rx="12" fill="#B8232F" opacity="0.8"/>
    <rect x="780" y="${bodyBottom - 60}" width="90" height="30" rx="12" fill="#B8232F" opacity="0.8"/>
    ${night ? `<ellipse cx="600" cy="700" rx="330" ry="54" fill="url(#glow)" opacity="0.22"/>` : ''}
  </g>`;
}

/** Interior — dashboard, wheel and cluster, so the gallery has a non-exterior shot. */
function interiorView(car: PhotoCar) {
  const p = palette(car.paint);
  return `${defs(false)}
  <rect width="${W}" height="${H}" fill="#0F1319"/>
  <rect width="${W}" height="230" fill="url(#sky)"/>
  <rect y="196" width="${W}" height="52" fill="#0B0E13" opacity="0.55"/>

  <!-- A-pillars and roof headliner -->
  <path d="M 0 240 L 210 60 L 300 60 L 120 300 Z" fill="#0B0E13"/>
  <path d="M ${W} 240 L 990 60 L 900 60 L 1080 300 Z" fill="#0B0E13"/>
  <rect width="${W}" height="58" fill="#0B0E13"/>

  <!-- Dashboard -->
  <path d="M 0 360 Q 300 306 600 318 Q 900 306 ${W} 360 L ${W} ${H} L 0 ${H} Z" fill="#171C24"/>
  <path d="M 0 372 Q 300 320 600 332 Q 900 320 ${W} 372" fill="none" stroke="${p.paint}" stroke-width="6" opacity="0.75"/>

  <!-- Instrument cluster behind the wheel -->
  <rect x="250" y="386" width="300" height="128" rx="20" fill="#0C1016" stroke="#242A33" stroke-width="3"/>
  <circle cx="332" cy="450" r="40" fill="none" stroke="#3E6F86" stroke-width="7" opacity="0.85"/>
  <circle cx="468" cy="450" r="40" fill="none" stroke="#3E6F86" stroke-width="7" opacity="0.85"/>
  <circle cx="332" cy="450" r="26" fill="none" stroke="${p.light}" stroke-width="3" opacity="0.6"/>
  <circle cx="468" cy="450" r="26" fill="none" stroke="${p.light}" stroke-width="3" opacity="0.6"/>
  <rect x="386" y="436" width="28" height="40" rx="6" fill="#3E6F86" opacity="0.7"/>

  <!-- Steering wheel -->
  <circle cx="400" cy="556" r="128" fill="none" stroke="#1B2028" stroke-width="34"/>
  <circle cx="400" cy="556" r="128" fill="none" stroke="#2A313B" stroke-width="10" opacity="0.7"/>
  <g stroke="#232A33" stroke-width="22" stroke-linecap="round">
    <line x1="400" y1="556" x2="400" y2="440"/>
    <line x1="400" y1="556" x2="300" y2="612"/>
    <line x1="400" y1="556" x2="500" y2="612"/>
  </g>
  <circle cx="400" cy="556" r="36" fill="#20262F" stroke="${p.paint}" stroke-width="4"/>

  <!-- Centre console: screen, vents, climate -->
  <rect x="640" y="368" width="366" height="300" rx="24" fill="#12171E" stroke="#242A33" stroke-width="3"/>
  <rect x="668" y="394" width="310" height="176" rx="14" fill="url(#screen)"/>
  <rect x="692" y="424" width="120" height="12" rx="6" fill="#CFE6EF" opacity="0.7"/>
  <rect x="692" y="450" width="200" height="9" rx="4" fill="#CFE6EF" opacity="0.45"/>
  <rect x="692" y="470" width="160" height="9" rx="4" fill="#CFE6EF" opacity="0.35"/>
  <circle cx="946" cy="530" r="16" fill="${p.light}" opacity="0.7"/>

  <rect x="668" y="590" width="140" height="40" rx="12" fill="#1B212A"/>
  <rect x="838" y="590" width="140" height="40" rx="12" fill="#1B212A"/>
  <circle cx="668" cy="656" r="20" fill="#1B212A" stroke="${p.paint}" stroke-width="3"/>
  <circle cx="740" cy="656" r="20" fill="#1B212A" stroke="${p.paint}" stroke-width="3"/>
  <rect x="806" y="640" width="180" height="34" rx="10" fill="#1B212A"/>

  <!-- Rear-view mirror shadow -->
  <rect x="540" y="60" width="120" height="42" rx="14" fill="#05070A" opacity="0.75"/>`;
}

/** The four photos, in gallery order. The first one is the card's cover image. */
export function renderDemoCarPhotos(car: PhotoCar): Array<{ view: string; svg: string }> {
  const wrap = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${body}</svg>`;
  return [
    { view: 'side', svg: wrap(sideView(car, false)) },
    { view: 'front', svg: wrap(frontView(car, false)) },
    { view: 'rear', svg: wrap(rearView(car, false)) },
    { view: 'interior', svg: wrap(interiorView(car)) },
  ];
}

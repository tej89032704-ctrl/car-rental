# Indian Vehicle Icon Pack (Duotone SVG)

8 duotone vehicle-type icons commonly used in Indian mobility/logistics apps (ride booking, delivery, marketplace filters, etc.):

- `hatchback.svg`
- `sedan.svg`
- `suv.svg`
- `auto-rickshaw.svg`
- `bike.svg` (motorbike / scooter)
- `truck.svg`
- `bus.svg`
- `tempo-van.svg`

Open `preview.html` in a browser to see them all together.

## Theming

Each icon uses two CSS custom properties so you can recolor them per-brand without editing the files:

```css
:root {
  --icon-primary: #1E293B;   /* body / dark tone */
  --icon-secondary: #7DD3FC; /* windows / accent tone */
}
```

**Important:** CSS variables only apply when the SVG is **inlined** into the DOM — not when loaded via `<img src="...">`, since browsers sandbox external image documents from page CSS. Use one of the methods below.

## Usage in plain HTML/JS

```html
<div class="icon-wrap" style="--icon-primary:#0F172A;--icon-secondary:#38BDF8;">
  <!-- paste the SVG markup directly here -->
</div>
```

## Usage in React

```jsx
import { ReactComponent as SedanIcon } from './sedan.svg'; // via SVGR / CRA

function VehicleCard() {
  return (
    <SedanIcon
      style={{ '--icon-primary': '#0F172A', '--icon-secondary': '#38BDF8' }}
      width={32}
      height={32}
    />
  );
}
```

If you're not using SVGR, fetch and inline the raw markup, or paste each SVG into a `.jsx` file as a component returning the markup directly.

## Usage in Vue

```vue
<template>
  <SedanIcon class="vehicle-icon" />
</template>
<style>
.vehicle-icon {
  --icon-primary: #0F172A;
  --icon-secondary: #38BDF8;
}
</style>
```

## Sizing

All icons use `viewBox="0 0 64 64"` with no fixed width/height, so they scale cleanly — just set `width`/`height` (or CSS) on the parent `<svg>` tag as needed.

## License

Free to use, modify, and ship in personal or commercial projects.

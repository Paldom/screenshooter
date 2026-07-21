# Theming — look-and-feel keys

The theme controls every visual the overlay engine draws. Set it in the
scenario (`theme: <preset>` / `theme: ./my-theme.yaml` / inline map). Unset keys
inherit the defaults below; deep-merge, so override only what you change.

## Defaults (the "coral glass" look)

```yaml
cursor:
  size: 22                # px at base scale
  style: arrow            # arrow | dot | halo — the pointer's FORM
  click: ripple           # ripple | rings | pulse | none — click animation
  fill: "#111319"         # pointer body
  stroke: "#ffffff"       # pointer outline
  ripple: "#FF6A4D"       # click/ring color; or `auto` (see adaptive accent)
card:
  layout: stack           # stack (kicker+rule+title+body) | minimal (quiet, airy) | pill (one-line chip)
  padding: 1.0            # padding multiplier (glass-minimal looks use 1.3-1.8)
  blur: 10                # backdrop blur px
  saturate: 1.0           # backdrop saturation boost
  background: "rgba(13,14,24,.88)"   # dark glass
  border: "rgba(255,255,255,.13)"
  text: "#F2F3FA"
  accent: "#FF6A4D"       # kicker + rule; or `auto` (see adaptive accent)
  radius: 14
  width: 290              # step cards; heroWidth: 520
  font: -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif
camera:
  easing: cubic-bezier(.5,0,.2,1)
  defaultScale: 1.6
  zoomDuration: 0.9       # seconds
  settle: 0.2
movement:
  speed: 1.0              # cursor speed multiplier
  arc: 0.10               # bezier arc strength (0 = straight lines)
  minDuration: 0.35
  maxDuration: 1.4
typing:
  delay: 70               # ms per keystroke
timing:
  preClick: 0.25          # pause before mousedown
  postClick: 0.35
  cardDefault: 3.0        # seconds a card stays up
  heroDefault: 2.6
```

## Bundled presets

| Preset | Look | When |
| --- | --- | --- |
| *(default)* | Dark glass cards, coral accent | Light apps, high-energy product tours |
| `indigo` | Dark glass, periwinkle accent, calmer easing | Brand-neutral SaaS, B2B |
| `paper` | White cards, dark ink, indigo accent + light cursor | Dark-themed apps |
| `verdigris` | Deep botanical glass, luminous mint, springy easing | Cinematic contrast over light UIs |
| `atlas` | Ivory paper-glass, quiet serif, deep teal ink, patient pacing | Editorial "field notes" tone |
| `evergreen` | Warm ivory glass, deep-pine serif, jade ripple | Soft botanical-editorial |
| `brass` | Smoked espresso glass, burnished gold, serif, slight camera bounce | Moody premium demos |
| `glass` | **The flagship**: Vellum's frosted cards + Lucent's halo cursor, extra-airy padding (2.0) | The default recommendation for light apps |
| `vellum` | Frosted white glass, minimal layout, dark dot cursor, brand-ring clicks, airy padding | Minimal glassmorph; adapts via `accent: auto` |
| `lucent` | Near-white glass (most opaque), halo cursor, round corners, spacious | Minimal glassmorph; the most legible over busy UIs |
| `lumen` | Light frosted glass, halo cursor, soft and quiet | Minimal glassmorph; lets the app dominate |
| `glint` | Lightest white-glass whisper, dot cursor, brand-tinted rings | Minimal glassmorph; near-invisible overlay |

Presets live in the record skill's `scripts/themes/`; a path next to the
scenario also works (`theme: ./brand.yaml`), which is how per-project brand
themes ship.

## Adaptive accent

`accent: auto` (and/or `ripple: auto`) samples the recorded app's brand color at
inject time — the most-repeated saturated button/link color wins, backgrounds
weighted over text. This is how one theme adapts to any app's look without
editing colors. Fallback when nothing saturated is found: the default coral.
Verify the sampled color in the output frames; apps with grey-only chrome need
an explicit accent.

## Rules

- **Contrast:** card text vs card background ≥ 4.5:1 (WCAG 2.2 AA, 3:1 for
  large text; 7:1 for AAA margin — https://www.w3.org/TR/WCAG22/#contrast-minimum).
  The default and both presets clear AAA.
- Match the accent to ONE brand color; keep the ripple and accent the same hue
  family or the video reads as two products.
- `movement.arc: 0` + faster `speed` reads mechanical/test-like; the defaults
  read human. Raise `arc` past ~0.18 and moves start looking drunk.
- Fonts: the stack renders whatever the recording OS has; for pixel-identical
  runs across machines, keep the default system stack.

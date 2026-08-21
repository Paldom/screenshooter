# Changelog

All notable changes to this repository's skills are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org) on the plugin manifest
(breaking skill-interface change → major, new skill → minor, fix → patch).

## [Unreleased]

## [0.2.0] — 2026-08-21

### Added
- **Wallpaper frame** (`output.frame` in the scenario, off by default): the capture
  is inset into a padded canvas with rounded corners, a soft shadow and a hairline
  rim. Runs at *export* time over a full-bleed webm master, so a frame can be
  added, restyled or dropped by re-exporting — never by re-recording.
- `background: auto` — derives the wallpaper from the recorded app: hue from its
  sampled brand colour, lightness pushed away from its own background so the window
  edge always reads. Named alternatives: `studio`, `midnight`, `spotlight`, `paper`,
  or any CSS colour/gradient.
- `chrome: true` (+ optional `title:`) — a macOS window header at real geometry:
  12 pt traffic lights on 20 pt centres, 20 pt inset, 28 pt bar, 10 pt corner
  radius, all scaled by `output.scale`.
- `scripts/frame.mjs` with a runnable self-check (`node frame.mjs --self-test`)
  covering geometry, macOS metrics, title escaping, palette derivation and the
  filtergraph's termination guards.
- `window.__shooter.context()` — reports the recorded app's accent, background and
  light/dark-ness; this is what `background: auto` reads.
- Framed runs keep `<name>.frame-plate.png` / `<name>.frame-mask.png` next to the
  outputs, plus a documented ffmpeg recipe, so "re-export the gif, don't re-record"
  still holds with a frame on.

### Changed
- Framed GIF exports default to 256 colours + `sierra2_4a` dithering (gradient
  wallpapers band at the unframed 128-colour bayer default; diffusion at 128 is
  both uglier and ~2.4× larger). Unframed defaults are unchanged.
- README hero GIF re-rendered with the frame — and 2.9 MB rather than the previous
  3.8 MB, because the app shrinks and the wallpaper compresses well.

## [0.1.0] — 2026-07-21

### Added
- `walkthrough-storyboard` skill: plans and writes schema-1 scenario YAML for
  web-app walkthrough videos — beats, zoom discipline, card copy rules, theming
  (references: scenario schema, storyboard patterns, theming).
- `walkthrough-record` skill: bundled Playwright recorder (`page.screencast`,
  injected cursor/zoom/card/mask overlay engine) that turns a scenario YAML into
  webm + mp4 (H.264 faststart) + gif (two-pass palette) — with strict pre-flight
  scenario validation, fail-closed privacy masks, and atomic exports.
- Bundled demo: the Orbit dashboard app + a 55-second tour scenario
  (`skills/walkthrough-record/assets/demo/`).
- Six theme presets: `indigo`, `paper`, `verdigris`, `atlas`, `evergreen`,
  `brass`.
- Structural design tokens (themes control form, not just color): cursor
  `style` (arrow/dot/halo) + `click` animation (ripple/rings/pulse/none), card
  `layout` (stack/minimal/pill), `padding` scale, backdrop `blur`/`saturate`,
  and `accent: auto` — samples the recorded app's brand color at runtime.
- Five minimal-glassmorph presets built on those tokens: `vellum`, `lucent`,
  `lumen`, `glint`, and `glass` — the flagship blend (Vellum cards + Lucent halo
  cursor, padding 2.0) used by the bundled demo scenario.

### Fixed
- Overlay reset selector carried ID specificity and crushed card padding/margins
  in every theme (`#__shooter-root :where(*)` → `:where(#__shooter-root *)`).
- `docs/setup-prompt.md`: paste-ready goal orchestrating storyboard → record → review.
- Repository scaffolded from the skills template.

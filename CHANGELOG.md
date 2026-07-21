# Changelog

All notable changes to this repository's skills are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org) on the plugin manifest
(breaking skill-interface change → major, new skill → minor, fix → patch).

## [Unreleased]

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

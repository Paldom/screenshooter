---
name: walkthrough-record
description: Records polished walkthrough videos of a web app from a scenario YAML — smooth scripted cursor, camera zooms, cards, wallpaper frame with optional macOS header; exports mp4 and gif. Use when asked to record, render, capture or export a product tour, demo or walkthrough video, or when the recorder errors. Not for authoring the scenario/storyboard, OS screen capture, or Playwright tests.
license: MIT
argument-hint: <scenario.yaml or app URL>
---

# walkthrough-record

Runs the bundled Playwright recorder: a scenario YAML in, a cinematic webm master
out, plus mp4 (H.264, faststart) and gif (two-pass palette) exports. The recorder
drives a real Chromium, injects an overlay engine (eased bezier cursor, click
ripples, spotlight ring, privacy masks, explanation cards, camera zoom) and
captures with Playwright's `page.screencast` at crisp 2× resolution. An optional
framing pass then insets the capture into a wallpaper canvas — rounded corners,
soft shadow, optional macOS window header.

It fixes the failure of hand-driven capture: shaky cursor, missed beats,
unreproducible takes, soft text, and 20 MB GIFs.

## When NOT to use

- Writing or refining the scenario YAML itself (beats, card copy, zoom placement,
  themes) → `walkthrough-storyboard`.
- OS-level screen capture of arbitrary desktop apps or live presentations.
- Playwright test authoring, screenshots, or generic ffmpeg conversions.

## Workflow

1. **Setup once per machine.** Run `bash "${CLAUDE_SKILL_DIR}/scripts/setup.sh"`.
   It verifies Node ≥ 20 and ffmpeg, installs pinned deps (playwright 1.61.1,
   yaml 2.8.0) next to the scripts, and installs Chromium. It exits non-zero with
   the exact missing prerequisite — surface that message, don't improvise installs.
2. **Get a scenario.** Use the one the user provides, or storyboard one first
   (that's the sibling skill's job). No scenario and they just want to see it work?
   Record the bundled demo: `"${CLAUDE_SKILL_DIR}/assets/demo/orbit-tour.yaml"`.
3. **Record.**
   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/record.mjs" scenario.yaml --out ./walkthrough-out
   ```
   Flags: `--validate-only` (schema check, guaranteed no browser), `--webm-only`
   (skip exports while iterating), `--headed` (watch live), `--out DIR`. The
   recorder validates the scenario BEFORE opening a browser and exits 1 listing
   every schema violation — relay those verbatim; fix the YAML, never the
   validator. **Authenticated targets:** a `storageState` scenario performs real
   clicks with a real session — confirm the origin is a staging/test account
   with the user before recording anything production.
4. **Verify before declaring success.** Check the logged `mp4 check:` line
   (width,height,frames | seconds), then extract 3–4 spot frames and look at them:
   ```bash
   ffmpeg -y -i out/<name>.mp4 -vf "select='not(mod(n\,400))'" -vsync vfr /tmp/frame%d.png
   ```
   Confirm: cursor visible and smooth, cards readable and inside the frame, zooms
   centered on their targets, no masked content leaking.
5. **Frame it** (optional, off unless the scenario asks). `output.frame` insets the
   capture into a wallpaper canvas. It runs at *export* time — the webm master
   stays full-bleed, so a frame can be added, restyled or dropped by re-exporting.
   ```yaml
   output:
     frame:
       background: auto      # auto | studio | midnight | spotlight | paper | any CSS colour/gradient
       chrome: false         # macOS window header (12 pt lights, 28 pt bar) — default off
       title: "Orbit"        # header title, chrome only
       pad: 0.062            # canvas padding, fraction of canvas width
       radius: 13            # corner radius in CSS px (10 = real macOS, the default when chrome is on)
   ```
   `output.frame: true` takes every default. **`background: auto`** samples the
   recorded app's brand colour and light/dark-ness and derives a matching
   wallpaper — the right choice when you don't know the app in advance. Pick a
   named background when the video has to match a brand you already know.
6. **Tune exports** when asked for platform targets (README, YouTube, socials):
   budgets and recipes live in `references/export-profiles.md`. GIF too big?
   Trim to one beat (`gif: {start, duration}`), then narrow width, then lower fps
   — re-export from the existing webm, don't re-record (framed runs keep their
   `*.frame-plate.png` / `*.frame-mask.png` next to the outputs precisely so that
   re-export still works; the recipe is in `references/export-profiles.md`).
7. **Failures** (selector not found, wrong zoom area, blank video, sticky-header
   artifacts): diagnose with `references/troubleshooting.md`. Never edit
   `scripts/` to work around one app; fix the scenario or document the limitation.

## Output spec

- `<out>/<name>.webm` (master, always full-bleed — the frame is never baked into
  it), `<name>.mp4` (H.264 CRF 18, yuv420p, faststart, CFR at `output.fps`),
  `<name>.gif` (palettegen/paletteuse two-pass). Each file is written atomically
  (never truncated); a failure mid-run can still leave the earlier completed files
  of that run — same-named outputs are overwritten.
- Framed runs additionally keep `<name>.frame-plate.png` (canvas-sized: wallpaper,
  shadow, rim, header) and `<name>.frame-mask.png` (the rounded-corner alpha) —
  the re-export inputs, not junk to clean up.
- A verification note: probe line + which frames you inspected.

## Gotchas

- **Camera zoom is a CSS transform on `<body>`** — by design (GPU-smooth easing).
  Apps whose fixed/sticky chrome or JS reads viewport rects during a zoom can
  misbehave; the fix is scenario-side (zoom-free beat or different target), see
  troubleshooting. Compositor-side zoom is roadmap, not shipped — don't promise it.
- **2× crispness uses `html {zoom}` with a doubled viewport**, so media queries
  see base×2 width. Desktop-first apps render identically; apps with max-width
  breakpoints in between need `output: {scale: 1}`.
- **Masks are opaque and fail-closed**: solid covers (not blurs — blur leaks
  shape/length), re-resolved every frame; a mask selector matching nothing
  aborts the run; navigations paint a curtain until masks re-apply. Don't "fix"
  an abort by deleting the mask — find the right selector. Masks can't reach
  inside cross-origin iframes.
- `wait: {until: networkidle}` hangs on apps with persistent websockets — prefer
  `wait: {for: selector}`.
- Exports overwrite same-named outputs (iterative renders are the norm); use
  distinct `--out` dirs to keep takes.
- Recording is realtime: keep the machine unloaded during capture; verify pacing
  with the ffprobe commands in troubleshooting if output looks stuttery.
- **A frame costs ~20 % of the app's linear resolution** (2560 → 2054 px at the
  default padding). The master is 2× raster, so the app still lands at 1.6× and
  text stays sharp — but don't stack a frame on `output: {scale: 1}`.
- **`background: auto` samples once, at the first overlay injection.** A tour that
  toggles the app to dark mode halfway keeps the wallpaper it started with; the
  rim and shadow still separate the window. Pin a named background if that bothers
  you.
- **Framed GIFs change palette defaults** to 256 colours + `sierra2_4a`: gradient
  wallpapers band visibly under the unframed 128-colour bayer default. Diffusion at
  128 colours is both uglier *and* bigger — don't "optimise" it back down.

## Files

- `scripts/record.mjs` — recorder CLI (validates, records, exports; exit ≠ 0 on any failure)
- `scripts/overlay.js` — injected overlay engine (cursor/cards/ring/masks/camera)
- `scripts/frame.mjs` — export-time framing (wallpaper/shadow/corners/macOS header); `node frame.mjs --self-test`
- `scripts/setup.sh` — one-time dependency setup, `scripts/themes/` — theme presets
- `assets/demo/` — bundled demo app (orbit.html) + demo scenario (orbit-tour.yaml)
- `references/export-profiles.md` — mp4/gif budgets per destination (README, YouTube, Vimeo, in-app)
- `references/troubleshooting.md` — failure→fix table, zoom compat notes, pacing audit commands

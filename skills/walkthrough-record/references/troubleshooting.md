# Troubleshooting — failure → fix

## Contents
- [Pre-flight validation errors](#pre-flight-validation-errors)
- [Selector and wait failures](#selector-and-wait-failures)
- [Zoom looks wrong](#zoom-looks-wrong)
- [Blank, black, or missing video](#blank-black-or-missing-video)
- [Stutter / pacing audit](#stutter--pacing-audit)
- [Masks](#masks)
- [Frame looks wrong](#frame-looks-wrong)
- [Scale and layout differences](#scale-and-layout-differences)

## Pre-flight validation errors

`record.mjs` validates the whole scenario before opening a browser and exits 1
listing every violation (unknown keys, unknown step kinds, bad numbers, numeric
ranges, URL scheme). `--validate-only` runs exactly this check and exits without
ever launching a browser — use it as the lint step. Fix the YAML — the validator
is authoritative for `schema: 1`. URL schemes are limited to `http`, `https`,
`file`; viewport 320–3840×240–2400, fps 5–60, scale 1–3.

## Selector and wait failures

| Symptom | Fix |
| --- | --- |
| `cannot resolve position of: <sel>` / waitFor timeout | Selector matches nothing or element hidden. Verify in the app; prefer stable `data-testid` hooks. All engine targets (zoom/ring/card/mask) are CSS selectors — Playwright text/role selectors work only for move/click/type targets. |
| `zoom target not found` | Same — zoom/ring/card/mask use `document.querySelector`, CSS only. |
| Recording hangs at a `wait` | `until: networkidle` never settles on websocket/SSE apps — switch to `wait: {for: "<selector>"}` or a fixed duration. |
| Clicks land but nothing happens | The app needs hover-intent or focus first: add a `hover`/`move` step before the click, or a small `wait` after. |

## Zoom looks wrong

The camera is a CSS `transform` (translate+scale, eased) on `<body>`; the
overlay lives on `<html>` and stays put. Consequences on some apps:

- **Sticky/fixed chrome zooms with the content** (body becomes its containing
  block). Usually this looks correct (uniform push-in). If an app's portal
  tooltip/modal positions itself by reading viewport rects mid-zoom, it can
  drift: move the interaction outside the zoom beat (zoom → settle → act), or
  drop that zoom.
- **Wrong area centered**: the target is clamped to document bounds; very
  edge-adjacent targets can't center — lower `scale` or pick a bigger container.
- **Scrolled pages**: zoom math is clamped but only lightly exercised with page
  scroll; keep zoom beats on unscrolled views or file an issue with a repro.
- Escape hatch: remove zoom beats (everything else works identically). A
  compositor-side zoom is the documented roadmap; do not claim it exists.

## Blank, black, or missing video

- Curtain black frames at the start = masks configured but never satisfied;
  the run should have aborted — check the error.
- Zero-byte webm: browser crashed; re-run with `--headed` to watch.
- `ffmpeg failed`: read its stderr; the common cause is ffmpeg missing from
  PATH (`setup.sh` checks this).

## Stutter / pacing audit

Recording is realtime — a loaded machine drops frames. Audit:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_frames:format=duration \
  -of json out/<name>.mp4
ffmpeg -hide_banner -i out/<name>.mp4 -vf "vfrdet,freezedetect=n=-60dB:d=0.5" -an -f null -
```

`vfrdet` reporting heavy VFR on the webm, or freezedetect hits during motion
beats → close other apps and re-record. Persistent stutter on adequate hardware
is the trigger to prioritize the frame-stepped renderer (roadmap).

## Masks

- Covers are **opaque solids**, not blurs — blur leaves text length/shape
  inferable; if you want the blurred look for non-sensitive content, that's a
  theme decision, not a privacy tool.
- Fail-closed: any mask selector matching 0 elements aborts before recording.
- Selectors re-resolve every animation frame, so re-rendered/hydrated elements
  stay covered; geometry tracks moves/zooms.
- Navigations paint an opaque curtain until masks re-apply — black flash on
  `goto` steps is the privacy guarantee, not a bug.
- Ceiling: masks cannot cover content inside cross-origin iframes; don't record
  such pages with secrets visible.
- Never put real credentials in scenarios; use `storageState` (an auth JSON the
  user keeps out of version control) for logged-in tours.

## Frame looks wrong

The frame is composited at export from two stills (`<name>.frame-plate.png`,
`<name>.frame-mask.png`) that Chromium renders from CSS. Nothing about it touches
the recording, so every fix here is a re-export.

| Symptom | Fix |
| --- | --- |
| Wallpaper colour looks nothing like the app | `background: auto` samples the app's most-repeated saturated button/link colour at the **first** overlay injection. Grey-only chrome → nothing to sample → indigo fallback. Set a named background or raw CSS instead. |
| Wallpaper stays light/dark after the app flips theme mid-tour | Sampled once, by design (a wallpaper that cross-fades mid-video reads as a glitch). Pin a background, or split the tour into two takes. |
| Text softer than an unframed take | Expected: default padding scales the app to ~0.80×, i.e. 1.6× raster instead of 2×. Reduce `pad`, or raise the base `viewport`. Never combine a frame with `output: {scale: 1}`. |
| Encode never finishes / mp4 grows forever | A hand-written filtergraph missing `shortest=1` on `alphamerge` **and** `overlay`. The `-loop 1` stills never EOF, so the last frame repeats indefinitely. |
| macOS header present but the app is cut off at the bottom | The header eats vertical room from the video, not from the padding. Lower `pad`, or drop `chrome`. |
| Banding across the wallpaper in the gif only | 128-colour bayer. Framed exports already default to 256 + `sierra2_4a`; you overrode `colors` without overriding `dither`. |
| Rounded corners have a hard/aliased edge | The mask is rendered at the video's exact pixel size; if you hand-rolled the graph, check `scale` matches the mask dimensions exactly — a mismatch resamples the alpha. |

## Scale and layout differences

`output.scale` (default 2) doubles the viewport and applies `html {zoom}` — per
the [CSS spec](https://drafts.csswg.org/css-viewport/#zoom-property), zoom
affects layout (unlike `transform`), which is what makes text rasterize crisply.
Media queries therefore see base×2 width. If the app changes layout between base
and base×2 (max-width breakpoints), set `output: {scale: 1}` and accept 1× output,
or raise the base viewport.

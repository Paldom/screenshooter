# Storyboard patterns — the craft rules

Practical defaults distilled from usability guidance (NN/g on instructional
video/tooltips), retention data (Wistia), auto-zoom tool behavior (Screen
Studio, Cursorful, Camtasia), and our own recorded output. Numbers are
recommendations, not laws — but deviate deliberately, not accidentally.

## Contents
- [Narrative spine](#narrative-spine)
- [Beat template](#beat-template)
- [Zoom discipline](#zoom-discipline)
- [Cursor pacing](#cursor-pacing)
- [Card copy rules](#card-copy-rules)
- [Length bands](#length-bands)
- [Storyboard worksheet](#storyboard-worksheet)

## Narrative spine

1. **Hook (0–3 s):** hero card with the promise, or the finished result on
   screen. Long intros and logo stings measurably bleed viewers.
2. **Chapters (3–6):** each = one viewer-visible outcome, structured
   *zoom in → act → card → zoom out*. Full-frame resets between chapters
   preserve spatial context.
3. **Result + CTA:** show what success looks like, end on a hero card.

One narrative level per video: overview, task tutorial, OR deep workflow.

## Beat template

```yaml
- zoom: { to: "<step container>", scale: 1.5 }   # establish
- move/click/type …                              # the action, real events
- assert: { visible: "<result>" }                # fail loudly if the app drifted
- card: { kicker: "Step N · <chapter>", title: "…", body: "…", at: "<result>" }
- zoom: reset                                    # release
```

## Zoom discipline

- Zoom only when the viewer would otherwise miss *what changed, where to click,
  or why it matters*. At most **one meaningful zoom per logical step**.
- Scale **1.3–2.0** for normal UI; 2.2–2.6 only for tiny controls. Enter in
  ~0.9 s (the default), hold through the action, release with `zoom: reset`.
- Never stack zoom + card motion + theme flips in the same instant; let each
  land (the defaults' settle pauses handle this if you don't fight them).
- Auto-zoom tools trigger only on clustered clicks for a reason: constant
  zooming reads as seasickness. When in doubt, cut the zoom.

## Cursor pacing

- The recorder eases along a slight arc with distance-based duration
  (0.35–1.4 s) — do not hand-set `duration` on routine moves.
- Pauses before (0.25 s) and after (0.35 s) each click are built in; they let
  viewers anticipate and confirm. Slow a *deliberate reveal* by adding a
  `wait: 0.5`, not by slowing every move.
- One action per ~3 s of runtime is a good density; if beats feel rushed, cut
  actions, don't compress timings.
- Park the cursor at a neutral point (`move: {to: [x, y]}`) before hero cards.

## Card copy rules

- **Title 3–8 words. Body 8–20 words, one sentence.** Cards are coach marks,
  not slides — if it needs two sentences, it needs narration or a doc link.
- On screen 1.2–2.5 s for simple facts, 2.5–4 s for warnings/definitions
  (defaults: 3.0 s, hero 2.6 s).
- Anchor adjacent to the action (`at` + `side`); never cover the click target.
  Corner `position` is for commentary unrelated to a specific element.
- Kickers carry the chapter thread: `"Step 2 · Insights"`.
- Contrast ≥ 4.5:1 (WCAG AA; default theme clears 7:1) — see theming.md.

## Length bands

| Band | Use | Structure |
| --- | --- | --- |
| 30–90 s | Feature teaser, landing page, release note, README | Hook → value → one flow → CTA; 2–4 zooms total |
| 3–7 min | Task tutorial, onboarding | Problem → 3–5 chapters → recap; 1 zoom per step cluster |
| 10+ min | Training/LMS | Chaptered lessons; zoom only when comprehension drops — and question whether video is the right medium |

Mark ONE 5–10 s beat as the GIF segment if a README gif is a deliverable; the
record skill trims to it (`output.gif.start/duration`).

## Storyboard worksheet

Before writing YAML, fill this in (one line per chapter):

| # | Chapter | Viewer sees | Target selector | Zoom? | Card title (3–8 w) | Card body (8–20 w) |
|---|---------|-------------|-----------------|-------|--------------------|--------------------|

If a row has no stable selector, stop and get one added to the app
(`data-testid`) — that is cheaper than a brittle scenario.

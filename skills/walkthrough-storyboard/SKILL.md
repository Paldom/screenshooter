---
name: walkthrough-storyboard
description: Plans and writes the scenario YAML for a web-app walkthrough video — story beats, cursor path, zoom placement, explanation-card copy, theme choice. Use when asked to storyboard, script, plan, draft or refine a product tour or walkthrough scenario, its pacing, or its cards. Not for running the recorder, exporting mp4/gif, or building in-app onboarding tours.
license: MIT
argument-hint: <app/flow to storyboard>
---

# walkthrough-storyboard

Turns "make a demo of X" into a recorder-ready scenario: a `schema: 1` YAML of
timed beats — moves, clicks, zooms, cards — that the sibling `walkthrough-record`
skill executes. It fixes the failure mode of tours that ramble: zoom everywhere,
wall-of-text callouts, no narrative spine, brittle selectors.

## When NOT to use

- Executing/rendering/exporting the video, or recorder errors → `walkthrough-record`.
- In-app onboarding features (intro.js-style tooltips), slide decks, or YouTube
  ad copywriting — this skill only produces recorder scenarios.

## Workflow

1. **Define the viewer's job in one sentence** ("create the first dashboard",
   "invite a teammate"). Write the ending first: what success looks like
   on screen. One narrative level per video — overview, task tutorial, or deep
   workflow; mixing them is what makes demos ramble.
2. **Walk the real app.** Identify each beat's target element and collect stable
   selectors (`data-testid` > ids > structural CSS). If none exist, ask for them
   or propose adding them — brittle selectors are the #1 cause of dead scenarios.
   Note anything sensitive on screen → `mask` list; logged-in flows → note that
   the user should export a `storageState` auth file (kept out of git).
3. **Storyboard the beats** per `references/storyboard-patterns.md`: hook first
   (hero card ≤ 2.5 s, show the payoff early), then 3–6 chapters of
   *zoom in → act → card → zoom out*, then a result/CTA beat. Discipline that
   separates polished from frantic: at most one zoom per logical step, zoom
   scale 1.3–2.0 (2.2+ only for tiny controls), cards adjacent to — never
   covering — the action, title 3–8 words, body 8–20 words, card up 1.2–4 s.
4. **Write the YAML** against `references/scenario-schema.md` (pinned to
   `schema: 1`). Prefer waits on selectors over sleeps; let move durations
   auto-compute from distance; add an `assert` after state-changing actions.
5. **Pick the look** per `references/theming.md`: default coral-glass, `indigo`,
   `paper` (for dark apps), or an inline `theme:` block. Card contrast ≥ 4.5:1.
6. **Validate and hand off.** If the recorder is installed, lint the YAML with
   its browser-free mode:
   `node <walkthrough-record>/scripts/record.mjs scenario.yaml --validate-only`
   (exits 0 on a clean schema, never launches Chromium). Then hand the scenario
   to `walkthrough-record` to record; iterate on pacing from what the frames
   show, not from imagination.

## Output spec

A single scenario YAML (plus optional theme file) that:
- passes the recorder's pre-flight validator (`schema: 1`, known keys only)
- runs 30–90 s for marketing/tour content (3–7 min only for training content)
- has a hook in the first 3 s, ≤ 1 zoom per step, card copy within limits,
  masks for anything sensitive, and stable selectors throughout

## Gotchas

- Zoom/ring/card/mask targets are **CSS selectors only** (engine-side
  `querySelector`); Playwright-style `text=`/role selectors work only for
  move/click/type. Don't mix them up.
- Don't script mid-zoom scrolling or interactions that open viewport-positioned
  portals during a zoom — sequence them zoom → settle → act.
- `wait: {until: networkidle}` hangs on websocket-heavy apps; wait on a selector.
- Respect the defaults instead of hand-timing every step — `preClick`/`postClick`
  pauses and distance-based move durations already encode good pacing; override
  only for deliberate slow reveals.
- Keep GIF ambitions out of the storyboard: if the deliverable includes a README
  gif, mark ONE 5–10 s beat as the gif segment for the record skill to trim to.

## Files

- `references/scenario-schema.md` — the full schema-1 authoring reference (steps, top-level keys, defaults)
- `references/storyboard-patterns.md` — beat templates, zoom/cursor/card craft rules with sources
- `references/theming.md` — theme keys, presets, contrast rules

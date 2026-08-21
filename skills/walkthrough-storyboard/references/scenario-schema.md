# Scenario schema — version 1

Authoring reference for `schema: 1` scenarios. The recorder's pre-flight
validator (in the sibling `walkthrough-record` skill) is authoritative: it
rejects unknown top-level keys, unknown step kinds, unknown per-step keys and
non-numeric numbers before any browser opens.

## Contents
- [Top-level keys](#top-level-keys)
- [Steps](#steps)
- [Timing model](#timing-model)
- [Theme block](#theme-block)
- [Frame block](#frame-block)
- [Complete example](#complete-example)

## Top-level keys

| Key | Type / default | Meaning |
| --- | --- | --- |
| `schema` | `1` | Schema version; omit or `1` |
| `name` | string, default = filename | Output basename |
| `url` | string, required | `http(s)://…` or a file path (resolved relative to the YAML; only http/https/file allowed) |
| `viewport` | `{width: 1280, height: 800}` | Base CSS viewport; coordinates in steps are base px |
| `colorScheme` | `light` | `light` / `dark` — the emulated `prefers-color-scheme` |
| `storageState` | path | Playwright storage-state JSON for logged-in tours (keep out of git) |
| `locale`, `timezone` | strings | Determinism knobs (e.g. `en-US`, `Europe/Budapest`) |
| `frozenTime` | date string | Freezes `Date`/`Date.now()` so "3 min ago" labels stay put (rAF/`performance.now` unaffected) |
| `mask` | list of CSS selectors | Opaque privacy covers, applied before the first frame; fail-closed (0 matches → abort) |
| `theme` | preset name \| path \| inline map | See [Theme block](#theme-block) |
| `output` | map | `dir`, `fps` (30), `scale` (2 = crisp 2×; set 1 if the app has breakpoints between base and base×2), `mp4: false` to skip, `gif: false` or `{width: 960, fps: 12, colors, dither, start, duration}`, `frame` (see [Frame block](#frame-block)) |
| `steps` | list, required | The timeline |

## Steps

One kind per list item; every step accepts an optional `id` (reserved for
future chapter/partial-rerecord tooling). Selector rules: **zoom / ring / card
`at` / mask take CSS selectors only** (engine-side `querySelector`); move /
click / type / assert targets go through Playwright locators (CSS recommended).

| Step | Args | Notes |
| --- | --- | --- |
| `goto` | url string | Navigates; overlay+masks re-inject (masked runs show a curtain until re-masked) |
| `wait` | seconds \| `{for: sel, timeout?: s}` \| `{until: networkidle}` | Prefer `for:`; `networkidle` hangs on websocket apps |
| `assert` | `{visible: sel}` and/or `{text: "…"}`, `timeout` (5 s) | Fails the run loudly — put one after each state-changing action |
| `move` / `hover` | `{to: sel \| [x,y], duration?, ax?, ay?, dx?, dy?}` | Eased bezier arc; `ax/ay` = anchor inside the target (0–1, default .5), `dx/dy` = base-px offset; duration auto from distance |
| `click` / `dblclick` | selector or `{target, ax, ay, dx, dy}` | Moves (if target given), pre-click pause, real mousedown/up (ripple + cursor press render automatically) |
| `type` | `{into?: sel, text, delay?: ms}` | Clicks `into` first if given; per-key delay default 70 ms |
| `press` | key string (`Enter`, `Meta+k`) | Playwright key syntax |
| `select` | `{target, value}` | Native `<select>` |
| `zoom` | `{to: sel, scale?: 1.6, duration?: 0.9}` \| `reset` \| `{reset: true, duration}` | Camera push-in centered on target, clamped to document bounds |
| `card` | `{kicker?, title, body?, at?: sel, side?: left/right/top/bottom, position?: corner, style?: hero, duration?, sticky?}` | `at` anchors beside an element (auto side if omitted); no `at` → corner position (`bottom-right` default); `hero` = centered title card; `sticky: true` stays until `hidecards` |
| `hidecards` | — | Dismisses sticky cards |
| `ring` | `{to: sel, pad?: 10, dim?: 0–1}` \| `hide` | Corner-bracket spotlight; `dim` darkens everything else |
| `mask` | list of CSS selectors | Adds masks mid-run (fail-closed) |
| `scroll` | `{to: sel}` \| `{by: px}` | Smooth scroll into view / wheel |

## Timing model

Wall-clock, sequential; each step completes before the next starts. Built-in
pacing (theme-overridable): pre-click pause 0.25 s, post-click 0.35 s, card
default 3.0 s (hero 2.6 s), zoom settle 0.2 s after the transition, move
duration = distance/speed clamped to 0.35–1.4 s. Lead-in 0.4 s and tail 0.6 s
of quiet frames are added automatically.

## Theme block

`theme:` accepts a preset name (`indigo`, `paper`), a path to a YAML file next
to the scenario, or an inline map. Keys and defaults live in
[theming.md](theming.md).

## Frame block

`output.frame` insets the capture into a wallpaper canvas with rounded corners, a
soft shadow and an optional macOS window header. Omit it (or `false`) for
full-bleed — that stays the default. `true` takes every default below.

| Key | Type / default | Meaning |
| --- | --- | --- |
| `background` | `auto` | `auto` (derived from the recorded app) \| `studio` \| `midnight` \| `spotlight` \| `paper` \| any CSS colour or gradient |
| `pad` | `0.062` | Canvas padding as a fraction of canvas **width** (0–0.25) |
| `radius` | `13`, or `10` with `chrome` | Corner radius in CSS px (0–60), scaled by `output.scale` |
| `chrome` | `false` | macOS window header — 12 pt lights, 20 pt centres, 28 pt bar |
| `title` | `""` | Centred header title; `chrome` only, HTML-escaped |

Framing happens at export, over a full-bleed webm master, so the frame can be
changed or removed by re-exporting — never by re-recording. It costs ~20 % of the
app's linear resolution, so don't combine it with `output: {scale: 1}`. Table of
which background to pick: [theming.md](theming.md#frame-wallpaper-canvas).

## Complete example

```yaml
schema: 1
name: invite-flow
url: https://app.example.test
viewport: { width: 1280, height: 800 }
colorScheme: light
storageState: ./auth.json
mask: ["[data-testid=user-email]"]
theme: indigo
output:
  fps: 30
  gif: { start: 12, duration: 8, width: 800 }
  frame: { background: auto }        # add `chrome: true` for a macOS window header
steps:
  - card: { style: hero, kicker: "Product tour", title: "Invite your team", body: "From solo to shipping together in 20 seconds.", duration: 2.2 }
  - click: "[data-testid=nav-members]"
  - assert: { visible: "[data-testid=members-page]" }
  - zoom: { to: "[data-testid=invite-box]", scale: 1.5 }
  - click: "[data-testid=invite-input]"
  - type: { text: "rita@example.com", delay: 80 }
  - press: Enter
  - card: { kicker: "Step 1", title: "Invites in one line", body: "Paste any address — roles come next.", at: "[data-testid=invite-box]", side: bottom, duration: 2.8 }
  - zoom: reset
  - assert: { text: "Invitation sent" }
  - card: { style: hero, kicker: "Done", title: "That's it.", body: "Your teammate gets a magic link instantly.", duration: 2.4 }
```

# Setup prompt — walkthrough video workflow

Paste the block below as one `/goal` in a Claude Code session inside a repo
where this skill pack is installed (or inside this repo). Fill the two
placeholders first: the app URL/path and the flow to showcase.

```
/goal Produce a polished walkthrough video (mp4 + gif) of <APP URL or local path>, showcasing <FLOW, e.g. "search, creating a task, dark mode">. Work autonomously; NEVER run git commit or git push — leave all changes and outputs for me to review.

Workflow (strictly in this order — each gate must pass before the next phase):
1. STORYBOARD (use the walkthrough-storyboard skill). Walk the live app first and collect stable selectors (prefer data-testid; if a beat has none, add a note listing the exact elements that need one instead of guessing). Then write walkthrough.yaml (schema: 1): hook hero card ≤2.5s, 3–6 chapters of zoom-in → act → assert → card → zoom-out, result/CTA beat, 30–90s total. Respect the craft limits: ≤1 zoom per step (scale 1.3–2.0), card titles 3–8 words, bodies 8–20 words. Mask every email/token/real name via mask:; if the flow needs login, use storageState and tell me what to export — never paste credentials into the scenario. Mark ONE 5–10s beat as the gif segment (output.gif.start/duration). Decide the frame: set output.frame {background: auto} for marketing/landing-page videos (add chrome: true only if "desktop app" is the point), leave it off for in-app help or anything that will be cropped. GATE 1: the recorder's pre-flight validator accepts the file — run: node "<skills dir>/walkthrough-record/scripts/record.mjs" walkthrough.yaml --out /tmp/wt --webm-only and confirm it gets past "scenario validation" (selector errors at runtime are fine to iterate on).
2. RECORD (use the walkthrough-record skill). First time on this machine: bash "<skills dir>/walkthrough-record/scripts/setup.sh" (needs Node ≥20 + ffmpeg; surface its error verbatim if it fails). Record webm-only while iterating. GATE 2: extract 4–6 spot frames (ffmpeg select filter) and inspect them — cursor smooth and visible, cards readable and inside frame, zooms centered, masks covering their targets in every sampled frame. Fix the SCENARIO (never the recorder scripts) and re-record until the frames pass.
3. EXPORT. Full run without --webm-only for mp4 + gif. GATE 3: the logged "mp4 check:" line matches the expected resolution/duration, and the gif is ≤10 MB (if not, trim/narrow/slow it per the export-profiles reference — re-export from the webm, don't re-record).
4. REPORT. Final message: output file paths, scenario path, frames you inspected, any selectors the app still needs, and the exact re-record command.

Do not parallelize phases (each depends on the previous artifact). Do not edit files under the skills' scripts/ directories. Do not commit, push, or publish anything.
```

Notes:

- `<skills dir>` is wherever the pack is installed — in this repo it's
  `skills/`; via `npx skills add` it's typically `.claude/skills/`.
- No app yet? Point the goal at the bundled demo instead:
  `skills/walkthrough-record/assets/demo/orbit.html` — or skip storyboarding
  entirely and record `assets/demo/orbit-tour.yaml`.
- The goal deliberately keeps phases sequential: the scenario is the input to
  the recording, and export tuning needs the recorded master. There is no
  disjoint file surface to parallelize.

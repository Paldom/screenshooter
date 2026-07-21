# Export profiles — budgets and recipes per destination

The recorder always writes a webm master; mp4/gif are derived from it. Re-export
from the master when tuning — never re-record for an export problem.

## MP4 (the hero format)

Defaults baked into `record.mjs`: H.264 (libx264) CRF 18, preset medium,
`yuv420p`, even dimensions forced, `+faststart` (moov atom up front), CFR at
`output.fps` (default 30).

| Destination | Settings | Why |
| --- | --- | --- |
| Landing page / in-app help | default (CRF 18, 30 fps); consider `viewport` 1280×720 with `scale: 2` → 2560×1440 master | H.264+AAC MP4 is the broadly-safe browser format |
| YouTube | default is compliant: MP4, H.264, faststart. Platform recommends ~8 Mbps @1080p standard fps, 12 Mbps high-fps; AAC-LC/Opus 48 kHz audio if you add narration. Upload at recorded frame rate. | [YouTube upload encoding](https://support.google.com/youtube/answer/1722171) |
| Vimeo | default is compliant; platform guidance: H.264, 1080p at 10–20 Mbps (or CRF ≤ 18), AAC-LC 48 kHz 320 kb/s | [Vimeo compression guidelines](https://help.vimeo.com/hc/en-us/articles/12426043233169-Video-and-audio-compression-guidelines) |
| GitHub README | Markdown can't play a committed .mp4; upload the mp4 as an issue/PR/release **attachment** (renders a player; video ≤ 10 MB free / 100 MB paid) or commit a GIF (below) | [GitHub attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files) |

## GIF (short beats only)

Defaults: fps 12, width 960, 128 colors, bayer dither (scale 5), two-pass
palette (`palettegen stats_mode=diff` → `paletteuse diff_mode=rectangle`), from
the [ffmpeg palettegen/paletteuse docs](https://ffmpeg.org/ffmpeg-filters.html#palettegen):
`stats_mode=diff` computes histograms "only for the part that differs from
previous frame"; `diff_mode=rectangle` reprocesses only the changing rectangle —
smaller files, no shimmer on static chrome.

A full 55 s tour at these defaults ≈ 16 MB. GIFs are for one beat, not the film.
Budget levers, in order of preference:

1. **Trim to the money beat**: `output: {gif: {start: 18, duration: 8}}`
2. **Width**: 960 → 800 (GitHub README column) → 640
3. **fps**: 12 → 10 (below 10 reads as slideshow)
4. **colors**: 128 → 96/64 for flat UIs
5. **dither**: try `dither: none` on flat UI — often smaller AND crisper;
   bayer_scale lower than 5 = more visible crosshatch (ffmpeg default is 2)

GitHub renders committed GIFs referenced by relative link; keep them under
~10 MB (image attachment cap) and prefer an mp4 attachment for anything longer
than a few seconds.

## Accessibility floor (cards/overlays)

Explanation-card text must hit WCAG contrast: 4.5:1 normal text (AA), 3:1 large
text; 7:1 for AAA margin — [WCAG 2.2 §1.4.3/1.4.6](https://www.w3.org/TR/WCAG22/#contrast-minimum).
The default theme (near-black glass, near-white text) clears AAA; check custom
themes before shipping. If a video carries meaningful narration, provide
captions/transcript at the destination.

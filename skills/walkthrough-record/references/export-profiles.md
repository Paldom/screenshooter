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

Defaults: fps 12, width 960, two-pass palette (`palettegen stats_mode=diff` →
`paletteuse diff_mode=rectangle`), from the
[ffmpeg palettegen/paletteuse docs](https://ffmpeg.org/ffmpeg-filters.html#palettegen):
`stats_mode=diff` computes histograms "only for the part that differs from
previous frame"; `diff_mode=rectangle` reprocesses only the changing rectangle —
smaller files, no shimmer on static chrome.

Palette defaults depend on whether a frame is on:

| | colors | dither | why |
| --- | --- | --- | --- |
| unframed | 128 | `bayer:bayer_scale=5` | flat UI quantizes cleanly; ordered dither compresses well |
| framed | 256 | `sierra2_4a` | gradient wallpapers band visibly at 128 + bayer |

Counter-intuitive but measured: error diffusion at **128** colours is both worse
looking *and ~2.4× larger* than at 256, because per-pixel noise destroys
inter-frame compression. If you override `colors`, override `dither` with it.

A full 55 s tour ≈ 16 MB unframed, ≈ 20 MB framed. GIFs are for one beat, not the
film. Budget levers, in order of preference:

1. **Trim to the money beat**: `output: {gif: {start: 18, duration: 8}}`
2. **Width**: 960 → 800 (GitHub README column) → 640
3. **fps**: 12 → 10 (below 10 reads as slideshow)
4. **colors**: 128 → 96/64 for flat UIs (unframed only — see the table)
5. **dither**: try `dither: none` on flat UI — often smaller AND crisper;
   bayer_scale lower than 5 = more visible crosshatch (ffmpeg default is 2)

A framed 14 s beat at 800 px lands around 2.9 MB — *smaller* than the same beat
unframed, because the app shrinks and the wallpaper is a static, well-compressing
region.

GitHub renders committed GIFs referenced by relative link; keep them under
~10 MB (image attachment cap) and prefer an mp4 attachment for anything longer
than a few seconds.

## Re-exporting a framed gif without re-recording

A framed run leaves `<name>.frame-plate.png` and `<name>.frame-mask.png` next to
the outputs. With those plus the webm master you can retrim/resize forever. Read
the geometry off the recorder's `frame:` log line (`… · WxH video`) — the overlay
offset is `((canvas_w − W)/2, (canvas_h − H)/2 + header)`:

```bash
G="[0:v]fps=12,scale=2054:1284:flags=lanczos,format=rgba[v];\
[2:v]format=gray[m];[v][m]alphamerge=shortest=1[va];\
[1:v]format=rgba[bg];[bg][va]overlay=254:158:shortest=1:format=auto[framed]"
IN=(-ss 0.4 -t 14 -i out.webm -loop 1 -i out.frame-plate.png -loop 1 -i out.frame-mask.png)

ffmpeg -y "${IN[@]}" -filter_complex \
  "$G;[framed]scale=800:-1:flags=lanczos,palettegen=max_colors=256:stats_mode=diff" \
  -frames:v 1 /tmp/pal.png
ffmpeg -y "${IN[@]}" -i /tmp/pal.png -filter_complex \
  "$G;[framed]scale=800:-1:flags=lanczos[x];[x][3:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  -f gif -loop 0 out.gif
```

`shortest=1` on **both** framesync filters is load-bearing: the `-loop 1` stills
never end, so without it the last video frame repeats forever and the encode
never terminates.

## Accessibility floor (cards/overlays)

Explanation-card text must hit WCAG contrast: 4.5:1 normal text (AA), 3:1 large
text; 7:1 for AAA margin — [WCAG 2.2 §1.4.3/1.4.6](https://www.w3.org/TR/WCAG22/#contrast-minimum).
The default theme (near-black glass, near-white text) clears AAA; check custom
themes before shipping. If a video carries meaningful narration, provide
captions/transcript at the destination.

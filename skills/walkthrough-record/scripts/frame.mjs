// Framing pass: composite the full-bleed recording onto a wallpaper canvas with
// rounded corners, a soft shadow and an optional macOS window header.
//
// Purely an EXPORT-time concern — the webm master stays full-bleed, so a frame can
// be added, changed or removed without re-recording. Two static layers do the work:
//
//   plate.png — everything BEHIND the video (wallpaper, glow, shadow, rim, header).
//               Rendered once by the Chromium we already drive: CSS beats an ffmpeg
//               filtergraph at mesh gradients, real shadows and window chrome.
//   mask.png  — white rounded rect on black at the video's size; ffmpeg alphamerges
//               it into the scaled video, then overlays that onto the plate.
//
// Per-pixel `geq` is deliberately avoided: it re-evaluates every pixel every frame.
// Baking both layers once turns the per-frame cost into a blit.
//
// Self-check: node frame.mjs --self-test
import { join } from 'node:path';

// Geometry is authored in CSS px ("points") and multiplied by the recorder's output
// scale, so a frame looks identical at `output.scale: 1` and at 2x.
export const FRAME_DEFAULTS = {
  background: 'auto',   // auto | studio | midnight | spotlight | paper | any CSS color/gradient
  pad: 0.062,           // canvas padding as a fraction of canvas WIDTH
  radius: null,         // CSS px; null → 13, or 10 (real macOS) when chrome is on
  chrome: false,        // macOS window header
  title: '',            // header title text (chrome only)
};

const FRAME_KEYS = new Set(Object.keys(FRAME_DEFAULTS));

// macOS window metrics, in points. Measured against Big Sur+ standard windows:
// 12pt lights on 20pt centres, 20pt in from the window edge, 28pt title bar,
// 10pt corner radius. The lights are the thing people notice when they're wrong.
export const MAC = { titleH: 28, dot: 12, gap: 8, inset: 20, radius: 10, titleSize: 13 };

// ---------- validation ----------
export function frameErrors(f) {
  const errs = [];
  if (f === true || f === false || f == null) return errs;
  if (typeof f !== 'object' || Array.isArray(f)) return ['output.frame must be true, false, or a mapping'];
  for (const k of Object.keys(f)) if (!FRAME_KEYS.has(k)) errs.push(`output.frame: unknown key '${k}' (allowed: ${[...FRAME_KEYS].join(', ')})`);
  if (f.pad != null && !(f.pad >= 0 && f.pad <= 0.25)) errs.push('output.frame.pad must be 0-0.25 (fraction of canvas width)');
  if (f.radius != null && !(f.radius >= 0 && f.radius <= 60)) errs.push('output.frame.radius must be 0-60 (CSS px)');
  if (f.chrome != null && typeof f.chrome !== 'boolean') errs.push('output.frame.chrome must be true or false');
  if (f.title != null && typeof f.title !== 'string') errs.push('output.frame.title must be a string');
  if (f.background != null && typeof f.background !== 'string') errs.push('output.frame.background must be a string (preset name, colour, or CSS gradient)');
  return errs;
}

// ---------- colour helpers ----------
export function parseColor(c) {
  if (typeof c !== 'string') return null;
  const m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!h) return null;
  const s = h[1].length === 3 ? [...h[1]].map(x => x + x).join('') : h[1];
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2
      : (r - g) / d + 4;
  return [h * 60, s, l];
}

export const relLuminance = ([r, g, b]) =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360} ${Math.round(clamp(s, 0, 1) * 100)}% ${Math.round(clamp(l, 0, 1) * 100)}%)`;

// ---------- backgrounds ----------
export const BACKGROUNDS = {
  studio: `background:#141327;background-image:
    radial-gradient(120% 90% at 12% 8%, #4B2E8A 0%, transparent 55%),
    radial-gradient(100% 80% at 88% 18%, #A3417A 0%, transparent 52%),
    radial-gradient(120% 110% at 60% 105%, #17306B 0%, transparent 60%),
    linear-gradient(155deg,#1B1636 0%,#0E0D1E 100%);`,
  midnight: `background:#0E0F14;background-image:
    radial-gradient(110% 80% at 25% 5%, #1D2130 0%, transparent 60%),
    linear-gradient(165deg,#141620 0%,#08090D 100%);`,
  spotlight: `background:#07080D;background-image:
    radial-gradient(70% 60% at 50% 45%, rgba(255,106,77,.16) 0%, transparent 70%);`,
  paper: `background:#F4F1EC;background-image:linear-gradient(170deg,#FAF8F5 0%,#EAE5DC 100%);`,
};

// Derive a wallpaper from what the recorded app actually looks like: hue comes from
// the app's brand colour, lightness is pushed away from the app's own background so
// the window edge always reads. This is `background: auto`.
export function autoBackground(ctx = {}) {
  const accent = parseColor(ctx.accent) ?? [91, 91, 214];
  const [h, s0] = rgbToHsl(accent);
  const s = clamp(s0, 0.42, 0.72);
  // A dark app needs a lighter field to separate from; a light app wants a deep one.
  const baseL = ctx.isDark ? 0.26 : 0.12;
  // Keep the hue spread narrow (±32°). Wider drifts into a second palette — an
  // indigo app picked up a teal corner and stopped reading as one wallpaper.
  return `background:${hsl(h - 8, s * 0.5, baseL)};background-image:
    radial-gradient(120% 90% at 12% 8%, ${hsl(h - 18, s, baseL + 0.14)} 0%, transparent 55%),
    radial-gradient(100% 80% at 88% 18%, ${hsl(h + 32, s, baseL + 0.11)} 0%, transparent 52%),
    radial-gradient(120% 110% at 60% 105%, ${hsl(h - 30, s * 0.75, baseL + 0.06)} 0%, transparent 60%),
    linear-gradient(155deg,${hsl(h - 6, s * 0.55, baseL + 0.05)} 0%,${hsl(h - 6, s * 0.6, baseL - 0.04)} 100%);`;
}

export function resolveBackground(spec, ctx) {
  if (!spec || spec === 'auto') return autoBackground(ctx);
  if (spec in BACKGROUNDS) return BACKGROUNDS[spec];
  return `background:${spec};`;   // raw CSS colour or gradient
}

// ---------- geometry ----------
const even = n => Math.round(n / 2) * 2;

export function frameGeometry({ canvas, scale, pad, radius, chrome }) {
  const padPx = even(pad * canvas.w);
  const titleH = chrome ? even(MAC.titleH * scale) : 0;
  const r = (radius ?? (chrome ? MAC.radius : 13)) * scale;
  let innerW = even(canvas.w - 2 * padPx);
  let innerH = even(innerW * canvas.h / canvas.w);
  const avail = canvas.h - 2 * padPx - titleH;
  if (innerH > avail) { innerH = even(avail); innerW = even(innerH * canvas.w / canvas.h); }
  const winH = innerH + titleH;
  return {
    canvas, radius: r, titleH, innerW, innerH, winH,
    x: even((canvas.w - innerW) / 2),
    y: even((canvas.h - winH) / 2 + titleH),   // video top (below the header)
  };
}

// ---------- layers ----------
export function plateHtml(g, { background, chrome, title, isDark }) {
  const rimW = Math.max(1, Math.round(1.5 * (g.radius / 26) * 2) / 2);
  const rim = isDark ? 'rgba(255,255,255,.20)' : 'rgba(255,255,255,.16)';
  const winTop = g.y - g.titleH;
  const d = MAC.dot * (g.titleH / MAC.titleH || 1);          // dot diameter, output px
  const gap = MAC.gap * (g.titleH / MAC.titleH || 1);
  const inset = MAC.inset * (g.titleH / MAC.titleH || 1);
  const lights = [['#FF5F57', '#E0443E'], ['#FEBC2E', '#DEA123'], ['#28C840', '#1AAB29']];
  return `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;width:${g.canvas.w}px;height:${g.canvas.h}px;overflow:hidden}
body{${background}}
.grain{position:absolute;inset:0;opacity:.035;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.rim{position:absolute;left:${g.x - rimW}px;top:${winTop - rimW}px;
  width:${g.innerW + rimW * 2}px;height:${g.winH + rimW * 2}px;
  border-radius:${g.radius + rimW}px;background:${rim};
  box-shadow:0 ${Math.round(g.radius * 1.8)}px ${Math.round(g.radius * 4.2)}px -${Math.round(g.radius * 0.85)}px rgba(4,3,14,.72),
             0 ${Math.round(g.radius * 0.4)}px ${Math.round(g.radius * 1.2)}px -${Math.round(g.radius * 0.45)}px rgba(4,3,14,.5)}
.win{position:absolute;left:${g.x}px;top:${winTop}px;width:${g.innerW}px;height:${g.winH}px;
  border-radius:${g.radius}px;overflow:hidden;background:${isDark ? '#1C1C1E' : '#F6F7FA'}}
.tb{position:relative;height:${g.titleH}px;display:flex;align-items:center;
  padding-left:${inset}px;gap:${gap}px;
  background:linear-gradient(${isDark ? '#2C2C2E,#232326' : '#F7F7F9,#EAEAEE'});
  border-bottom:1px solid ${isDark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.12)'}}
.tb i{width:${d}px;height:${d}px;border-radius:50%;flex:none}
.tb b{position:absolute;left:0;right:0;text-align:center;pointer-events:none;
  font:600 ${Math.round(MAC.titleSize * (g.titleH / MAC.titleH || 1))}px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;
  color:${isDark ? 'rgba(255,255,255,.72)' : 'rgba(0,0,0,.62)'}}
</style>
<div class=grain></div><div class=rim></div>
<div class=win>${g.titleH ? `<div class=tb>${lights
    .map(([f, s]) => `<i style="background:${f};box-shadow:inset 0 0 0 ${Math.max(1, d / 24)}px ${s}"></i>`).join('')
    }${title ? `<b>${escapeHtml(title)}</b>` : ''}</div>` : ''}</div>`;
}

export function maskHtml(g) {
  // Bottom-only rounding when a header sits above the video — its top corners are
  // already rounded by the plate, and rounding both would cut a notch out of the app.
  const r = g.titleH ? `0 0 ${g.radius}px ${g.radius}px` : `${g.radius}px`;
  return `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;width:${g.innerW}px;height:${g.innerH}px;background:#000;overflow:hidden}
div{width:${g.innerW}px;height:${g.innerH}px;border-radius:${r};background:#fff}
</style><div></div>`;
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- ffmpeg ----------
// Inputs: 0 = webm master, 1 = plate.png (-loop 1), 2 = mask.png (-loop 1).
// shortest=1 on BOTH framesync filters: the looped stills never EOF, so without it
// the last video frame repeats forever and the encode never terminates.
export function frameGraph(g, pre) {
  return `[0:v]${pre},scale=${g.innerW}:${g.innerH}:flags=lanczos,format=rgba[v];`
    + `[2:v]format=gray[m];[v][m]alphamerge=shortest=1[va];`
    + `[1:v]format=rgba[bg];[bg][va]overlay=${g.x}:${g.y}:shortest=1:format=auto[framed]`;
}

// ---------- plan + render ----------
export function framePlan({ frame, view, scale, context }) {
  const f = { ...FRAME_DEFAULTS, ...(frame === true ? {} : frame) };
  const isDark = context?.isDark ?? false;
  // even canvas: the plate defines the output size and libx264 needs yuv420p-friendly dims
  const canvas = { w: even(view.width), h: even(view.height) };
  const g = frameGeometry({ canvas, scale, pad: f.pad, radius: f.radius, chrome: f.chrome });
  const background = resolveBackground(f.background, context);
  return {
    ...g, chrome: f.chrome, backgroundName: f.background, isDark,
    html: { plate: plateHtml(g, { background, chrome: f.chrome, title: f.title, isDark }), mask: maskHtml(g) },
  };
}

// The layers are kept next to the outputs on purpose: they are what makes
// "re-export the gif from the webm, don't re-record" still work once a frame is on.
export async function renderLayers(browser, plan, outDir, name) {
  const paths = { plate: join(outDir, `${name}.frame-plate.png`), mask: join(outDir, `${name}.frame-mask.png`) };
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });   // fresh context: no curtain/init scripts
  for (const [key, size] of [
    ['plate', { width: plan.canvas.w, height: plan.canvas.h }],
    ['mask', { width: plan.innerW, height: plan.innerH }],
  ]) {
    const page = await ctx.newPage();
    await page.setViewportSize(size);
    await page.setContent(plan.html[key], { waitUntil: 'load' });
    await page.screenshot({ path: paths[key], type: 'png' });
    await page.close();
  }
  await ctx.close();
  return paths;
}

// ---------- self-check ----------
if (process.argv[1]?.endsWith('frame.mjs') && process.argv.includes('--self-test')) {
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
  const canvas = { w: 2560, h: 1600 };

  const g = frameGeometry({ canvas, scale: 2, pad: 0.062, radius: null, chrome: false });
  assert(g.titleH === 0, 'no chrome → no title bar');
  assert(g.radius === 26, `default radius 13pt@2x = 26, got ${g.radius}`);
  assert(g.innerW % 2 === 0 && g.innerH % 2 === 0, 'inner dims must be even for yuv420p');
  assert(g.x % 2 === 0 && g.y % 2 === 0, 'offsets must be even');
  assert(g.innerW <= canvas.w - 2 * 158 && g.innerH <= canvas.h - 2 * 158, 'video fits inside the padding');
  assert(Math.abs(g.innerW / g.innerH - canvas.w / canvas.h) < 0.01, 'aspect preserved');

  const c = frameGeometry({ canvas, scale: 2, pad: 0.062, radius: null, chrome: true });
  assert(c.titleH === 56, `28pt header at 2x = 56, got ${c.titleH}`);
  assert(c.radius === 20, `macOS 10pt radius at 2x = 20, got ${c.radius}`);
  assert(c.winH === c.innerH + c.titleH, 'window = header + video');
  assert(c.y - c.titleH === (canvas.h - c.winH) / 2, 'window is vertically centred, video sits below the header');
  assert(c.innerH + c.titleH <= canvas.h - 2 * even(0.062 * canvas.w), 'header eats into the video, not the padding');

  const s1 = frameGeometry({ canvas: { w: 1280, h: 800 }, scale: 1, pad: 0.062, radius: null, chrome: true });
  assert(s1.titleH === 28 && s1.radius === 10, 'chrome metrics track output.scale');

  // real macOS lights: 12pt on 20pt centres, 20pt inset
  assert(MAC.dot === 12 && MAC.gap === 8 && MAC.inset === 20, 'macOS light metrics');
  const html = plateHtml(c, { background: 'background:#000;', chrome: true, title: 'Orbit', isDark: false });
  assert(html.includes('width:24px;height:24px'), '12pt lights render at 24px at 2x');
  assert(html.includes('#FF5F57') && html.includes('#FEBC2E') && html.includes('#28C840'), 'three traffic lights');
  assert(html.includes('<b>Orbit</b>'), 'title renders');
  assert(plateHtml(c, { background: '', chrome: true, title: '<script>x', isDark: false }).includes('&lt;script&gt;'), 'title is escaped');
  assert(maskHtml(c).includes(`0 0 ${c.radius}px ${c.radius}px`), 'chrome → bottom-only rounding');
  assert(maskHtml(g).includes(`border-radius:${g.radius}px`), 'no chrome → all corners rounded');

  assert(JSON.stringify(rgbToHsl([255, 0, 0])) === JSON.stringify([0, 1, 0.5]), 'red → hsl(0,100%,50%)');
  assert(rgbToHsl(parseColor('rgb(91, 91, 214)'))[0] > 230, 'indigo hue');
  assert(parseColor('#fff')[0] === 255 && parseColor('#0d0e18')[2] === 24, 'hex parsing');
  assert(Math.abs(relLuminance([255, 255, 255]) - 1) < 1e-9 && relLuminance([0, 0, 0]) === 0, 'luminance bounds');
  assert(relLuminance([246, 247, 250]) > 0.5 && relLuminance([28, 28, 30]) < 0.5, 'light/dark split');

  const light = autoBackground({ accent: 'rgb(91,91,214)', isDark: false });
  const dark = autoBackground({ accent: 'rgb(91,91,214)', isDark: true });
  assert(light.includes('linear-gradient') && light.includes('hsl('), 'auto background is CSS');
  assert(+/hsl\((\d+) \d+% (\d+)%\)/.exec(dark)[2] > +/hsl\((\d+) \d+% (\d+)%\)/.exec(light)[2],
    'dark apps get a lighter field so the window separates');
  assert(autoBackground({}).includes('hsl('), 'auto background survives no context');
  assert(resolveBackground('studio') === BACKGROUNDS.studio, 'preset lookup');
  assert(resolveBackground('#101014') === 'background:#101014;', 'raw colour passthrough');

  assert(frameErrors(true).length === 0 && frameErrors(false).length === 0, 'true/false are valid');
  assert(frameErrors({ pad: 0.5 }).length === 1, 'pad range enforced');
  assert(frameErrors({ nope: 1 }).length === 1, 'unknown key rejected');
  assert(frameErrors({ chrome: 'yes' }).length === 1, 'chrome must be boolean');
  assert(frameErrors([]).length === 1, 'array rejected');

  const graph = frameGraph(g, 'fps=30');
  assert(graph.includes('alphamerge=shortest=1') && graph.includes('overlay=') && graph.includes('shortest=1'),
    'both framesync filters terminate on the video');
  assert(graph.endsWith('[framed]'), 'graph exposes [framed]');

  console.error('[frame] self-test OK');
}

#!/usr/bin/env node
// screenshooter recorder: scenario YAML -> polished walkthrough video (mp4 + gif).
// Drives a real Chromium via Playwright, injects an overlay engine (cursor,
// ripples, cards, spotlight, masks, camera zoom), records with page.screencast,
// exports via ffmpeg. Realtime capture; a frame-stepped renderer is the known
// upgrade path if capture jitter ever matters (ponytail: realtime is enough today).
import { chromium } from 'playwright';
import { parse } from 'yaml';
import { frameErrors, framePlan, renderLayers, frameGraph } from './frame.mjs';
import { readFileSync, mkdirSync, existsSync, rmSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------- args ----------
const args = process.argv.slice(2);
if (!args[0] || args.includes('--help')) {
  console.error('usage: node record.mjs <scenario.yaml> [--out DIR] [--webm-only] [--headed] [--validate-only]');
  process.exit(args.includes('--help') ? 0 : 2);
}
const scenarioPath = resolve(args[0]);
const outDirArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const webmOnly = args.includes('--webm-only');
const headed = args.includes('--headed');
const validateOnly = args.includes('--validate-only');

// ---------- scenario + theme ----------
const scenario = parse(readFileSync(scenarioPath, 'utf8'));
if (!scenario?.url) fail('scenario needs a top-level `url`');
if (!Array.isArray(scenario.steps) || !scenario.steps.length) fail('scenario needs a non-empty `steps` list');

const DEFAULT_THEME = {
  cursor: { size: 22, fill: '#111319', stroke: '#ffffff', ripple: '#FF6A4D' },
  card: {
    background: 'rgba(13,14,24,.88)', border: 'rgba(255,255,255,.13)',
    text: '#F2F3FA', accent: '#FF6A4D', radius: 14, width: 290, heroWidth: 520,
    font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif',
  },
  camera: { easing: 'cubic-bezier(.5,0,.2,1)', defaultScale: 1.6, zoomDuration: 0.9, settle: 0.2 },
  movement: { speed: 1.0, arc: 0.10, minDuration: 0.35, maxDuration: 1.4 },
  typing: { delay: 70 },
  timing: { preClick: 0.25, postClick: 0.35, cardDefault: 3.0, heroDefault: 2.6 },
};
function deepMerge(base, over) {
  if (!over) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] ? deepMerge(base[k], v) : v;
  }
  return out;
}
let theme = DEFAULT_THEME;
if (typeof scenario.theme === 'string') {
  const p = resolve(dirname(scenarioPath), scenario.theme);
  const presetPath = existsSync(p) ? p : join(HERE, 'themes', scenario.theme + '.yaml');
  if (!existsSync(presetPath)) fail(`theme not found: ${scenario.theme} (looked at ${p} and ${presetPath})`);
  theme = deepMerge(DEFAULT_THEME, parse(readFileSync(presetPath, 'utf8')));
} else if (scenario.theme) {
  theme = deepMerge(DEFAULT_THEME, scenario.theme);
}

// ---------- pre-flight validation (before any browser opens) ----------
const TOP_KEYS = new Set(['schema', 'name', 'url', 'viewport', 'colorScheme', 'storageState', 'locale',
  'timezone', 'frozenTime', 'mask', 'theme', 'output', 'steps']);
const STEP_KEYS = {
  goto: ['url'], wait: ['for', 'until', 'timeout'], assert: ['visible', 'text', 'timeout'],
  move: ['to', 'duration', 'ax', 'ay', 'dx', 'dy'], hover: ['to', 'duration', 'ax', 'ay', 'dx', 'dy'],
  click: ['target', 'to', 'ax', 'ay', 'dx', 'dy'], dblclick: ['target', 'to', 'ax', 'ay', 'dx', 'dy'],
  type: ['into', 'text', 'delay'], press: ['key'], select: ['target', 'value'],
  zoom: ['to', 'scale', 'duration', 'reset'], card: ['kicker', 'title', 'body', 'at', 'side', 'position', 'style', 'duration', 'sticky'],
  hidecards: [], ring: ['to', 'pad', 'dim'], mask: [], scroll: ['to', 'by'],
};
function validateScenario(s) {
  const errs = [];
  if (s.schema != null && s.schema !== 1) errs.push(`schema: unsupported version ${s.schema} (this recorder implements schema 1)`);
  for (const k of Object.keys(s)) if (!TOP_KEYS.has(k)) errs.push(`unknown top-level key '${k}' (allowed: ${[...TOP_KEYS].join(', ')})`);
  if (typeof s.url !== 'string') errs.push('`url` must be a string');
  else if (/^[a-z][a-z0-9+.-]*:/i.test(s.url) && !/^(https?|file):/i.test(s.url)) errs.push(`url scheme not allowed: ${s.url} (http, https or file only)`);
  const vp = s.viewport ?? {};
  if (vp.width != null && !(vp.width >= 320 && vp.width <= 3840)) errs.push('viewport.width must be 320-3840');
  if (vp.height != null && !(vp.height >= 240 && vp.height <= 2400)) errs.push('viewport.height must be 240-2400');
  const out = s.output ?? {};
  if (out.fps != null && !(out.fps >= 5 && out.fps <= 60)) errs.push('output.fps must be 5-60');
  if (out.scale != null && !(out.scale >= 1 && out.scale <= 3)) errs.push('output.scale must be 1-3');
  errs.push(...frameErrors(out.frame));
  s.steps?.forEach((step, i) => {
    const where = `steps[${i + 1}]`;
    if (typeof step === 'string') {
      if (!(step in STEP_KEYS)) errs.push(`${where}: unknown step '${step}'`);
      return;
    }
    if (!step || typeof step !== 'object') { errs.push(`${where}: must be a step mapping or name`); return; }
    const keys = Object.keys(step).filter(k => k !== 'id');
    if (keys.length !== 1) { errs.push(`${where}: exactly one step kind per list item (got: ${keys.join(', ') || 'none'})`); return; }
    const kind = keys[0];
    if (!(kind in STEP_KEYS)) { errs.push(`${where}: unknown step kind '${kind}'`); return; }
    const arg = step[kind];
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      for (const k of Object.keys(arg)) {
        if (k !== 'id' && !STEP_KEYS[kind].includes(k)) errs.push(`${where}: unknown key '${k}' for '${kind}' (allowed: ${STEP_KEYS[kind].join(', ') || 'none'})`);
      }
      for (const num of ['duration', 'scale', 'delay', 'pad', 'dim', 'timeout', 'ax', 'ay', 'dx', 'dy', 'by']) {
        if (arg[num] != null && Number.isNaN(parseFloat(arg[num]))) errs.push(`${where}: '${num}' must be a number`);
      }
    }
  });
  if (errs.length) {
    console.error('[shooter] scenario validation failed:');
    for (const e of errs) console.error('  - ' + e);
    process.exit(1);
  }
}
validateScenario(scenario);
if (validateOnly) {
  console.error('[shooter] scenario OK (schema 1) — validate-only, no browser launched');
  process.exit(0);
}

const base = { width: scenario.viewport?.width ?? 1280, height: scenario.viewport?.height ?? 800 };
// Rendering scale: viewport runs at base*scale CSS px with `html { zoom: scale }`,
// which rasterizes the app at true 2x for crisp text. Apps with strict
// viewport-width media queries may lay out differently; set output.scale: 1 then.
const scale = scenario.output?.scale ?? 2;
const view = { width: base.width * scale, height: base.height * scale };
const outDir = resolve(outDirArg ?? scenario.output?.dir ?? 'out');
mkdirSync(outDir, { recursive: true });
// basename() so a scenario `name` can never traverse outside the output dir
const name = basename(scenario.name ?? basename(scenarioPath).replace(/\.(ya?ml)$/, ''));
const webmPath = join(outDir, name + '.webm');

// ---------- easing / choreography ----------
const easeInOutCubic = v => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
let mouse = { x: view.width * 0.68, y: view.height * 0.6 };
let arcFlip = 1;

async function movePointer(page, to, durationOverride) {
  const from = { ...mouse };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist < 2) return;
  const m = theme.movement;
  let duration = durationOverride ?? Math.min(m.maxDuration, Math.max(m.minDuration, dist / (900 * scale * m.speed)));
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const k = m.arc * arcFlip; arcFlip *= -1;
  const c = { x: mx - (to.y - from.y) * k, y: my + (to.x - from.x) * k };
  const steps = Math.max(8, Math.round(duration * 60));
  const t0 = Date.now();
  for (let i = 1; i <= steps; i++) {
    const v = easeInOutCubic(i / steps);
    const u = 1 - v;
    const x = u * u * from.x + 2 * u * v * c.x + v * v * to.x;
    const y = u * u * from.y + 2 * u * v * c.y + v * v * to.y;
    await page.mouse.move(x, y);
    const target = t0 + (i / steps) * duration * 1000;
    const lag = target - Date.now();
    if (lag > 0) await sleep(lag);
  }
  mouse = { ...to };
}

async function targetPoint(page, sel, offset = {}) {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 10000 });
  const box = await loc.boundingBox();
  if (!box) fail(`cannot resolve position of: ${sel}`);
  return {
    x: box.x + box.width * (offset.ax ?? 0.5) + (offset.dx ?? 0) * scale,
    y: box.y + box.height * (offset.ay ?? 0.5) + (offset.dy ?? 0) * scale,
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const secs = v => (typeof v === 'number' ? v : parseFloat(v));

// ---------- overlay ----------
const overlaySource = readFileSync(join(HERE, 'overlay.js'), 'utf8');
let pageContext = null;   // {accent, bg, isDark} — sampled once, feeds `frame.background: auto`
async function injectOverlay(page) {
  if (scale !== 1) await page.evaluate(z => { document.documentElement.style.zoom = z; }, scale);
  await page.evaluate(t => { window.__shooterTheme = t; }, { ...theme, __zoom: scale });
  await page.addScriptTag({ content: overlaySource });
  if (!pageContext) pageContext = await page.evaluate(() => window.__shooter.context());
  if (scenario.mask?.length) {
    const missing = await page.evaluate(sels => window.__shooter.mask(sels), scenario.mask);
    if (missing.length) fail(`mask selectors matched nothing: ${missing.join(', ')} — refusing to record (fail-closed)`);
    await page.evaluate(() => document.getElementById('__shooter-curtain')?.remove());
  }
  await page.mouse.move(mouse.x, mouse.y);
}

// ---------- step handlers ----------
async function runStep(page, step, i) {
  const kind = typeof step === 'string' ? step : Object.keys(step)[0];
  const arg = typeof step === 'string' ? undefined : step[kind];
  log(`step ${i + 1}: ${kind}${typeof arg === 'string' ? ' ' + arg : ''}`);
  switch (kind) {
    case 'goto': {
      await page.goto(typeof arg === 'string' ? arg : arg.url, { waitUntil: 'load' });
      await injectOverlay(page);
      break;
    }
    case 'wait': {
      if (typeof arg === 'number' || typeof arg === 'string') await sleep(secs(arg) * 1000);
      else if (arg.for) await page.locator(arg.for).first().waitFor({ state: 'visible', timeout: (arg.timeout ?? 15) * 1000 });
      else if (arg.until === 'networkidle') await page.waitForLoadState('networkidle');
      else fail(`step ${i + 1}: wait needs seconds, {for: selector} or {until: networkidle}`);
      break;
    }
    case 'assert': {
      const a = typeof arg === 'string' ? { visible: arg } : arg;
      if (a.visible) await page.locator(a.visible).first().waitFor({ state: 'visible', timeout: (a.timeout ?? 5) * 1000 })
        .catch(() => fail(`step ${i + 1}: assert failed — not visible: ${a.visible}`));
      if (a.text) {
        const found = await page.getByText(a.text).first().isVisible().catch(() => false);
        if (!found) fail(`step ${i + 1}: assert failed — text not visible: ${a.text}`);
      }
      break;
    }
    case 'move': case 'hover': {
      const a = typeof arg === 'string' ? { to: arg } : arg;
      const to = Array.isArray(a.to) ? { x: a.to[0] * scale, y: a.to[1] * scale } : await targetPoint(page, a.to, a);
      await movePointer(page, to, a.duration && secs(a.duration));
      break;
    }
    case 'click': case 'dblclick': {
      const a = typeof arg === 'string' ? { target: arg } : arg;
      const sel = a.target ?? a.to;
      if (sel) await movePointer(page, await targetPoint(page, sel, a));
      await sleep(theme.timing.preClick * 1000);
      const clicks = kind === 'dblclick' ? 2 : 1;
      for (let c = 0; c < clicks; c++) {
        await page.mouse.down(); await sleep(90); await page.mouse.up();
        if (clicks > 1) await sleep(80);
      }
      await sleep(theme.timing.postClick * 1000);
      break;
    }
    case 'type': {
      const a = typeof arg === 'string' ? { text: arg } : arg;
      if (a.into) {
        await movePointer(page, await targetPoint(page, a.into));
        await sleep(theme.timing.preClick * 1000);
        await page.mouse.down(); await sleep(80); await page.mouse.up();
        await sleep(200);
      }
      await page.keyboard.type(a.text, { delay: a.delay ?? theme.typing.delay });
      break;
    }
    case 'press': {
      await page.keyboard.press(typeof arg === 'string' ? arg : arg.key);
      await sleep(250);
      break;
    }
    case 'select': {
      await page.locator(arg.target).first().selectOption(arg.value);
      await sleep(300);
      break;
    }
    case 'zoom': {
      if (arg === 'reset' || arg === undefined || arg?.reset) {
        const d = secs(arg?.duration ?? theme.camera.zoomDuration);
        await page.evaluate(d2 => window.__shooter.camera.reset(d2), d);
        await sleep((d + theme.camera.settle) * 1000);
      } else {
        const a = typeof arg === 'string' ? { to: arg } : arg;
        const zscale = a.scale ?? theme.camera.defaultScale;
        const d = secs(a.duration ?? theme.camera.zoomDuration);
        await page.evaluate(({ sel, zscale, d }) => window.__shooter.camera.zoomTo(sel, zscale, d), { sel: a.to, zscale, d });
        await sleep((d + theme.camera.settle) * 1000);
      }
      break;
    }
    case 'card': {
      const a = arg;
      const hero = a.style === 'hero';
      const duration = secs(a.duration ?? (hero ? theme.timing.heroDefault : theme.timing.cardDefault));
      const id = await page.evaluate(cfg => window.__shooter.showCard(cfg), a);
      if (a.sticky) { stickyCards.push(id); break; }
      await sleep(duration * 1000);
      await page.evaluate(id2 => window.__shooter.hideCard(id2), id);
      await sleep(450);
      break;
    }
    case 'hidecards': {
      for (const id of stickyCards.splice(0)) await page.evaluate(id2 => window.__shooter.hideCard(id2), id);
      await sleep(450);
      break;
    }
    case 'ring': {
      if (arg === 'hide') { await page.evaluate(() => window.__shooter.ringHide()); await sleep(300); }
      else {
        const a = typeof arg === 'string' ? { to: arg } : arg;
        await page.evaluate(({ sel, pad, dim }) => window.__shooter.ringShow(sel, pad, dim), { sel: a.to, pad: (a.pad ?? 10) * scale, dim: a.dim ?? 0 });
        await sleep(500);
      }
      break;
    }
    case 'mask': {
      const missing = await page.evaluate(sels => window.__shooter.mask(Array.isArray(sels) ? sels : [sels]), arg);
      if (missing.length) fail(`step ${i + 1}: mask selectors matched nothing: ${missing.join(', ')} (fail-closed)`);
      break;
    }
    case 'scroll': {
      const a = typeof arg === 'string' ? { to: arg } : arg;
      if (a.to) await page.locator(a.to).first().evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      else await page.mouse.wheel(0, (a.by ?? 300) * scale);
      await sleep(700);
      break;
    }
    default:
      fail(`step ${i + 1}: unknown step kind '${kind}'`);
  }
}

// ---------- ffmpeg ----------
function ffmpeg(fargs) {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...fargs], { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (e) {
    fail(`ffmpeg failed (is ffmpeg installed and on PATH?): ${e.message}`);
  }
}
function atomically(out, work) {
  const tmp = join(dirname(out), '.tmp-' + basename(out));
  work(tmp);
  renameSync(tmp, out);
}
// A frame turns both exports into filter_complex graphs over three inputs
// (master + plate + mask). The webm master always stays full-bleed, so the frame
// can be changed or dropped by re-exporting — never by re-recording.
const frameInputs = f => ['-loop', '1', '-i', f.paths.plate, '-loop', '1', '-i', f.paths.mask];

function exportMp4(webm, out, fps, frame) {
  const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart'];
  atomically(out, tmp => ffmpeg(frame
    ? ['-i', webm, ...frameInputs(frame), '-filter_complex',
      `${frameGraph(frame.plan, `fps=${fps}`)};[framed]format=yuv420p[out]`,
      '-map', '[out]', '-f', 'mp4', ...enc, tmp]
    : ['-i', webm, '-f', 'mp4',
      '-vf', `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`, ...enc, tmp]));
  try {
    const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,nb_frames:format=duration', '-of', 'csv=p=0', out]).toString().trim();
    log(`mp4 check: ${probe.replace(/\n/g, ' | ')}`);
  } catch { /* ffprobe missing is not fatal */ }
}
function exportGif(webm, out, { fps = 12, width = 960, colors, dither, start, duration } = {}, frame) {
  // Gradient wallpapers band badly in a 128-colour bayer palette; 256 + error
  // diffusion is both smoother AND smaller here (diffusion at 128 colours makes
  // per-pixel noise that kills inter-frame compression). Unframed keeps the
  // cheaper defaults.
  const nColors = colors ?? (frame ? 256 : 128);
  const dth = dither ?? (frame ? 'sierra2_4a' : 'bayer:bayer_scale=5');
  const palette = out + '.palette.png';
  const seek = [...(start != null ? ['-ss', String(start)] : []), ...(duration != null ? ['-t', String(duration)] : [])];
  const post = `scale=${width}:-1:flags=lanczos`;
  const vf = `fps=${fps},${post}`;
  atomically(out, tmp => {
    if (frame) {
      const g = frameGraph(frame.plan, `fps=${fps}`);
      ffmpeg([...seek, '-i', webm, ...frameInputs(frame), '-filter_complex',
        `${g};[framed]${post},palettegen=max_colors=${nColors}:stats_mode=diff`, '-frames:v', '1', palette]);
      ffmpeg([...seek, '-i', webm, ...frameInputs(frame), '-i', palette, '-f', 'gif', '-filter_complex',
        `${g};[framed]${post}[x];[x][3:v]paletteuse=dither=${dth}:diff_mode=rectangle`, '-loop', '0', tmp]);
    } else {
      ffmpeg([...seek, '-i', webm, '-vf', `${vf},palettegen=max_colors=${nColors}:stats_mode=diff`, palette]);
      ffmpeg([...seek, '-i', webm, '-i', palette, '-f', 'gif', '-lavfi',
        `${vf}[x];[x][1:v]paletteuse=dither=${dth}:diff_mode=rectangle`, '-loop', '0', tmp]);
    }
    rmSync(palette, { force: true });
  });
}

// ---------- main ----------
const stickyCards = [];
function log(msg) { console.error('[shooter] ' + msg); }
function fail(msg) { console.error('[shooter] ERROR: ' + msg); process.exit(1); }

const t0 = Date.now();
const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext({
  viewport: view,
  colorScheme: scenario.colorScheme ?? 'light',
  ...(scenario.storageState ? { storageState: resolve(dirname(scenarioPath), scenario.storageState) } : {}),
  ...(scenario.locale ? { locale: scenario.locale } : {}),
  ...(scenario.timezone ? { timezoneId: scenario.timezone } : {}),
});
if (scenario.mask?.length) {
  // fail-closed masking: every navigation paints an opaque curtain at
  // document-start; the recorder lifts it only after masks are re-applied.
  await context.addInitScript(() => {
    const curtain = document.createElement('div');
    curtain.id = '__shooter-curtain';
    curtain.style.cssText = 'position:fixed;inset:0;background:#0F1118;z-index:2147483647';
    const attach = () => document.documentElement
      ? document.documentElement.appendChild(curtain)
      : requestAnimationFrame(attach);
    attach();
  });
}
if (scenario.frozenTime) {
  const epoch = new Date(scenario.frozenTime).getTime();
  if (Number.isNaN(epoch)) fail(`frozenTime is not a date: ${scenario.frozenTime}`);
  await context.addInitScript(e => {
    const RealDate = Date;
    const now = () => e;
    // eslint-disable-next-line no-global-assign
    Date = class extends RealDate {
      constructor(...a) { a.length ? super(...a) : super(e); }
      static now() { return now(); }
    };
  }, epoch);
}
const page = await context.newPage();

let url = scenario.url;
if (!/^[a-z]+:/.test(url)) url = pathToFileURL(resolve(dirname(scenarioPath), url)).href;
await page.goto(url, { waitUntil: 'load' });
if (scenario.mask?.length) {
  // masks (and their curtain teardown) must exist before the first captured frame
  await injectOverlay(page);
  await page.screencast.start({ path: webmPath, size: view });
} else {
  await page.screencast.start({ path: webmPath, size: view });
  await injectOverlay(page);
}
await sleep(400); // lead-in frames

let stopped = false;
const stopCast = async () => { if (!stopped) { stopped = true; await page.screencast.stop(); } };
let frame = null;
try {
  for (let i = 0; i < scenario.steps.length; i++) await runStep(page, scenario.steps[i], i);
  await sleep(600); // tail frames
  await stopCast();
  // Plate + mask are rendered by the browser we already have open, in a FRESH
  // context so the mask curtain and frozen-time init scripts can't reach them.
  if (!webmOnly && scenario.output?.frame) {
    const plan = framePlan({ frame: scenario.output.frame, view, scale, context: pageContext });
    frame = { plan, paths: await renderLayers(browser, plan, outDir, name) };
    log(`frame: ${plan.canvas.w}x${plan.canvas.h} canvas · ${plan.innerW}x${plan.innerH} video · `
      + `background ${plan.backgroundName} (${plan.isDark ? 'dark' : 'light'} app)`
      + `${plan.chrome ? ` · macOS header ${plan.titleH}px` : ''}`);
  }
} finally {
  await stopCast();
  await browser.close();
}
log(`recorded ${webmPath} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (!webmOnly) {
  const fps = scenario.output?.fps ?? 30;
  if (scenario.output?.mp4 !== false) {
    const mp4 = join(outDir, name + '.mp4');
    exportMp4(webmPath, mp4, fps, frame);
    log('wrote ' + mp4);
  }
  if (scenario.output?.gif !== false) {
    const gif = join(outDir, name + '.gif');
    exportGif(webmPath, gif, typeof scenario.output?.gif === 'object' ? scenario.output.gif : {}, frame);
    log('wrote ' + gif);
  }
  // frame layers are left in place — they are the inputs for re-exporting a gif
  // from the webm master without re-recording (references/export-profiles.md)
  if (frame) log(`frame layers kept: ${basename(frame.paths.plate)}, ${basename(frame.paths.mask)}`);
}
log('done');

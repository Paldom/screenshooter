// Injected overlay engine: fake cursor, click ripples, spotlight ring, masks,
// explanation cards, camera zoom. Lives on document.documentElement; the camera
// transform is applied to <body> only, so overlay visuals never zoom with it.
// The whole document (app + overlay) may run under `html { zoom: Z }` for crisp
// 2x rendering: rects/events arrive in visual px, style offsets are local px,
// so every position write divides by Z (sizes need no conversion).
(() => {
  if (window.__shooter) return;

  const T = window.__shooterTheme || {};
  const Z = T.__zoom || 1;
  const px = v => (v / Z) + 'px';
  const cursorT = T.cursor || {};
  const cardT = T.card || {};
  const cameraT = T.camera || {};

  // ---- adaptive accent: sample the app's brand color when set to 'auto' ----
  // ponytail: heuristic — most-repeated saturated button/link color wins;
  // backgrounds weigh more than text. Good enough for real product UIs.
  function sampleAccent() {
    const seen = new Map();
    const els = document.querySelectorAll('button,[class*="btn"],[role=button],a');
    for (const el of [...els].slice(0, 300)) {
      const cs = getComputedStyle(el);
      for (const c of [cs.backgroundColor, cs.color]) {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
        if (!m) continue;
        const r = +m[1], g = +m[2], b = +m[3];
        if (m[4] != null && +m[4] < 0.99) continue;
        if (Math.max(r, g, b) - Math.min(r, g, b) < 60) continue; // grey/neutral
        const key = `rgb(${r},${g},${b})`;
        seen.set(key, (seen.get(key) || 0) + (c === cs.backgroundColor ? 3 : 1));
      }
    }
    let best = null, n = 0;
    for (const [k, v] of seen) if (v > n) { best = k; n = v; }
    return best;
  }
  const auto = (cursorT.ripple === 'auto' || cardT.accent === 'auto') ? sampleAccent() : null;
  const accent = (cardT.accent === 'auto' ? auto : cardT.accent) || '#FF6A4D';
  const rippleC = (cursorT.ripple === 'auto' ? auto : cursorT.ripple) || accent;

  // ---- structural design tokens (all theme-overridable) ----
  const cstyle = cursorT.style || 'arrow';        // arrow | dot | halo
  const clickAnim = cursorT.click || 'ripple';    // ripple | rings | pulse | none
  const layout = cardT.layout || 'stack';         // stack | minimal | pill
  const padScale = cardT.padding ?? 1;            // card padding multiplier
  const blur = cardT.blur ?? 10;                  // backdrop blur px
  const sat = cardT.saturate ?? 1;                // backdrop saturation

  const Zi = 2147483000;
  const root = document.createElement('div');
  root.id = '__shooter-root';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${Zi};`;

  const style = document.createElement('style');
  style.textContent = `
:where(#__shooter-root *){margin:0;padding:0;box-sizing:border-box}
#__shooter-cursor{position:fixed;left:0;top:0;width:${cursorT.size || 22}px;z-index:${Zi + 30};
  transition:transform .13s ease;will-change:left,top;
  ${cstyle === 'arrow'
    ? 'transform-origin:4px 3px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));'
    : `height:${cursorT.size || 22}px;transform-origin:center;border-radius:50%;
  background:${cursorT.fill || '#111319'};border:1.5px solid ${cursorT.stroke || '#ffffff'};
  box-shadow:0 2px 8px rgba(0,0,0,.25)${cstyle === 'halo' ? `,0 0 0 ${Math.round((cursorT.size || 22) * 0.42)}px color-mix(in srgb,${rippleC} 20%,transparent)` : ''};`}}
#__shooter-cursor.down{transform:scale(${cstyle === 'arrow' ? '.8' : '.82'})}
.__shooter-ripple{position:fixed;width:14px;height:14px;border-radius:50%;
  border:2px solid ${rippleC};transform:translate(-50%,-50%);
  z-index:${Zi + 20};animation:__shooter-rip .55s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes __shooter-rip{from{opacity:.9;scale:.4}to{opacity:0;scale:3.4}}
.__shooter-pulse{position:fixed;width:26px;height:26px;border-radius:50%;
  background:color-mix(in srgb,${rippleC} 45%,transparent);transform:translate(-50%,-50%);
  z-index:${Zi + 20};animation:__shooter-pul .5s ease-out forwards}
@keyframes __shooter-pul{from{opacity:.85;scale:.5}to{opacity:0;scale:2.4}}
#__shooter-ring{position:fixed;opacity:0;z-index:${Zi + 10};
  transition:left .5s cubic-bezier(.5,0,.2,1),top .5s cubic-bezier(.5,0,.2,1),width .5s,height .5s,opacity .3s,box-shadow .4s;
  --rc:${rippleC};
  background:
   linear-gradient(var(--rc),var(--rc)) left top/16px 2px,
   linear-gradient(var(--rc),var(--rc)) left top/2px 16px,
   linear-gradient(var(--rc),var(--rc)) right top/16px 2px,
   linear-gradient(var(--rc),var(--rc)) right top/2px 16px,
   linear-gradient(var(--rc),var(--rc)) left bottom/16px 2px,
   linear-gradient(var(--rc),var(--rc)) left bottom/2px 16px,
   linear-gradient(var(--rc),var(--rc)) right bottom/16px 2px,
   linear-gradient(var(--rc),var(--rc)) right bottom/2px 16px;
  background-repeat:no-repeat;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--rc) 45%,transparent))}
#__shooter-ring.on{opacity:1}
.__shooter-mask{position:fixed;z-index:${Zi + 5};border-radius:6px;
  background:#9CA3B0}
.__shooter-card{position:fixed;width:${cardT.width || 290}px;z-index:${Zi + 40};
  background:${cardT.background || 'rgba(13,14,24,.88)'};
  backdrop-filter:blur(${blur}px) saturate(${sat});-webkit-backdrop-filter:blur(${blur}px) saturate(${sat});
  border:1px solid ${cardT.border || 'rgba(255,255,255,.13)'};
  border-radius:${cardT.radius ?? 14}px;padding:${Math.round(15 * padScale)}px ${Math.round(17 * padScale)}px;
  color:${cardT.text || '#F2F3FA'};
  font-family:${cardT.font || '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif'};
  box-shadow:0 24px 60px -18px rgba(4,3,16,.8);opacity:0;transform:translateY(12px);
  transition:opacity .34s ease,transform .34s cubic-bezier(.3,1.2,.4,1)}
.__shooter-card.shown{opacity:1;transform:none}
.__shooter-card .k{font:700 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;
  color:${accent};display:flex;align-items:center;gap:8px;text-transform:uppercase}
.__shooter-card .k:not(:empty)::after{content:"";flex:1;height:1px;background:color-mix(in srgb,${accent} 30%,transparent)}
.__shooter-card h3{font-size:15.5px;letter-spacing:-.01em;margin:9px 0 5px;font-weight:700}
.__shooter-card p{font-size:12.5px;line-height:1.55;color:color-mix(in srgb,${cardT.text || '#F2F3FA'} 78%,transparent)}
.__shooter-card.minimal .k{font-family:inherit;font-weight:650;font-size:10px;letter-spacing:.12em;
  color:color-mix(in srgb,${accent} 88%,transparent)}
.__shooter-card.minimal .k:not(:empty)::after{display:none}
.__shooter-card.minimal h3{font-weight:650;margin:${Math.round(10 * padScale)}px 0 ${Math.round(6 * padScale)}px}
.__shooter-card.minimal p{line-height:1.6}
.__shooter-card.pill{width:auto;max-width:${cardT.width || 290}px;display:flex;align-items:center;gap:9px;
  padding:${Math.round(11 * padScale)}px ${Math.round(16 * padScale)}px;border-radius:999px}
.__shooter-card.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:${accent};flex:none}
.__shooter-card.pill .k{display:none}
.__shooter-card.pill h3{font-size:13.5px;font-weight:650;margin:0;white-space:nowrap}
.__shooter-card.pill p{display:none}
.__shooter-card.hero{width:${cardT.heroWidth || 520}px;left:50%;top:46%;
  transform:translate(-50%,-50%) scale(.96);text-align:center;
  border-radius:${Math.max(20, (cardT.radius ?? 14) + 6)}px;padding:${Math.round(34 * padScale)}px ${Math.round(30 * padScale)}px;
  transition:opacity .4s ease,transform .4s cubic-bezier(.3,1.2,.4,1)}
.__shooter-card.hero.shown{transform:translate(-50%,-50%) scale(1)}
.__shooter-card.hero .k{justify-content:center;letter-spacing:.22em}
.__shooter-card.hero .k:not(:empty)::after{display:none}
.__shooter-card.hero h3{font-size:33px;font-weight:800;letter-spacing:-.03em;margin:12px 0 8px}
.__shooter-card.hero p{font-size:14.5px}
`;

  let cursor, hotX = 4, hotY = 3;
  if (cstyle === 'arrow') {
    cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cursor.setAttribute('viewBox', '0 0 24 24');
    cursor.setAttribute('fill', 'none');
    cursor.innerHTML = `<path d="M5 3.2 18.6 13l-6 .8 3.3 6.1-2.7 1.4-3.2-6.2-4 4.4Z"
      fill="${cursorT.fill || '#111319'}" stroke="${cursorT.stroke || '#fff'}" stroke-width="1.6" stroke-linejoin="round"/>`;
  } else {
    // dot / halo: circular cursor, hotspot at center
    cursor = document.createElement('div');
    hotX = hotY = (cursorT.size || 22) / 2;
  }
  cursor.id = '__shooter-cursor';

  const ring = document.createElement('div');
  ring.id = '__shooter-ring';
  const rippleHost = document.createElement('div');
  const maskHost = document.createElement('div');

  root.append(ring, maskHost, rippleHost, cursor);
  document.documentElement.append(style, root);

  // Cursor mirrors real (Playwright-driven) pointer events exactly; the easing
  // already happened on the driver side, so no extra lag here.
  let cx = -1000, cy = -1000;
  const paint = () => {
    cursor.style.left = px(cx - hotX * Z);
    cursor.style.top = px(cy - hotY * Z);
  };
  function spawnClick(x, y) {
    if (clickAnim === 'none') return;
    const mk = cls => {
      const r = document.createElement('i');
      r.className = cls;
      r.style.left = px(x);
      r.style.top = px(y);
      rippleHost.appendChild(r);
      r.addEventListener('animationend', () => r.remove());
    };
    if (clickAnim === 'pulse') mk('__shooter-pulse');
    else {
      mk('__shooter-ripple');
      if (clickAnim === 'rings') setTimeout(() => mk('__shooter-ripple'), 130);
    }
  }
  window.addEventListener('mousemove', e => { cx = e.clientX; cy = e.clientY; paint(); }, { capture: true, passive: true });
  window.addEventListener('mousedown', e => {
    cursor.classList.add('down');
    spawnClick(e.clientX, e.clientY);
  }, { capture: true, passive: true });
  window.addEventListener('mouseup', () => cursor.classList.remove('down'), { capture: true, passive: true });

  // ---- camera (zoom) ----
  // Transform <body> only; the overlay lives on <html> and stays put.
  // ponytail: viewport-space math assumes an unscrolled page during the zoom
  // beat; scrolled zooms are clamped to document bounds but untested territory.
  const camera = {
    scale: 1,
    apply(scale, tx, ty, duration) {
      const b = document.body;
      b.style.transition = `transform ${duration}s ${cameraT.easing || 'cubic-bezier(.5,0,.2,1)'}`;
      b.style.transformOrigin = '0 0';
      b.style.willChange = 'transform';
      b.style.transform = scale === 1 && !tx && !ty ? '' : `translate(${tx}px, ${ty}px) scale(${scale})`;
      this.scale = scale;
    },
    zoomTo(selector, scale, duration) {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`zoom target not found: ${selector}`);
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const sx = window.scrollX, sy = window.scrollY;
      // visual-space math: rendered = doc*scale + t - scroll
      const cur = this._current();
      const docX = (r.left + r.width / 2 + sx - cur.tx) / cur.scale;
      const docY = (r.top + r.height / 2 + sy - cur.ty) / cur.scale;
      let tx = vw / 2 + sx - docX * scale;
      let ty = vh / 2 + sy - docY * scale;
      const docW = Math.max(document.documentElement.scrollWidth * Z, vw);
      const docH = Math.max(document.documentElement.scrollHeight * Z, vh);
      tx = Math.min(sx, Math.max(sx + vw - docW * scale, tx));
      ty = Math.min(sy, Math.max(sy + vh - docH * scale, ty));
      // body's translate px are local units under html zoom
      this.apply(scale, tx / Z, ty / Z, duration);
      this._t = { tx, ty };
    },
    reset(duration) { this.apply(1, 0, 0, duration); this._t = { tx: 0, ty: 0 }; },
    _t: { tx: 0, ty: 0 },
    _current() {
      // visual-space translate of the current camera
      return { scale: this.scale, tx: this._t.tx, ty: this._t.ty };
    },
  };

  // ---- cards ----
  let seq = 0;
  const cards = new Map();
  function showCard(cfg) {
    const id = ++seq;
    const el = document.createElement('div');
    const variant = cfg.style === 'hero' ? ' hero' : (layout !== 'stack' ? ' ' + layout : '');
    el.className = '__shooter-card' + variant;
    const k = document.createElement('div'); k.className = 'k'; k.textContent = cfg.kicker || '';
    const h = document.createElement('h3'); h.textContent = cfg.title || '';
    const p = document.createElement('p'); p.textContent = cfg.body || '';
    el.append(k, h, p);
    root.appendChild(el);
    if (cfg.style !== 'hero') placeCard(el, cfg);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('shown')));
    cards.set(id, el);
    return id;
  }
  function placeCard(el, cfg) {
    // all math in visual px; converted at the style writes
    const vw = window.innerWidth, vh = window.innerHeight;
    el.style.visibility = 'hidden';
    el.style.left = '0px'; el.style.top = '0px';
    const cw = (el.offsetWidth || cardT.width || 290) * Z; // measured: pill cards auto-size
    const ch = (el.offsetHeight || 110) * Z;
    const anchor = cfg.at ? document.querySelector(cfg.at) : null;
    let x, y;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const side = cfg.side || pickSide(r, vw, vh, cw, ch);
      if (side === 'right') { x = r.right + 18 * Z; y = r.top + r.height / 2 - ch / 2; }
      else if (side === 'left') { x = r.left - cw - 18 * Z; y = r.top + r.height / 2 - ch / 2; }
      else if (side === 'top') { x = r.left + r.width / 2 - cw / 2; y = r.top - ch - 16 * Z; }
      else { x = r.left + r.width / 2 - cw / 2; y = r.bottom + 16 * Z; }
    } else {
      const pos = cfg.position || 'bottom-right';
      x = pos.includes('left') ? 24 * Z : vw - cw - 24 * Z;
      y = pos.includes('top') ? 24 * Z : vh - ch - 24 * Z;
    }
    el.style.left = px(Math.max(14 * Z, Math.min(vw - cw - 14 * Z, x)));
    el.style.top = px(Math.max(14 * Z, Math.min(vh - ch - 14 * Z, y)));
    el.style.visibility = '';
  }
  function pickSide(r, vw, vh, cw, ch) {
    if (r.right + cw + 32 * Z < vw) return 'right';
    if (r.left - cw - 32 * Z > 0) return 'left';
    if (r.bottom + ch + 30 * Z < vh) return 'bottom';
    return 'top';
  }
  function hideCard(id) {
    const el = cards.get(id);
    if (!el) return;
    el.classList.remove('shown');
    setTimeout(() => el.remove(), 450);
    cards.delete(id);
  }

  // ---- spotlight ring ----
  function ringShow(selector, pad = 10, dim = 0) {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`ring target not found: ${selector}`);
    const r = el.getBoundingClientRect();
    ring.style.left = px(r.left - pad);
    ring.style.top = px(r.top - pad);
    ring.style.width = px(r.width + pad * 2);
    ring.style.height = px(r.height + pad * 2);
    ring.style.boxShadow = dim ? `0 0 0 9999px rgba(8,8,16,${dim})` : 'none';
    ring.classList.add('on');
  }
  const ringHide = () => { ring.classList.remove('on'); ring.style.boxShadow = 'none'; };

  // ---- masks (privacy blurs; selectors re-resolved every frame, fail-closed) ----
  const maskSelectors = [];
  const maskBoxes = [];
  function mask(selectors) {
    const missing = [];
    for (const sel of selectors) {
      if (!document.querySelectorAll(sel).length) missing.push(sel);
      else maskSelectors.push(sel);
    }
    if (missing.length) return missing;
    if (maskSelectors.length && !mask._raf) {
      const track = () => {
        // re-query each frame so re-rendered/hydrated targets stay covered
        const els = maskSelectors.flatMap(sel => [...document.querySelectorAll(sel)]);
        while (maskBoxes.length < els.length) {
          const box = document.createElement('div');
          box.className = '__shooter-mask';
          maskHost.appendChild(box);
          maskBoxes.push(box);
        }
        maskBoxes.forEach((box, i) => {
          const el = els[i];
          if (!el) { box.style.display = 'none'; return; }
          const r = el.getBoundingClientRect();
          box.style.left = px(r.left - 2);
          box.style.top = px(r.top - 2);
          box.style.width = px(r.width + 4);
          box.style.height = px(r.height + 4);
          box.style.display = r.width ? '' : 'none';
        });
        mask._raf = requestAnimationFrame(track);
      };
      track();
    }
    return [];
  }

  // ---- page context ----
  // What the recorded app actually looks like. Read once by the recorder and handed
  // to the export-time framing pass so `frame: {background: auto}` can derive a
  // wallpaper from the app's own brand colour and light/dark-ness.
  function pageContext() {
    let bg = [255, 255, 255];
    for (let n = document.body; n; n = n.parentElement) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(n).backgroundColor);
      if (m && (m[4] == null || +m[4] > 0.5)) { bg = [+m[1], +m[2], +m[3]]; break; }
    }
    const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    return { accent: auto || sampleAccent() || accent, bg: `rgb(${bg.join(',')})`, isDark: lum < 0.5 };
  }

  window.__shooter = { camera, showCard, hideCard, ringShow, ringHide, mask, context: pageContext };
})();

<script lang="ts">
  // Landing page (root `/`): the gateway to the two archives. Self-contained —
  // no map, no deck.gl, no data fetch. "Split territory" diptych: violence (red,
  // dark) on the left, forest (green) on the right, with the country's own
  // silhouette as a faint watermark straddling the seam. Each half is one big
  // anchor that expands on hover/focus while the other recedes.
  import { t, ui, toggleLang } from './i18n.svelte';
  import { COLOMBIA_VIEWBOX, COLOMBIA_PATH } from './colombiaOutline';

  // language rides along into the destination so the choice persists
  const lang = $derived(ui.lang);
  const violenceHref = $derived(`?section=violence&lang=${lang}`);
  const forestHref = $derived(`?section=deforestation&lang=${lang}`);

  // Honor the OS reduce-motion pref: skip the cursor bloom writes and the
  // fade-to-black veil (navigation becomes a plain instant jump). CSS-side
  // motion is clamped globally in app.css.
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- cursor-tracked bloom: write --mx/--my (%) on the pointed half so a
  // radial glow floods toward the pointer. rAF-throttled — a fast pointer
  // coalesces to one style write per frame (no layout thrash, just a repaint).
  let rafId = 0;
  let pending: { el: HTMLElement; x: number; y: number } | null = null;
  function flushPointer() {
    rafId = 0;
    if (!pending) return;
    pending.el.style.setProperty('--mx', `${pending.x}%`);
    pending.el.style.setProperty('--my', `${pending.y}%`);
    pending = null;
  }
  function onPointerMove(ev: PointerEvent) {
    if (reduceMotion) return;
    const el = ev.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    pending = {
      el,
      x: ((ev.clientX - r.left) / r.width) * 100,
      y: ((ev.clientY - r.top) / r.height) * 100,
    };
    if (!rafId) rafId = requestAnimationFrame(flushPointer);
  }

  // ---- fade-to-black, then navigate ----
  let leaving = $state(false);
  function goTo(ev: MouseEvent, href: string) {
    // let the browser handle modified / non-primary clicks (open-in-new-tab)
    // and, under reduced motion, do a plain instant navigation
    if (
      reduceMotion ||
      ev.defaultPrevented ||
      ev.button !== 0 ||
      ev.metaKey ||
      ev.ctrlKey ||
      ev.shiftKey ||
      ev.altKey
    )
      return;
    ev.preventDefault();
    leaving = true;
    // navigate once the veil is fully black (matches the .leave-veil transition)
    setTimeout(() => (window.location.href = href), 480);
  }

  // Back-button restores this page from bfcache with the veil still opaque —
  // clear it so the landing isn't stuck black.
  function onPageShow() {
    leaving = false;
  }

  // Ambient motif specks. Deterministic positions (no Math.random — keeps the
  // field stable across renders). Violence: wounds flaring to gold scar. Forest:
  // dark loss opening in the canopy. Each speck's base opacity is its at-rest
  // "scar" look, so when prefers-reduced-motion freezes the pulse the field
  // simply reads as a static stipple rather than vanishing.
  const violenceSpecks = [
    [18, 22, 9], [34, 64, 11], [55, 31, 7], [71, 73, 13], [44, 12, 6],
    [82, 40, 10], [27, 86, 8], [63, 18, 12], [12, 52, 7], [90, 67, 9],
    [49, 49, 14], [76, 8, 6],
  ];
  const forestSpecks = [
    [22, 70, 8], [40, 30, 11], [58, 80, 7], [73, 44, 12], [15, 38, 6],
    [85, 64, 9], [31, 14, 8], [66, 26, 10], [48, 58, 13], [9, 82, 7],
    [79, 88, 6], [54, 9, 9],
  ];
</script>

<svelte:window onpageshow={onPageShow} />

<div class="landing">
  <div class="split">
    <a
      class="half violence"
      href={violenceHref}
      aria-label={`${t('title')} — ${t('subtitle')}`}
      onpointermove={onPointerMove}
      onclick={(ev) => goTo(ev, violenceHref)}
    >
      <div class="field" aria-hidden="true">
        {#each violenceSpecks as [top, left, size], i}
          <span
            class="speck"
            style="top:{top}%; left:{left}%; --s:{size}px; animation-delay:{i * 0.47}s; animation-duration:{4 + (i % 5)}s"
          ></span>
        {/each}
      </div>
      <div class="content">
        <span class="file mono">{t('landing_file')} 01 · 1958–2026</span>
        <h2>{t('title')}</h2>
        <p class="desc">{t('subtitle')}</p>
        <span class="cta mono">{t('landing_enter')} <span class="arrow">→</span></span>
      </div>
    </a>

    <a
      class="half forest"
      href={forestHref}
      aria-label={`${t('def_title')} — ${t('def_subtitle')}`}
      onpointermove={onPointerMove}
      onclick={(ev) => goTo(ev, forestHref)}
    >
      <div class="field" aria-hidden="true">
        {#each forestSpecks as [top, left, size], i}
          <span
            class="speck"
            style="top:{top}%; left:{left}%; --s:{size}px; animation-delay:{i * 0.53}s; animation-duration:{5 + (i % 5)}s"
          ></span>
        {/each}
      </div>
      <div class="content">
        <span class="file mono">{t('landing_file')} 02 · 2001–2025</span>
        <h2>{t('def_title')}</h2>
        <p class="desc">{t('def_subtitle')}</p>
        <span class="cta mono">{t('landing_enter')} <span class="arrow">→</span></span>
      </div>
    </a>
  </div>

  <!-- country silhouette: one faint gold watermark, centered on the viewport
       (not glued to the moving seam) — "one country, split two ways" -->
  <svg class="silhouette" viewBox={COLOMBIA_VIEWBOX} aria-hidden="true" focusable="false">
    <path d={COLOMBIA_PATH} />
  </svg>

  <header class="masthead">
    <span class="eyebrow">{t('landing_eyebrow')}</span>
    <h1>{t('landing_title')}</h1>
    <p class="sub">{t('landing_sub')}</p>
  </header>

  <button class="lang mono" onclick={toggleLang} aria-label="Cambiar idioma / switch language">
    {ui.lang === 'es' ? 'EN' : 'ES'}
  </button>

  <footer class="mono">
    <span class="dim">{t('sources')}:</span> CNMH/SIEVCAC · CEDE · Hansen/UMD · IDEAM · DANE
  </footer>

  <!-- fade-to-black on click: dips the whole viewport before the full-page
       navigation so entering an archive reads as one continuous cut -->
  <div class="leave-veil" class:on={leaving} aria-hidden="true"></div>
</div>

<style>
  .landing {
    position: relative;
    height: 100%;
    overflow: hidden;
    background: var(--ink);
  }

  /* ---------- the two halves ---------- */
  .split {
    display: flex;
    height: 100%;
  }

  .half {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    border: none; /* reset global <a> underline border */
    text-decoration: none;
    color: var(--paper);
    /* grow/shrink eased; killed under reduced-motion below */
    transition: flex-grow 0.55s cubic-bezier(0.2, 0.7, 0.2, 1);
    /* entrance: slide in from the centre seam */
    animation: halfIn 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }

  /* cursor-tracked colour bloom — the "mask" that floods toward the pointer.
     Centered at --mx/--my (set per-frame from JS); at rest it sits centred
     and low; on hover it brightens and swells (the flood). Sits above the base
     gradient, below the specks + content. Moved/swollen via the individual
     `translate`/`scale` transform properties, NOT background-position/-size:
     those repaint the whole half every pointer-move frame, while transforms
     recomposite the once-rasterised gradient on the GPU. Only `scale`
     transitions — position updates stay instant, matching the old feel. */
  .half::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: 0.45;
    translate: calc(var(--mx, 50%) - 50%) calc(var(--my, 50%) - 50%);
    scale: 0.62;
    will-change: translate, scale;
    transition:
      opacity 0.45s ease,
      scale 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .violence::before {
    background-image: radial-gradient(
      circle,
      rgba(232, 64, 58, 0.44) 0%,
      rgba(201, 162, 39, 0.16) 42%,
      transparent 70%
    );
  }
  .forest::before {
    background-image: radial-gradient(
      circle,
      rgba(63, 174, 95, 0.5) 0%,
      rgba(21, 105, 44, 0.18) 45%,
      transparent 72%
    );
  }
  .half:hover::before,
  .half:focus::before {
    opacity: 1;
    scale: 1.55;
  }

  .violence {
    background: radial-gradient(120% 90% at 30% 25%, #1b0f12 0%, #0b0d11 60%);
    animation-delay: 0.05s;
  }

  .forest {
    /* the real forest palette, held a stop darker than jungle-bright so the two
       halves sit at comparable rest luminance (the gold silhouette stays the
       brightest element; hover's bloom is what ignites the green) */
    background: radial-gradient(120% 90% at 70% 25%, #104a20 0%, #0f2e1a 55%, #0a150e 100%);
    border-left: 1px solid rgba(0, 0, 0, 0.55);
    animation-delay: 0.12s;
  }

  /* luminous seam: the forest's left edge is the join between the two archives.
     It rides the flex layout (so it leans toward the smaller half as the other
     expands), brightens whenever either half is engaged, and drifts a faint
     gold shimmer down its length. */
  .forest::after {
    content: '';
    position: absolute;
    top: 0;
    left: -1px;
    width: 2px;
    height: 100%;
    z-index: 3;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(201, 162, 39, 0.12) 18%,
      rgba(201, 162, 39, 0.4) 50%,
      rgba(201, 162, 39, 0.12) 82%,
      transparent 100%
    );
    background-size: 100% 260%;
    opacity: 0.5;
    transition: opacity 0.5s ease;
    animation: seamDrift 9s linear infinite;
  }
  .split:hover .forest::after,
  .split:focus-within .forest::after {
    opacity: 1;
  }
  @keyframes seamDrift {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 0 260%;
    }
  }

  @keyframes halfIn {
    from {
      opacity: 0;
      transform: scale(1.04);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* lean the page toward the half you point at; the other recedes + dims */
  .split:hover .half:not(:hover),
  .split:focus-within .half:not(:focus) {
    flex-grow: 0.72;
  }
  .split:hover .half:not(:hover) .content,
  .split:focus-within .half:not(:focus) .content {
    opacity: 0.55;
  }
  .half:hover .field,
  .half:focus .field {
    opacity: 1;
  }

  /* ---------- ambient motif specks ---------- */
  .field {
    position: absolute;
    inset: 0;
    z-index: 1;
    opacity: 0.8;
    transition: opacity 0.55s ease;
    pointer-events: none;
  }

  .speck {
    position: absolute;
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation-name: pulse-speck;
    animation-iteration-count: infinite;
    animation-timing-function: ease-in-out;
  }

  /* violence: a wound flaring red, cooling to a gold scar */
  .violence .speck {
    background: radial-gradient(
      circle,
      rgba(232, 64, 58, 0.95) 0%,
      rgba(201, 162, 39, 0.35) 55%,
      transparent 72%
    );
    opacity: 0.28;
  }

  /* forest: a patch of canopy opening to dark loss */
  .forest .speck {
    background: radial-gradient(circle, rgba(7, 11, 8, 0.9) 0%, rgba(7, 11, 8, 0.2) 60%, transparent 75%);
    opacity: 0.32;
  }

  @keyframes pulse-speck {
    0%,
    100% {
      opacity: 0.28;
      transform: translate(-50%, -50%) scale(0.85);
    }
    50% {
      opacity: 0.7;
      transform: translate(-50%, -50%) scale(1.9);
    }
  }

  /* ---------- per-half content block ---------- */
  .content {
    position: absolute;
    left: 0;
    bottom: 0;
    z-index: 2;
    /* constant viewport-based width (the rest-state half), anchored to the
       half's OUTER edge: the flex-grow lean then slides the block without ever
       re-wrapping its type (a width that tracked the shrinking half made the
       headline break lines mid-animation). Overflow past the shrunken half is
       clipped on the text-free side. */
    width: 50vw;
    padding: 0 6vw 9vh;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    transition: opacity 0.55s ease;
  }

  .forest .content {
    left: auto;
    right: 0;
    align-items: flex-end;
    text-align: right;
  }

  .file {
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  .violence .file {
    color: var(--accent);
  }
  .forest .file {
    color: #5fb878;
  }

  .content h2 {
    font-family: var(--font-display);
    font-size: clamp(26px, 3.6vw, 52px);
    font-weight: 600;
    line-height: 1.02;
    margin: 2px 0;
    letter-spacing: -0.01em;
  }

  .desc {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(13px, 1.2vw, 16px);
    color: var(--paper-dim);
    margin: 0;
    max-width: 34ch;
    text-wrap: balance;
  }

  .cta {
    margin-top: 12px;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--paper);
    border-bottom: 1px solid currentColor;
    padding-bottom: 3px;
  }
  .arrow {
    display: inline-block;
    transition: transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .half:hover .arrow,
  .half:focus .arrow {
    transform: translateX(6px);
  }
  .violence:hover .cta,
  .violence:focus .cta {
    color: var(--accent);
  }
  .forest:hover .cta,
  .forest:focus .cta {
    color: #5fb878;
  }

  /* ---------- silhouette watermark ---------- */
  .silhouette {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    height: min(86vh, 92vw);
    width: auto;
    pointer-events: none;
    z-index: 2;
    opacity: 0;
    animation: silhouetteIn 1.4s ease 0.35s forwards;
    /* leans a few px toward the half you point at (parallax depth cue) */
    transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .split:has(.violence:hover) ~ .silhouette {
    transform: translate(calc(-50% - 9px), -50%);
  }
  .split:has(.forest:hover) ~ .silhouette {
    transform: translate(calc(-50% + 9px), -50%);
  }
  .silhouette path {
    fill: rgba(201, 162, 39, 0.03);
    stroke: var(--gold);
    stroke-width: 1.2;
    stroke-opacity: 0.4;
    vector-effect: non-scaling-stroke;
  }
  @keyframes silhouetteIn {
    to {
      opacity: 1;
    }
  }

  /* ---------- masthead ---------- */
  .masthead {
    position: absolute;
    top: 8vh;
    left: 0;
    right: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 0 20px;
    pointer-events: none;
    animation: rise 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) 0.25s both;
  }
  .masthead h1 {
    font-family: var(--font-display);
    font-size: clamp(30px, 5vw, 68px);
    font-weight: 600;
    line-height: 1.04;
    margin: 8px 0 6px;
    letter-spacing: -0.015em;
    text-shadow: 0 2px 24px rgba(0, 0, 0, 0.6);
  }
  .masthead .sub {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(13px, 1.4vw, 17px);
    color: var(--paper-dim);
    margin: 0;
    max-width: 46ch;
    /* even line lengths — no single-word orphan under the hero */
    text-wrap: balance;
    text-shadow: 0 1px 14px rgba(0, 0, 0, 0.7);
  }

  /* ---------- ES/EN toggle ---------- */
  .lang {
    position: absolute;
    top: 18px;
    right: 18px;
    z-index: 5;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--paper-dim);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 5px 9px;
    background: rgba(11, 13, 17, 0.5);
    backdrop-filter: blur(4px);
  }
  .lang:hover {
    color: var(--gold);
    border-color: var(--gold);
  }

  /* ---------- footer ---------- */
  footer {
    position: absolute;
    z-index: 3;
    left: 0;
    right: 0;
    bottom: 14px;
    text-align: center;
    font-size: 9px;
    color: var(--paper-faint);
    pointer-events: none;
    text-shadow: 0 1px 10px rgba(0, 0, 0, 0.8);
  }
  footer .dim {
    color: var(--gold);
  }

  /* ---------- fade-to-black veil ---------- */
  .leave-veil {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.48s ease;
  }
  .leave-veil.on {
    opacity: 1;
    pointer-events: auto; /* swallow clicks during the dip */
  }

  /* ---------- small screens: stack the halves ---------- */
  @media (max-width: 760px) {
    .split {
      flex-direction: column;
    }
    .forest {
      border-left: none;
      border-top: 1px solid rgba(0, 0, 0, 0.55);
    }
    /* the seam is a vertical left-edge line — meaningless once stacked */
    .forest::after {
      display: none;
    }
    /* expansion is awkward when stacked — keep them even */
    .split:hover .half:not(:hover),
    .split:focus-within .half:not(:focus) {
      flex-grow: 1;
    }
    .content {
      /* stacked halves are full-width — the desktop fixed 50vw no longer applies */
      width: 100%;
      padding-bottom: 5vh;
      gap: 5px;
    }
    .forest .content {
      left: 0;
      right: auto;
      align-items: flex-start;
      text-align: left;
    }
    .masthead {
      top: 3vh;
      /* keep the eyebrow clear of the ES/EN toggle pinned top-right */
      padding: 0 56px;
    }
    .silhouette {
      height: 60vh;
      opacity: 0.5;
    }
  }

  /* CSS-side reduced-motion is clamped globally in app.css; the JS-driven
     bloom + veil check the same media query in the script above */
</style>

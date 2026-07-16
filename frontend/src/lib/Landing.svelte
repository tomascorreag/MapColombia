<script lang="ts">
  // Landing page (root `/`): the gateway to the two archives. Self-contained —
  // no map, no deck.gl, no data fetch.
  //
  // ONE ink field, not two coloured ones. An earlier build split the page red
  // (violence) vs green (forest), but neither hue came from the archives: the
  // violence view renders crimson->red strands and the deforestation view an
  // amber fire ramp over a dim canopy that exists to be burned. The halves are
  // told apart here by the FORM of their mark — thin crimson strands vs blocky
  // amber pixels, both drawn by landingEffects.ts with colours quoted from the
  // real shaders — over a shared ink ground. Gold belongs to neither side and so
  // carries the shared chrome (silhouette, eyebrow). Colour stays out of the
  // type entirely; the atmosphere carries each side's identity.
  //
  // The effects are masked to each half's OUTER FLANK: they never cross the
  // silhouette, because they contain no data and must not read as a map. See the
  // header of landingEffects.ts.
  import { t, ui, toggleLang } from './i18n.svelte';
  import { COLOMBIA_VIEWBOX, COLOMBIA_PATH } from './colombiaOutline';
  import { createScarField, createEmberField, type AmbientField } from './landingEffects';
  import { smoothstep } from './noise';

  // language rides along into the destination so the choice persists
  const lang = $derived(ui.lang);
  const violenceHref = $derived(`?section=violence&lang=${lang}`);
  const ashesHref = $derived(`?section=deforestation&lang=${lang}`);

  // The OS reduce-motion pref is IGNORED site-wide (owner decision) — the CSS
  // clamp in app.css is commented out and this guard is pinned false, so the rAF
  // loop and the fade-to-black veil always run. To honor the pref again, restore
  // the query here, in App.svelte, and the app.css clamp together.
  // const reduceMotion =
  //   typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduceMotion = false;

  let scarCanvas: HTMLCanvasElement | undefined = $state();
  let emberCanvas: HTMLCanvasElement | undefined = $state();
  // the two <a class="half"> elements — the rAF loop writes --ignite onto them
  let violenceHalf: HTMLElement | undefined = $state();
  let ashesHalf: HTMLElement | undefined = $state();

  // Stacked layout drops the ambient fields entirely. Not a perf concession —
  // a correctness one. Once the halves stack, the silhouette spans nearly the
  // whole width of the middle (60vh, centred) and each half's remaining space is
  // taken by its own type, so there is no placement where a field clears both.
  // A field painted across the country outline would read as deforestation or
  // violence MAPPED ONTO Colombia, which is precisely the claim these synthetic
  // effects must never make (see landingEffects.ts). The silhouette is the
  // page's thesis and stays; the atmosphere is what goes.
  const NARROW = '(max-width: 760px)';
  let narrow = $state(typeof matchMedia === 'function' ? matchMedia(NARROW).matches : false);
  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(NARROW);
    const sync = () => (narrow = mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  // ---- seam extent ----
  // The seam divides the two archives, so it stops short of the masthead and the
  // sources line, which belong to both. Those two boxes are content-sized (the
  // title's height moves with the viewport, the language, and where it wraps —
  // measured, its bottom lands anywhere from 19vh to 29vh), so the stops are
  // measured rather than authored as a fixed inset.
  //
  // offsetTop/offsetHeight, NOT getBoundingClientRect: the masthead runs a `rise`
  // entrance that translates it, and a rect would measure it mid-flight and pin
  // the seam to wherever the animation happened to be. offset* is untransformed
  // layout, so it reads the settled position even on the first frame.
  const SEAM_GAP_PX = 28; // breathing room at each end
  let landingEl: HTMLElement | undefined = $state();
  let mastheadEl: HTMLElement | undefined = $state();
  let footerEl: HTMLElement | undefined = $state();

  $effect(() => {
    const root = landingEl;
    const mast = mastheadEl;
    const foot = footerEl;
    if (!root || !mast || !foot) return;
    const sync = () => {
      const top = mast.offsetTop + mast.offsetHeight + SEAM_GAP_PX;
      const bottom = root.offsetHeight - foot.offsetTop + SEAM_GAP_PX;
      root.style.setProperty('--seam-top', `${Math.round(top)}px`);
      root.style.setProperty('--seam-bottom', `${Math.round(bottom)}px`);
    };
    sync();
    // the masthead reflows on language toggle and on any resize of the title
    const ro = new ResizeObserver(sync);
    ro.observe(root);
    ro.observe(mast);
    ro.observe(foot);
    return () => ro.disconnect();
  });

  // Cursor-proximity "ignite", per half (0 = rest, 1 = fully lit). Plain
  // (non-reactive) arrays: they are read by the rAF loop and fed to canvas maths,
  // never rendered, so making them $state would just schedule pointless
  // re-renders. Eased in the loop rather than by a CSS transition for the same
  // reason — the value drives a shader-ish computation, not a style.
  const igniteTarget = [0, 0];
  const igniteNow = [0, 0];
  const igniteVar = ['', '']; // last --ignite string written per half, to skip no-op writes

  // Each field's ignite anchor, as a fraction of its half. NOT the canvas centre:
  // the canvas fills the half, but the radial mask in the stylesheet below only
  // reveals an ellipse on the OUTER FLANK, so the canvas centre is a spot where
  // nothing is painted — anchoring there would peak the glow over blank ink.
  // These must track the `mask-image` ellipses in `.violence .fx` / `.ashes .fx`.
  const FIELD_ANCHOR: [number, number][] = [
    [0.07, 0.3],
    [0.93, 0.3],
  ];
  // Distance (as a fraction of the gap between the two anchors) inside which a
  // field is fully lit. The gap is measured at runtime rather than hardcoded, so
  // the response scales with the viewport instead of with a magic pixel count.
  const NEAR_FRAC = 0.05;
  // >1 concentrates the response near the field: crossing the page barely stirs
  // the far half, and the last stretch toward a flank is where it slams on. This
  // is the "drastic as you get closer" curve — linear falloff felt like a dimmer.
  const PROX_GAMMA = 2;

  const anchorX = [0, 0];
  const anchorY = [0, 0];
  let anchorSpan = 1;
  let fieldsLive = false; // no anchors until the first fit(); also false when narrow

  // Keyboard focus has no coordinates, so it pins ignite to full rather than
  // going through the proximity curve — a tab-through must light the half it
  // lands on. Pointer proximity can only ever raise it from there, never dim it.
  const focused = [false, false];

  function proximity(i: number, cx: number, cy: number) {
    const d = Math.hypot(cx - anchorX[i], cy - anchorY[i]) / anchorSpan;
    return Math.pow(1 - smoothstep(NEAR_FRAC, 1, d), PROX_GAMMA);
  }

  function retarget(cx: number, cy: number) {
    for (let i = 0; i < igniteTarget.length; i++) {
      igniteTarget[i] = Math.max(focused[i] ? 1 : 0, proximity(i, cx, cy));
    }
  }

  function onPointerMove(ev: PointerEvent) {
    if (!fieldsLive) return;
    retarget(ev.clientX, ev.clientY);
  }

  // The pointer leaving the window fires no further moves, so without this the
  // fields would stay frozen at whatever the last in-window position lit.
  function onPointerLeaveWindow() {
    for (let i = 0; i < igniteTarget.length; i++) igniteTarget[i] = focused[i] ? 1 : 0;
  }

  function setFocus(i: number, on: boolean) {
    focused[i] = on;
    if (on) igniteTarget[i] = 1;
    else igniteTarget[i] = 0; // next pointermove re-applies proximity
  }

  $effect(() => {
    if (!scarCanvas || !emberCanvas) return;
    const canvases = [scarCanvas, emberCanvas];
    const halves = [violenceHalf, ashesHalf];
    const fields: AmbientField[] = [
      createScarField(scarCanvas, 'left'),
      createEmberField(emberCanvas, 'right'),
    ];

    // Anchors are cached here rather than measured per pointermove: a
    // getBoundingClientRect() on every move would force layout on the hot path.
    // The ResizeObserver below re-runs fit(), which is what keeps them honest.
    const fit = () => {
      for (let i = 0; i < fields.length; i++) {
        const r = canvases[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          fields[i].resize(r.width, r.height);
          anchorX[i] = r.left + FIELD_ANCHOR[i][0] * r.width;
          anchorY[i] = r.top + FIELD_ANCHOR[i][1] * r.height;
        }
      }
      anchorSpan = Math.max(1, Math.hypot(anchorX[1] - anchorX[0], anchorY[1] - anchorY[0]));
      fieldsLive = true;
    };
    // dt = 0, ignite = 0 renders the settled frame: scars fully accumulated and
    // cold, embers scattered mid-cool, nothing flaring.
    const settle = () => fields.forEach((f) => f.render(0, 0));

    fit();
    settle();

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; // clamp: a tab-switch must not jump the sim
      last = now;
      for (let i = 0; i < fields.length; i++) {
        // follow filter, not an animation: the target already moves continuously
        // with the cursor, so this only takes the stair-steps off pointer events
        igniteNow[i] += (igniteTarget[i] - igniteNow[i]) * Math.min(1, dt * 6);
        fields[i].render(dt, igniteNow[i]);
        // Publish the SAME eased value the field just rendered, so the type and
        // the atmosphere move as one thing. A CSS transition on :hover instead
        // would run on its own clock and drift out of step, and would be back to
        // a binary hover — this follows the cursor's distance like everything else.
        // Quantised and diffed: igniteNow approaches its target asymptotically and
        // never quite lands, so writing it raw would invalidate style every frame
        // forever, on a page that is otherwise idle once the cursor stops.
        const v = igniteNow[i].toFixed(3);
        if (v !== igniteVar[i]) {
          igniteVar[i] = v;
          halves[i]?.style.setProperty('--ignite', v);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // don't burn a core animating an invisible tab
    const onVis = () => (document.hidden ? stop() : start());
    if (!reduceMotion) {
      start();
      document.addEventListener('visibilitychange', onVis);
    }

    let rzT: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(rzT);
      // resize rebuilds geometry and re-rasterises the scar layer — debounce it
      rzT = setTimeout(() => {
        fit();
        if (reduceMotion) settle();
      }, 150);
    });
    canvases.forEach((c) => ro.observe(c));

    return () => {
      stop();
      clearTimeout(rzT);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      fields.forEach((f) => f.destroy());
      fieldsLive = false; // anchors are stale the moment the canvases go
    };
  });

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
</script>

<!-- Proximity is tracked on the WINDOW, not on .split: the masthead, silhouette
     and footer are siblings that overlay the halves, so a pointermove over any of
     them never bubbles through .split and the fields would stall wherever the
     cursor last crossed a half. The cursor's relationship to each archive is a
     page-level fact, so it is listened for at page level. -->
<svelte:window onpageshow={onPageShow} onpointermove={onPointerMove} />
<svelte:body onpointerleave={onPointerLeaveWindow} />

<div class="landing" bind:this={landingEl}>
  <div class="split">
    <a
      class="half violence"
      bind:this={violenceHalf}
      href={violenceHref}
      aria-label={`${t('title')} — ${t('subtitle')}`}
      onfocus={() => setFocus(0, true)}
      onblur={() => setFocus(0, false)}
      onclick={(ev) => goTo(ev, violenceHref)}
    >
      {#if !narrow}
        <canvas class="fx" bind:this={scarCanvas} aria-hidden="true"></canvas>
      {/if}
      <div class="content">
        <span class="file mono">{t('landing_file')} 01 · 1958–2026</span>
        <h2>{t('title')}</h2>
        <p class="desc">{t('subtitle')}</p>
        <span class="cta mono">{t('landing_enter')} <span class="arrow">→</span></span>
      </div>
    </a>

    <a
      class="half ashes"
      bind:this={ashesHalf}
      href={ashesHref}
      aria-label={`${t('def_title')} — ${t('def_subtitle')}`}
      onfocus={() => setFocus(1, true)}
      onblur={() => setFocus(1, false)}
      onclick={(ev) => goTo(ev, ashesHref)}
    >
      {#if !narrow}
        <canvas class="fx" bind:this={emberCanvas} aria-hidden="true"></canvas>
      {/if}
      <div class="content">
        <span class="file mono">{t('landing_file')} 02 · 2001–2025</span>
        <h2>{t('def_title')}</h2>
        <p class="desc">{t('def_subtitle')}</p>
        <span class="cta mono">{t('landing_enter')} <span class="arrow">→</span></span>
      </div>
    </a>
  </div>

  <!-- Sits between .split and the silhouette so the stacking is what it was when
       this was .ashes' border-left: above the halves, under the country. -->
  <div class="seam" aria-hidden="true"></div>

  <!-- country silhouette: one faint gold watermark, centered on the viewport.
       "One country, split two ways" — and the only element either archive's
       atmosphere is forbidden to touch. -->
  <svg class="silhouette" viewBox={COLOMBIA_VIEWBOX} aria-hidden="true" focusable="false">
    <path d={COLOMBIA_PATH} />
  </svg>

  <header class="masthead" bind:this={mastheadEl}>
    <span class="eyebrow">{t('landing_eyebrow')}</span>
    <h1>{t('landing_title')}</h1>
    <p class="sub">{t('landing_sub')}</p>
  </header>

  <button class="lang mono" onclick={toggleLang} aria-label="Cambiar idioma / switch language">
    {ui.lang === 'es' ? 'EN' : 'ES'}
  </button>

  <footer class="mono" bind:this={footerEl}>
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

  /* One shared ground. No per-half gradient, no cursor bloom: the ambient field
     is the only thing that distinguishes the halves, and it is the real thing. */
  .half {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    background: var(--ink);
    border: none; /* reset global <a> underline border */
    text-decoration: none;
    color: var(--paper);
    /* entrance: the field settles in first, then the country, then the words */
    animation: halfIn 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .violence {
    animation-delay: 0s;
  }
  .ashes {
    /* the seam used to live here as a border-left, which tied it to the half's
       full height — see .seam below, which is the same hairline freed from that */
    animation-delay: 0.06s;
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

  /* ---------- ambient field ---------- */
  /* Masked to the OUTER FLANK: clear of the silhouette (the effects carry no
     data — they must never read as geography) and clear of the type below. */
  .fx {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* Geometry is load-bearing, not taste: this ellipse is the OUTER BOUND of each
     field — how far it can ever spread, at full ignite, once landingEffects.ts's
     own reach has opened all the way. Its falloff has to land clear enough of the
     masthead (which spans the middle ~55% of the viewport) and of the content
     block pinned to each half's bottom that neither loses contrast. It was 56% 54%
     — tuned until the rim JUST grazed the title — and is now opened to 70% 62% so
     the fields reach further across the flank on hover. That is deliberately into
     the title's left edge and the content's top, but only with the gradient's
     faint outer rim (it is already fading from 30% and gone by 74%), and only on
     the half being approached. Push it much past this and the type starts to go.

     MASK_RX/MASK_RY/MASK_CX/MASK_CY in landingEffects.ts MIRROR these four numbers
     so the canvas-side reach is concentric with this mask. Change one, change both
     — they are one geometry expressed in two places. */
  .violence .fx {
    -webkit-mask-image: radial-gradient(
      ellipse 70% 62% at 7% 30%,
      #000 0%,
      #000 30%,
      transparent 74%
    );
    mask-image: radial-gradient(ellipse 70% 62% at 7% 30%, #000 0%, #000 30%, transparent 74%);
  }
  .ashes .fx {
    -webkit-mask-image: radial-gradient(
      ellipse 70% 62% at 93% 30%,
      #000 0%,
      #000 30%,
      transparent 74%
    );
    mask-image: radial-gradient(ellipse 70% 62% at 93% 30%, #000 0%, #000 30%, transparent 74%);
  }

  /* The seam: the join between the two archives, and the only division on the
     page. A static hairline, in the design system's own rule vocabulary.

     It divides the two ARCHIVES, so it runs only as far as they do. The title
     speaks for the whole country and the sources line credits both halves —
     neither is split by it, and a rule drawn through centred type looked like it
     was striking the words out rather than separating the fields.

     The stops are measured, not authored: the masthead's bottom edge lands
     anywhere from 19vh to 29vh depending on viewport and how the title wraps, so
     any fixed inset is either tight at one size or leaves a hole at another. The
     script sets --seam-top/--seam-bottom from the real boxes; the fallbacks here
     are only for the frame before that runs. */
  .seam {
    position: absolute;
    left: 50%;
    top: var(--seam-top, 30vh);
    bottom: var(--seam-bottom, 8vh);
    width: 1px;
    background: var(--hairline);
    pointer-events: none;
  }

  /* ---------- per-half content block ---------- */
  .content {
    position: absolute;
    left: 0;
    bottom: 0;
    z-index: 2;
    /* constant viewport-based width, anchored to the half's OUTER edge, so the
       headline never re-wraps as the viewport changes */
    width: 50vw;
    padding: 0 6vw 9vh;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    /* Grows with the field, off the SAME eased --ignite the canvas renders (the
       rAF loop writes it; see Landing's script). Not a :hover transition — that
       would run on its own clock and drift out of step with the atmosphere, and
       would snap binary instead of tracking the cursor's distance.
       Deliberately small: the fields are the drama, and type that lunges at the
       reader reads as a banner ad. Anchored to the half's OUTER bottom corner so
       the block swells inward from the corner it is pinned to, rather than
       drifting off the edge or shoving itself under the silhouette. */
    transform: scale(calc(1 + var(--ignite, 0) * 0.035));
    transform-origin: left bottom;
  }

  .ashes .content {
    left: auto;
    right: 0;
    align-items: flex-end;
    text-align: right;
    transform-origin: right bottom;
  }

  /* Colour has left the type. Both file labels are neutral paper — each side's
     identity is carried by its atmosphere, not by a tinted label. */
  .file {
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--paper-faint);
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
    transition: color 0.4s ease;
  }
  .arrow {
    display: inline-block;
    transition: transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .half:hover .arrow,
  .half:focus .arrow {
    transform: translateX(6px);
  }
  /* the only colour in the type, and only on engagement: each side's own flare
     (TendrilExtension.ts) / ember (LossRasterLayer.ts ramp) */
  .violence:hover .cta,
  .violence:focus .cta {
    color: #ff3a1c;
  }
  .ashes:hover .cta,
  .ashes:focus .cta {
    color: #ff8a1f;
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
    animation: silhouetteIn 1.4s ease 0.3s forwards;
  }
  .silhouette path {
    fill: rgba(201, 162, 39, 0.03);
    stroke: var(--gold);
    stroke-width: 1.2;
    stroke-opacity: 0.4;
    vector-effect: non-scaling-stroke;
  }
  /* resolves against --sil-o so the mobile dim below actually lands: an
     `animation-fill-mode: forwards` end state outranks a plain `opacity`
     declaration, so the old media-query override never applied */
  @keyframes silhouetteIn {
    to {
      opacity: var(--sil-o, 1);
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
    animation: rise 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) 0.45s both;
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
    .ashes {
      /* stacked, the join between the archives is horizontal */
      border-top: 1px solid var(--hairline);
    }
    .seam {
      /* the vertical seam has nothing to divide once the halves stack */
      display: none;
    }
    /* the ambient fields are not rendered at all here — see the `narrow` guard
       in the script: stacked, no field placement clears the silhouette */
    .content {
      /* stacked halves are full-width — the desktop fixed 50vw no longer applies */
      width: 100%;
      padding-bottom: 5vh;
      gap: 5px;
    }
    .ashes .content {
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
      --sil-o: 0.5;
    }
  }

  /* The reduce-motion pref is ignored site-wide: the CSS clamp in app.css is
     commented out and the JS guard in the script above is pinned false. */
</style>

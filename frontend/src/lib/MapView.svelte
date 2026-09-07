<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
  import { TileLayer } from '@deck.gl/geo-layers';
  import { DataFilterExtension, MaskExtension } from '@deck.gl/extensions';
  import type { PickingInfo, Layer } from '@deck.gl/core';
  import { TendrilLayer } from './TendrilLayer';
  import { RangedScatterplotLayer, type InstanceRange } from './rangeDraw';
  import { LossRasterLayer, SPOT_DIM, rampStopToVec4, type LossLive } from './LossRasterLayer';
  import { buildMuniPick, pickMuni } from './muniPick';
  import { ForestLayer, hexToVec4 } from './ForestLayer';
  import { lowerBound, upperBound } from './tendrils';
  import type { TendrilField, TendrilGeoParams, TendrilSource } from './tendrils';
  import type { TendrilJob, TendrilResult } from './tendrils.worker';
  import { buildPickIndex, forEachInBox, BIG_RV } from './pickIndex';
  import type {
    ViolenceData,
    ElectionsData,
    Munis,
    MuniShapes,
    Election,
    DeforestationData,
  } from './data';
  import { formatDay, formatInt } from './data';
  import { MODALITY_COLORS, hexToRgb } from './colors';
  import { COLOR_BUCKET_DAYS, yearProgress } from './memoria';
  import { app, type Hover } from './state.svelte';
  import { dbg } from './debug.svelte';
  import { defDbg, defRamp } from './defDebug.svelte';
  import { forestDbg, forestColors } from './forestDebug.svelte';
  import { perf, PERF, startFpsGovernor } from './perf.svelte';
  import { t, ui, modalityName } from './i18n.svelte';
  import { muniLabel as fmtMuniLabel, responsible, abParticipants, abInitiative } from './eventFormat';

  // Each section loads only its own archive: the violence page passes
  // `violence`, the deforestation page passes `deforestation` (App.svelte).
  // `elections` is never fetched today (no reachable elections tab) and stays
  // optional so the dormant layer code can be revived without a rewrite.
  let {
    violence = null,
    elections = null,
    munis,
    shapes,
    deforestation = null,
    stacked = false,
    chrome = null,
  }: {
    violence?: ViolenceData | null;
    elections?: ElectionsData | null;
    munis: Munis;
    shapes: MuniShapes;
    deforestation?: DeforestationData | null;
    /** stacked (<=900px) layout — the chrome spans the full width top and bottom */
    stacked?: boolean;
    /** measured chrome insets (px from the top / bottom edge) on stacked layouts */
    chrome?: { top: number; bottom: number } | null;
  } = $props();

  // Dev/MVP basemap: CARTO dark matter (attribution required). The production
  // plan (docs/stack-decision.md) is self-hosted PMTiles on R2.
  const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  let container: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let overlay: MapboxOverlay | null = null;
  let mapReady = $state(false);

  // Device-tier caps (docs in perf.svelte.ts): the dbg knobs stay the look's
  // source of truth, the tier mins/caps them so weak GPUs render a sparser,
  // lower-resolution version of the same scene. `P` changes at most twice per
  // session (governor demotions), each a one-time tendril-field rebuild.
  const P = $derived(PERF[perf.tier]);
  const dprCap = $derived(
    Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, P.dprCap)
  );

  // Last cursor position over the map canvas (deck pick coords), or null when
  // the pointer is off the map. Plain (non-reactive) let: read on demand to
  // re-pick the memoria tooltip as time advances during playback — deck's
  // onHover only fires on pointer movement, so a stationary cursor never
  // re-triggers it (see the re-pick effect at the bottom of the script).
  let lastPointer: { x: number; y: number } | null = null;

  // One extension instance shared by all violence layers (deck dedupes shaders).
  const yearFilter = new DataFilterExtension({ filterSize: 1 });
  // Hoisted like yearFilter: fresh extension instances per frame would
  // register as shader changes and rebuild pipelines every animation tick.
  const memoriaMask = new MaskExtension();

  // Hoisted: a fresh parameters object per frame would register as a pipeline
  // change in luma.gl every animation tick.
  const ADDITIVE_BLEND = {
    blendColorOperation: 'add',
    blendColorSrcFactor: 'src-alpha',
    blendColorDstFactor: 'one',
    blendAlphaSrcFactor: 'one',
    blendAlphaDstFactor: 'one',
  } as const;

  // Per-modality binary data objects built ONCE and reused across effect runs.
  // deck.gl compares `props.data` by identity: a fresh object (or subarray) per
  // tick would invalidate and re-upload every GPU attribute on each scrub —
  // exactly what the filterRange design exists to avoid (docs/stack-decision.md).
  // Every event renders as a red wound/scar; the GPU filter value is the wound
  // day (exact date; -1 never flares) or, for scars, the year-close scar day.
  const woundDataByMod = $derived(
    (violence?.meta.modalities ?? []).map((m) => ({
      length: m.n,
      attributes: {
        getPosition: { value: violence!.pos.subarray(m.start * 2, m.end * 2), size: 2 },
        getRadius: { value: violence!.radius.subarray(m.start, m.end), size: 1 },
        getFilterValue: { value: violence!.dayF32.subarray(m.start, m.end), size: 1 },
      },
    }))
  );
  const scarDataByMod = $derived(
    (violence?.meta.modalities ?? []).map((m) => ({
      length: m.n,
      attributes: {
        getPosition: { value: violence!.pos.subarray(m.start * 2, m.end * 2), size: 2 },
        getRadius: { value: violence!.radius.subarray(m.start, m.end), size: 1 },
        getFilterValue: { value: violence!.scarDayF32.subarray(m.start, m.end), size: 1 },
      },
    }))
  );

  // One SHARED tendril field across every event type (plus a finer second field
  // for visual richness), seeded ∝ victims. Built at load and rebuilt only when
  // the debug panel commits a geometry param (slider release — see DebugPanel)
  // or the governor demotes the tier. Toggling a modality is a uniform update
  // (enabledMask), never a rebuild.
  //
  // Built OFF the main thread (tendrils.worker.ts, one Worker per field so the
  // two build in parallel): a full-tier field is ~0.5–1 s of CPU, which used to
  // freeze the page at load and on every rebuild. Until a field arrives its
  // layers are simply not emitted — the dots show first, the strands a beat
  // later. A newer job supersedes an older one (stale results are dropped), so
  // rapid debug-panel commits never paint out of order.
  const tendrilSrc = $derived<TendrilSource | null>(
    violence
      ? {
          n: violence.meta.n,
          pos: violence.pos,
          victims: violence.victims,
          dayF32: violence.dayF32,
          scarDayF32: violence.scarDayF32,
          modOf: violence.modOf,
        }
      : null
  );

  function createFieldBuilder() {
    let worker: Worker | null = null;
    let nextId = 0;
    let latest = 0;
    let field: TendrilField | null = $state(null);
    const onResult = (e: MessageEvent<TendrilResult>) => {
      const r = e.data;
      if (r.id !== latest) return; // superseded while it was building
      field = { nCurves: r.nCurves, vertexCount: r.vertexCount, bytes: r.bytes, appearDay: r.appearDay };
    };
    return {
      get field() {
        return field;
      },
      build(src: TendrilSource, params: TendrilGeoParams) {
        if (!worker) {
          worker = new Worker(new URL('./tendrils.worker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = onResult;
        }
        latest = ++nextId;
        worker.postMessage({ id: latest, src, params } satisfies TendrilJob);
      },
      destroy() {
        worker?.terminate();
        worker = null;
      },
    };
  }
  const fieldA = createFieldBuilder();
  const fieldB = createFieldBuilder();
  // No fields without the violence archive (the deforestation page never
  // draws them — building two ~1 s Worker jobs there only competed with tile
  // decode on the opening beat).
  $effect(() => {
    if (!tendrilSrc) return;
    fieldA.build(tendrilSrc, {
      seed: 0x1958,
      nCurves: Math.min(dbg.nCurves, P.curves1),
      stepKm: dbg.stepKm,
      reachKm: dbg.reachKm,
      noiseLen1: dbg.noiseLen1,
      noiseLen2: dbg.noiseLen2,
      noiseAmp1: dbg.noiseAmp1,
      noiseAmp2: dbg.noiseAmp2,
    });
  });
  $effect(() => {
    if (!tendrilSrc) return;
    fieldB.build(tendrilSrc, {
      seed: 0x77aa,
      nCurves: Math.min(dbg.t2Curves, P.curves2),
      stepKm: dbg.t2StepKm,
      reachKm: dbg.reachKm,
      noiseLen1: dbg.t2NoiseLen1,
      noiseLen2: dbg.t2NoiseLen2,
      noiseAmp1: dbg.t2NoiseAmp1,
      noiseAmp2: dbg.t2NoiseAmp2,
    });
  });
  onDestroy(() => {
    fieldA.destroy();
    fieldB.destroy();
  });
  // Live shader knobs (one uniform-block update per frame, no attribute work)
  const tendrilParams = $derived({
    fadeDays: dbg.fadeDays,
    reachKm: dbg.reachKm,
    pulseSpeedKmPerDay: dbg.pulseSpeed,
    pulseWidthKm: dbg.pulseWidth,
    widthBoost: dbg.widthBoost,
    widthFalloff: dbg.widthFalloff,
    scarWidth: dbg.scarWidth,
    scarAlpha: dbg.scarAlpha,
    freshAlpha: dbg.freshAlpha,
    pulseStrength: dbg.pulseStrength,
  });

  // Coarse sim-time bucket (~15 sim-days) used to throttle the hover-
  // suppression effect during playback — per-frame effect runs would be
  // wasted work while the wound uniforms animate smoothly.
  const colorBucket = $derived(Math.floor(app.mday / COLOR_BUCKET_DAYS));

  const muniLabel = (idx: number) => fmtMuniLabel(munis, idx);

  // Single-event detail card, built from a global event index so it can be
  // produced from a fresh re-pick (during playback) as well as a live hover.
  function violenceCard(gi: number, x: number, y: number): Hover {
    if (!violence) throw new Error('violenceCard without the violence archive');
    const m = violence.meta.modalities[violence.modOf[gi]];
    const exactDate = formatDay(violence.day[gi], ui.lang);
    const rows = [
      {
        label: t('date'),
        value: exactDate ?? `${violence.year[gi]} (${t('date_unknown_day')})`,
      },
      { label: t('municipality'), value: muniLabel(violence.muni[gi]) },
      { label: t('victims'), value: formatInt(violence.victims[gi], ui.lang) },
    ];
    if (m.code === 'AB') {
      // combat: show the participants + initiative, never a single "responsible"
      const parts = abParticipants(violence, gi);
      if (parts.length) rows.push({ label: t('participants'), value: parts.join(' · ') });
      const init = abInitiative(violence, gi, ui.lang);
      if (init) rows.push({ label: t('initiative'), value: init });
    } else {
      rows.push({ label: t('responsible'), value: responsible(violence, gi) });
    }
    rows.push({ label: t('record'), value: `N.º ${violence.id[gi]}` });
    return { x, y, accent: MODALITY_COLORS[m.code], title: modalityName(m.code), rows };
  }

  // ---- memoria picking: CPU, not GPU ----
  // The wound/scar dot layers are NOT deck-pickable. deck's picking renders the
  // pickable layers into an FBO and reads pixels back SYNCHRONOUSLY — once per
  // pointer move, and `pickMultipleObjects` repeats it per depth level — which
  // drains the GPU queue each time. Measured: with the cursor parked over the
  // map during peak-year playback the frame rate halved even on a desktop GPU
  // (the per-bucket re-pick below hit up to 12 read-backs each), and dense
  // years hit the depth limit while sparse years exited early — exactly the
  // "peak years stutter" symptom. The dataset is small enough to do the same
  // query on the CPU: every event's screen circle is known (position, the
  // scar/core radius rules below mirror the layers' props), so "what is under
  // the cursor" is a bounding-box scan of 341k positions (<1 ms) plus a few
  // exact distance tests. No GPU sync at all, no depth cap (the "+N more"
  // count is now exact), same ordering as before.
  const PICK_RADIUS_PX = 6; // same as the old deck pick radius
  // grid + heavy-event list, built once per dataset (see pickIndex.ts)
  const pickIndex = $derived(
    violence ? buildPickIndex(violence.pos, violence.radius, violence.meta.n) : null
  );

  // Gather every visible event whose scar/core sprite overlaps the pick radius
  // at a screen position, as global indices sorted newest-first — the most
  // recent events sit nearest the timeline position the user is looking at.
  // Within a year, day = -1 (exact day unknown) sorts after dated events.
  // Shared by the hover card and the click handler, so both surfaces list
  // events in the same order.
  function gatherEventsAt(x: number, y: number): number[] {
    if (!map || !violence || !pickIndex) return [];
    const T = app.mday;
    const fade = dbg.fadeDays;
    // meters per CSS px at the view's centre latitude — what deck's
    // radiusUnits:'meters' uses (one scale per viewport, not per point)
    const zoom = map.getZoom();
    const mpp =
      (40075016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    const scarMin = 1.6;
    const scarMax = 14;
    const coreMin = 2.2;
    const coreMax = dbg.coreMaxPx;
    const coreK = dbg.coreScale / mpp; // px per unit of radius[] (sqrt victims)
    const scarK = dbg.scarScale / mpp;
    const enabledByMod = violence.meta.modalities.map((m) => app.enabled[m.code]);
    const { pos, scarDayF32, dayF32, radius, modOf } = violence;
    // Screen offsets without map.project (allocates, ~1 us; thousands of
    // candidates sit near the cursor at national zoom): Web-Mercator maths
    // relative to the cursor's unprojected point. Assumes bearing 0 (rotation
    // is disabled on this map). Linearised dy for the cheap reject (1 px slack
    // over the search window), exact for survivors.
    const c0 = map.unproject([x, y]);
    const worldPx = 512 * 2 ** zoom; // px per 360 deg lon / 2*pi merc units
    const pxPerDegLon = worldPx / 360;
    const pxPerMerc = worldPx / (2 * Math.PI);
    const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const lon0 = c0.lng;
    const lat0 = c0.lat;
    const merc0 = merc(lat0);
    const pxPerDegLat = (pxPerMerc * (Math.PI / 180)) / Math.cos((lat0 * Math.PI) / 180);
    const hits: number[] = [];
    const test = (gi: number) => {
      const lon = pos[gi * 2];
      const lat = pos[gi * 2 + 1];
      const rv = radius[gi];
      // cheap reject: even the biggest sprite this event could draw misses
      const ax = (lon - lon0) * pxPerDegLon;
      const ay = (lat0 - lat) * pxPerDegLat;
      const a2 = ax * ax + ay * ay;
      const rMax = Math.min(coreMax, Math.max(coreMin, coreK * rv)) + PICK_RADIUS_PX + 1;
      if (a2 > rMax * rMax) return;
      if (!enabledByMod[modOf[gi]]) return;
      // visibility mirrors the layers' filterRange: scar once its scar day has
      // passed; core while the wound is fresh (hard zero pre-event)
      const scarOn = scarDayF32[gi] <= T;
      const d = dayF32[gi];
      const coreOn = d >= 0 && d <= T && d > T - fade;
      if (!scarOn && !coreOn) return;
      // sprite radius in CSS px, per the layers' radiusScale / min / max
      let r = 0;
      if (scarOn) r = Math.min(scarMax, Math.max(scarMin, scarK * rv));
      if (coreOn) r = Math.max(r, Math.min(coreMax, Math.max(coreMin, coreK * rv)));
      const dy = (merc0 - merc(lat)) * pxPerMerc;
      if (ax * ax + dy * dy <= (r + PICK_RADIUS_PX) * (r + PICK_RADIUS_PX)) hits.push(gi);
    };
    // search box in degrees for a given pad in px (pad covers the largest
    // sprite of the events that path can contain, + pick radius + slack)
    const boxFor = (padPx: number) => {
      const nw = map!.unproject([x - padPx, y - padPx]);
      const se = map!.unproject([x + padPx, y + padPx]);
      return [Math.min(nw.lng, se.lng), Math.max(nw.lng, se.lng), Math.min(nw.lat, se.lat), Math.max(nw.lat, se.lat)] as const;
    };
    // grid path: ordinary events, whose sprite is at most coreK*BIG_RV px
    const smallPad = Math.min(coreMax, Math.max(coreMin, coreK * BIG_RV)) + PICK_RADIUS_PX + 1;
    const [sLonMin, sLonMax, sLatMin, sLatMax] = boxFor(smallPad);
    forEachInBox(pickIndex, sLonMin, sLonMax, sLatMin, sLatMax, test);
    // heavy events: a short list, scanned in full with the big pad
    const bigPad = Math.max(scarMax, coreMax) + PICK_RADIUS_PX + 1;
    const [bLonMin, bLonMax, bLatMin, bLatMax] = boxFor(bigPad);
    const { big } = pickIndex;
    for (let k = 0; k < big.length; k++) {
      const gi = big[k];
      const lon = pos[gi * 2];
      if (lon < bLonMin || lon > bLonMax) continue;
      const lat = pos[gi * 2 + 1];
      if (lat < bLatMin || lat > bLatMax) continue;
      test(gi);
    }
    // (typed arrays hoisted out of the comparator: `violence` is a reactive
    // proxy and per-compare property reads through it dominated the pick)
    const { year, day } = violence;
    return hits.sort((a, b) => year[b] - year[a] || day[b] - day[a]);
  }

  function memoriaPickAt(x: number, y: number) {
    const idxs = gatherEventsAt(x, y);
    if (idxs.length === 0 || !violence) {
      app.hover = null;
      return;
    }
    if (idxs.length === 1) {
      app.hover = violenceCard(idxs[0], x, y); // single event: full detail card
      return;
    }
    const v = violence;
    const MAX_ROWS = 6;
    const rows = idxs.slice(0, MAX_ROWS).map((gi) => ({
      label: formatDay(v.day[gi], ui.lang) ?? String(v.year[gi]),
      value: `${modalityName(v.meta.modalities[v.modOf[gi]].code)} · ${muniLabel(v.muni[gi])} · ${formatInt(v.victims[gi], ui.lang)} ${t('victims').toLowerCase()}`,
    }));
    if (idxs.length > MAX_ROWS) {
      rows.push({
        label: '…',
        value: `+${formatInt(idxs.length - MAX_ROWS, ui.lang)} ${t('n_more')}`,
      });
    }
    app.hover = {
      x,
      y,
      accent: 'rgb(255, 47, 64)',
      title: `${formatInt(idxs.length, ui.lang)} ${ui.lang === 'es' ? 'casos' : 'cases'}`,
      rows,
    };
  }

  // click: pin every event under the click in the detail panel (newest first,
  // capped by the tier's clickDepth so the panel stays bounded)
  function memoriaClickAt(x: number, y: number) {
    const idxs = gatherEventsAt(x, y).slice(0, P.clickDepth);
    if (idxs.length === 0) return;
    app.hover = null;
    app.selected = idxs;
    app.selectedDay = app.mday; // snapshot for the panel's "hasta {month}" header
  }

  interface ElectionPoint {
    position: [number, number];
    color: [number, number, number];
    radius: number;
    muniIdx: number;
    party: string;
    candidate: string | null;
    w: number;
    t: number;
  }

  // Memoized per election rec: deck.gl compares props.data by identity, and
  // buildLayers now runs per animation frame on the memoria tab — a fresh
  // array here would force a full attribute regen every frame.
  const electionPointsCache = new WeakMap<Election, ElectionPoint[]>();

  function electionPoints(e: Election): ElectionPoint[] {
    const hit = electionPointsCache.get(e);
    if (hit) return hit;
    const pts = e.m.map((mi, i) => {
      const party = elections!.parties[e.p[i]];
      return {
        position: [munis.lon[mi], munis.lat[mi]] as [number, number],
        color: hexToRgb(party.color),
        radius: Math.sqrt(e.t[i]),
        muniIdx: mi,
        party: party.name,
        candidate: e.candidates && e.c ? e.candidates[e.c[i]] : null,
        w: e.w[i],
        t: e.t[i],
      };
    });
    electionPointsCache.set(e, pts);
    return pts;
  }

  function electionHover(info: PickingInfo) {
    const d = info.object as ElectionPoint | undefined;
    if (!info.picked || !d) {
      app.hover = null;
      return;
    }
    const pct = d.t > 0 ? Math.round((d.w / d.t) * 100) : 0;
    const rows = [
      { label: t('party'), value: d.party },
      ...(d.candidate ? [{ label: t('candidate'), value: d.candidate }] : []),
      {
        label: t('votes'),
        value: `${formatInt(d.w, ui.lang)} ${t('of_votes')} ${formatInt(d.t, ui.lang)} (${pct}%)`,
      },
    ];
    app.hover = {
      x: info.x,
      y: info.y,
      accent: `rgb(${d.color.join(',')})`,
      title: muniLabel(d.muniIdx),
      rows,
    };
  }

  // muni index -> per-year loss row (ha), for the deforestation readout/tooltip
  const defLossByMuni = $derived.by(() => {
    const map = new Map<number, number[]>();
    if (deforestation) {
      deforestation.m.forEach((mi, i) => map.set(mi, deforestation.loss[i]));
    }
    return map;
  });

  // cumulative loss (ha) for a muni through the scrubbed year, plus that year's loss
  function defLossAt(muniIdx: number): { cum: number; yr: number } {
    const row = defLossByMuni.get(muniIdx);
    if (!row || !deforestation) return { cum: 0, yr: 0 };
    const upto = app.defYear - deforestation.years[0]; // index into the year array
    let cum = 0;
    for (let i = 0; i <= upto && i < row.length; i++) cum += row[i];
    return { cum, yr: upto >= 0 && upto < row.length ? row[upto] : 0 };
  }

  // Deforestation hover/click: CPU point-in-polygon (muniPick.ts), run from the
  // pointer listeners below — deck's GPU pick (FBO + sync readPixels per pointer
  // move) is the stall memoria already removed, and the muni outlines need no
  // invisible pick fill this way.
  const muniPickIndex = $derived(buildMuniPick(shapes));
  function defMuniAt(x: number, y: number): number | null {
    if (!map) return null;
    const { lng, lat } = map.unproject([x, y]);
    return pickMuni(muniPickIndex, lng, lat);
  }
  function defMuniHoverAt(x: number, y: number) {
    const i = defMuniAt(x, y);
    if (i == null) {
      app.hover = null;
      return;
    }
    const { cum, yr } = defLossAt(i);
    app.hover = {
      x,
      y,
      accent: 'rgb(232, 130, 30)',
      title: muniLabel(i),
      rows: [
        {
          label: `${t('def_cumulative_to')} ${app.defYear}`,
          value: `${formatInt(Math.round(cum), ui.lang)} ${t('def_ha')}`,
        },
        {
          label: `${t('def_loss_in')} ${app.defYear}`,
          value: `${formatInt(Math.round(yr), ui.lang)} ${t('def_ha')}`,
        },
      ],
    };
  }
  function defMuniClickAt(x: number, y: number) {
    const i = defMuniAt(x, y);
    if (i == null) return;
    app.hover = null;
    app.defMuni = i;
  }

  // Stable getTileData per PMTiles handle: deck.gl refetches every tile when the
  // getTileData reference changes, so we cache one fetcher per handle (the handle is
  // created once in loadDeforestation). Decodes each PMTiles PNG entry to an ImageBitmap.
  let _lossFetch: { pmt: unknown; fn: (t: unknown) => Promise<ImageBitmap | null> } | null = null;
  function lossTileFetcher(pmt: {
    getZxy: (z: number, x: number, y: number, s?: AbortSignal) => Promise<{ data: ArrayBuffer } | undefined>;
  }) {
    if (!_lossFetch || _lossFetch.pmt !== pmt) {
      _lossFetch = {
        pmt,
        fn: async (t: unknown) => {
          const { index, signal } = t as { index: { x: number; y: number; z: number }; signal?: AbortSignal };
          const r = await pmt.getZxy(index.z, index.x, index.y, signal);
          if (!r || signal?.aborted) return null;
          return createImageBitmap(new Blob([r.data]));
        },
      };
    }
    return _lossFetch.fn;
  }

  // Shared per-frame loss uniforms (see LossRasterLayer `live`): one object,
  // mutated in buildLayers, never replaced.
  const lossLive: LossLive = {
    maxYear: 25,
    spotDim: 0,
    spotCode: 0,
    spotYear: 0,
    filterDim: 0,
    filterMask: 0,
    ramp0: rampStopToVec4(defRamp[0]),
    ramp1: rampStopToVec4(defRamp[1]),
    ramp2: rampStopToVec4(defRamp[2]),
    ramp3: rampStopToVec4(defRamp[3]),
  };
  const forestLowVec = $derived(hexToVec4(forestColors.lowCol));
  const forestHighVec = $derived(hexToVec4(forestColors.highCol));

  // The loss TileLayer is built ONCE per (PMTiles handle, tier budget) and the
  // SAME instance is handed to deck every frame — deck treats a re-used instance
  // as a no-op update (`oldLayer === newLayer`), so nothing about the tileset or
  // its sublayers is touched by scrubbing. Per-frame values flow through
  // `lossLive`; only a tier change (cache/request budget) or a new dataset
  // rebuilds it.
  let _lossLayer: { key: string; pmt: unknown; layer: Layer } | null = null;
  function lossTileLayer(d: DeforestationData): Layer {
    const key = `${P.tileCache}/${P.tileRequests}`;
    if (_lossLayer && _lossLayer.pmt === d.lossTiles && _lossLayer.key === key) {
      return _lossLayer.layer;
    }
    const layer = new TileLayer({
      id: 'loss-raster',
      // PMTiles pyramid → only viewport tiles at the matching zoom are on the GPU,
      // so the finest level reaches ~native 30 m. getTileData identity is kept stable
      // (keyed on the PMTiles handle) so scrubbing/spotlight changes never refetch.
      getTileData: lossTileFetcher(d.lossTiles),
      tileSize: 256,
      minZoom: 5, // pyramid floor (overview fallback for the national view)
      maxZoom: 12, // finest level ~38 m/px ≈ native 30 m
      extent: d.meta.display_raster.bounds_lnglat,
      // best-available (default): keep the coarse parent visible until the finer child
      // loads → never blank during a zoom. Conserving overviews keep brightness steady.
      refinementStrategy: 'best-available',
      // tier-scaled VRAM/decode budget (perf.svelte.ts): 400/10 high → 128/6 low
      maxRequests: P.tileRequests,
      maxCacheSize: P.tileCache,
      // deck creates the tile's GPU texture from the decoded ImageBitmap; once the
      // tile is evicted the bitmap's native memory is ours to free. Without this the
      // ImageBitmaps accumulate (GC is slow to reclaim native handles) and a long
      // pan/zoom session creeps in memory. Fires only on real eviction (best-available
      // keeps still-referenced parents loaded), so the texture is already independent.
      onTileUnload: (tile: { data: ImageBitmap | null }) => {
        if (tile.data && typeof tile.data.close === 'function') tile.data.close();
      },
      renderSubLayers: (props: Record<string, unknown>) => {
        const tile = props.tile as { boundingBox: [[number, number], [number, number]] };
        const data = props.data as ImageBitmap | null;
        if (!data) return null;
        const [[w, s], [e, n]] = tile.boundingBox;
        return new LossRasterLayer({
          id: props.id as string,
          image: data,
          bounds: [w, s, e, n],
          // (west, north, lngSpan, latSpan): geo-locks the burn-front noise so it is
          // continuous across tile seams and LOD swaps (see LossRasterLayer shader).
          tileBounds: [w, n, e - w, s - n],
          live: lossLive,
          // Nearest, and NO mip blending: R year / B packed codes must never blend
          // into a neighbour — nor into the averaged mip level deck generates
          // (default mipmapFilter 'linear' → NEAREST_MIPMAP_LINEAR under minification,
          // which happens at fractional zooms on dpr 1). The shader is spatially
          // coherent so nearest does not strobe on pan.
          textureParameters: { minFilter: 'nearest', magFilter: 'nearest', mipmapFilter: 'none' },
          pickable: false,
        } as never);
      },
    } as never);
    _lossLayer = { key, pmt: d.lossTiles, layer };
    return layer;
  }

  // Faint municipio outlines (orientation only). Not pickable — hover/click
  // resolve on the CPU (muniPick.ts) — and not filled, so no full-country
  // transparent fill is blended every frame. Memoized: constant props.
  let _defMuniLayer: { shapes: MuniShapes; layer: Layer } | null = null;
  function defMuniLayer(): Layer {
    if (_defMuniLayer && _defMuniLayer.shapes === shapes) return _defMuniLayer.layer;
    const layer = new GeoJsonLayer({
      id: 'def-munis',
      data: shapes as unknown as GeoJSON.FeatureCollection,
      stroked: true,
      filled: false,
      getLineColor: [232, 130, 30, 22],
      lineWidthMinPixels: 0.4,
      pickable: false,
    });
    _defMuniLayer = { shapes, layer };
    return layer;
  }

  function buildLayers(): Layer[] {
    const layers: Layer[] = [];

    // ---- deforestation: Hansen tree-cover-loss raster + muni outlines ----
    if (app.tab === 'deforestation') {
      if (deforestation) {
        // jungle-green canopy backdrop (year-2000 treecover) under the loss raster.
        // Rebuilt per frame (one layer, image identity stable → a cheap diff); its
        // changing maxYear prop is harmless (only read when sway > 0).
        if (deforestation.forestImage) {
          layers.push(
            new ForestLayer({
              id: 'forest-bg',
              image: deforestation.forestImage,
              bounds: (deforestation.meta.forest_raster ?? deforestation.meta.display_raster)
                .bounds_lnglat,
              maxYear: app.defPos - 2000, // only used when sway > 0
              ...forestDbg,
              // mid/low tier: single 3-octave fbm (~3 noise evals) instead of the
              // 8-eval two-frequency blend — the backdrop is a full-viewport quad
              // redrawn every scrub frame, the dominant fill-rate cost on weak GPUs.
              cheap: P.forestCheap ? 1 : 0,
              lowCol: forestLowVec,
              highCol: forestHighVec,
              // smooth backdrop: canopy is continuous, linear filtering is fine
              textureParameters: { minFilter: 'linear', magFilter: 'linear' },
              pickable: false,
            } as never)
          );
        }
        // Per-frame uniforms go into ONE shared object every loss tile reads at
        // draw time (LossRasterLayer `live`, see its header). Mutated in place —
        // the TileLayer and its per-tile sublayers see no prop change, so deck
        // does not null + rebuild a layer per cached tile each scrub frame (it
        // did: hundreds of constructions per frame after a pan/zoom session).
        // This effect still reads every source below, so it re-runs per frame and
        // the fresh `layers` array handed to setProps is what triggers the redraw.
        lossLive.maxYear = app.defPos - 2000; // float lossyear threshold → smooth crossfade
        lossLive.spotDim = app.defSpot.dim ? SPOT_DIM[app.defSpot.dim] : 0;
        lossLive.spotCode = app.defSpot.code;
        lossLive.spotYear = app.defSpotYear; // year mode restricts spotlight to one year; 0 = cumulative
        lossLive.filterDim = app.defFilter.dim;
        lossLive.filterMask = app.defFilter.mask;
        Object.assign(lossLive, defDbg); // recency-raster knobs (?debug panel tunes live)
        lossLive.ramp0 = rampStopToVec4(defRamp[0]);
        lossLive.ramp1 = rampStopToVec4(defRamp[1]);
        lossLive.ramp2 = rampStopToVec4(defRamp[2]);
        lossLive.ramp3 = rampStopToVec4(defRamp[3]);
        layers.push(lossTileLayer(deforestation));
        layers.push(defMuniLayer());
      }
      return layers;
    }

    if (!violence) return layers; // archive not loaded on this page
    const isMemoria = app.tab === 'memoria';
    const mods = violence.meta.modalities;
    const tDay = app.mday;
    const freshRange: [number, number] = [Math.max(-0.5, tDay - dbg.fadeDays), tDay];
    const softRange: [number, number] = [tDay - 30, tDay];

    // modality visibility packed into one bitmask: toggling a checkbox is a
    // single-int uniform update for the shared tendril field, never a rebuild.
    // (The wound/scar DOT layers are per-modality and toggle with `visible`.)
    const enabledMask = mods.reduce(
      (acc, m, i) => (app.enabled[m.code] ? acc | (1 << i) : acc),
      0
    );
    // one SHARED tendril field (+ a finer second one), drawn twice: a scar pass
    // (normal blend, uniform settled alpha) and a fresh pass (additive flare)
    // widthScale partially compensates the sparser curve pools on lower tiers
    // fields still building in their Worker are simply absent this frame
    const tendrilFieldList = [
      { id: 't1', field: fieldA.field, width: dbg.baseWidth * P.widthScale },
      { id: 't2', field: fieldB.field, width: dbg.t2BaseWidth * P.widthScale },
    ].filter((f): f is { id: string; field: TendrilField; width: number } => f.field !== null);

    // Dot layers draw only the instance range that can be visible (see
    // rangeDraw.ts): events are year-sorted within each modality slice
    // (pipeline contract, build_frontend_data.py), so a scar prefix / fresh
    // window in YEARS bounds the per-event GPU filter (which stays exact).
    const yT = yearProgress(tDay).year;
    const yFresh0 = yearProgress(Math.max(0, tDay - dbg.fadeDays)).year;
    const yearOf = violence.year;
    const scarRange = (m: { start: number; end: number }): InstanceRange => [
      0,
      upperBound(yearOf, yT, m.start, m.end) - m.start,
    ];
    const freshRangeOf = (m: { start: number; end: number }): InstanceRange => {
      const lo = lowerBound(yearOf, yFresh0, m.start, m.end);
      const hi = upperBound(yearOf, yT, lo, m.end);
      return [lo - m.start, hi - lo];
    };

    // ---- memoria: every event type as red wounds/scars/tendrils ----
    // Global z-order: mask, scar tendrils, scar dots (bottom), then fresh
    // tendrils, wound glow, wound core (top). Dot layers are always present and
    // toggled with `visible`; tendril layers are gated by the modality bitmask.
    layers.push(
      // country silhouette (union of muni polygons) rendered to the mask FBO,
      // not the screen; clips the tendrils to land
      new GeoJsonLayer({
        id: 'memoria-mask',
        visible: isMemoria,
        data: shapes as unknown as GeoJSON.FeatureCollection,
        operation: 'mask',
        stroked: false,
      })
    );

    // permanent scar tendrils (NORMAL blending): the settled scar state. Because
    // overlapping strands composite to one ceiling alpha, every scar reaches the
    // same intensity over time, no matter how many victims (how much blood) fell.
    for (const f of tendrilFieldList) {
      layers.push(
        new TendrilLayer({
          id: `${f.id}-scar`,
          visible: isMemoria && f.field.nCurves > 0,
          field: f.field,
          baseWidth: f.width,
          extensions: [memoriaMask],
          maskId: 'memoria-mask',
          tendrilTime: tDay,
          tendrilParams: { ...tendrilParams, enabledMask, scarMode: 1 },
        } as never)
      );
    }

    // permanent scars: every event that has already happened stays marked
    for (const [i, m] of mods.entries()) {
      layers.push(
        new RangedScatterplotLayer({
          id: `scar-${m.code}`,
          visible: isMemoria && app.enabled[m.code],
          data: scarDataByMod[i],
          instanceRange: scarRange(m),
          getFillColor: [96, 16, 22, dbg.scarDotAlpha],
          radiusUnits: 'meters',
          radiusScale: dbg.scarScale,
          radiusMinPixels: 1.6,
          radiusMaxPixels: 14,
          stroked: false,
          pickable: false, // picked on the CPU — see gatherEventsAt
          extensions: [yearFilter],
          filterRange: [-0.5, tDay] as [number, number],
        })
      );
    }

    // fresh blood tendrils (ADDITIVE): the transient flare that spreads from
    // each wound on its date with an outward pulse and fades over ~3 years;
    // dense/deadly wounds burn hotter. Same geometry as the scar pass above.
    for (const f of tendrilFieldList) {
      layers.push(
        new TendrilLayer({
          id: `${f.id}-fresh`,
          visible: isMemoria && f.field.nCurves > 0,
          field: f.field,
          baseWidth: f.width, // base; the shader scales it up at the wound centre
          parameters: ADDITIVE_BLEND,
          extensions: [memoriaMask],
          maskId: 'memoria-mask',
          tendrilTime: tDay,
          tendrilParams: { ...tendrilParams, enabledMask, scarMode: 0 },
        } as never)
      );
    }

    // wound glow: additive blending makes overlapping wounds burn hotter
    for (const [i, m] of mods.entries()) {
      layers.push(
        new RangedScatterplotLayer({
          id: `glow-${m.code}`,
          visible: isMemoria && P.glow && app.enabled[m.code],
          data: woundDataByMod[i],
          instanceRange: freshRangeOf(m),
          getFillColor: [255, 58, 28, dbg.glowAlpha],
          radiusUnits: 'meters',
          radiusScale: dbg.glowScale,
          radiusMinPixels: 5,
          // overdraw is radius²·DPR² fragments per sprite, additive (no
          // early-z) — the tier cap is the main fill-rate lever
          radiusMaxPixels: Math.min(dbg.glowMaxPx, P.glowMaxPx),
          stroked: false,
          parameters: ADDITIVE_BLEND,
          extensions: [yearFilter],
          filterRange: freshRange,
          filterSoftRange: softRange,
        })
      );
    }

    // wound core: appears at full size on the exact date, then contracts and
    // fades over ~3 years (filterTransformSize/Color) into the scar beneath
    for (const [i, m] of mods.entries()) {
      layers.push(
        new RangedScatterplotLayer({
          id: `wound-core-${m.code}`,
          visible: isMemoria && app.enabled[m.code],
          data: woundDataByMod[i],
          instanceRange: freshRangeOf(m),
          getFillColor: [255, 47, 64, dbg.coreAlpha],
          radiusUnits: 'meters',
          radiusScale: dbg.coreScale,
          radiusMinPixels: 2.2,
          radiusMaxPixels: dbg.coreMaxPx,
          stroked: false,
          pickable: false, // picked on the CPU — see gatherEventsAt
          extensions: [yearFilter],
          filterRange: freshRange,
          filterSoftRange: softRange,
        })
      );
    }

    const e = elections?.bodies[app.body][app.electionIdx[app.body]];
    if (e) {
      layers.push(
        new ScatterplotLayer<ElectionPoint>({
          id: 'elections',
          visible: app.tab === 'elections',
          data: electionPoints(e),
          getPosition: (d) => d.position,
          getFillColor: (d) => [...d.color, 235],
          getRadius: (d) => d.radius,
          radiusUnits: 'meters',
          radiusScale: 28,
          radiusMinPixels: 2.2,
          radiusMaxPixels: 22,
          stroked: true,
          getLineColor: [11, 13, 17, 200],
          lineWidthMinPixels: 0.8,
          pickable: true,
          onHover: electionHover,
        })
      );
    }
    return layers;
  }

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [-73.6, 4.4],
      zoom: 5.1,
      minZoom: 3.8,
      maxZoom: 13,
      attributionControl: { compact: true },
      pixelRatio: dprCap,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    overlay = new MapboxOverlay({ interleaved: false, layers: [], useDevicePixels: dprCap });
    map.addControl(overlay as unknown as maplibregl.IControl);
    map.on('load', () => {
      mapReady = true;
    });

    // Track the cursor in deck pick coords independently of deck's onHover (which
    // only fires on movement) so the memoria tooltip can be re-evaluated as time
    // advances during playback. The UI panels are absolutely-positioned siblings
    // of this container, so moving onto them fires pointerleave here — clearing
    // the position keeps the re-pick from resurrecting a tooltip over chrome.
    // Memoria hover/click run from these listeners on the CPU (gatherEventsAt),
    // not from deck picking. Hover is coalesced to one evaluation per frame and
    // skipped while a button is held (dragging the map).
    let hoverRaf = 0;
    const picksOnCpu = () => app.tab === 'memoria' || app.tab === 'deforestation';
    const onPointerMove = (e: PointerEvent) => {
      // Touch: no hover. A finger has no hover state, pointerleave never fires
      // for it (so a card would stick), and the card would sit under the
      // finger anyway; a tap goes through pointerdown -> click below.
      if (e.pointerType === 'touch') return;
      const r = container.getBoundingClientRect();
      lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (!picksOnCpu() || e.buttons !== 0 || hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        if (!lastPointer) return;
        if (app.tab === 'memoria') memoriaPickAt(lastPointer.x, lastPointer.y);
        else if (app.tab === 'deforestation') defMuniHoverAt(lastPointer.x, lastPointer.y);
      });
    };
    const onPointerLeave = () => {
      lastPointer = null;
      if (picksOnCpu()) app.hover = null;
    };
    // click vs drag: only a press that did not travel counts as a click
    let downAt: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
      // a hover evaluation queued by the move that preceded this press would
      // run on the next frame — AFTER the click handler cleared app.hover —
      // and resurrect the card beside the freshly opened panel
      cancelAnimationFrame(hoverRaf);
      hoverRaf = 0;
    };
    const onClick = (e: MouseEvent) => {
      if (!picksOnCpu() || !downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 4) return;
      const r = container.getBoundingClientRect();
      if (app.tab === 'memoria') memoriaClickAt(e.clientX - r.left, e.clientY - r.top);
      else defMuniClickAt(e.clientX - r.left, e.clientY - r.top);
    };
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(hoverRaf);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('click', onClick);
      overlay = null;
      map?.remove();
      map = null;
    };
  });

  // Per-frame layer updates go straight to the Deck instance, NOT through
  // MapboxOverlay.setProps: the overlay re-forwards ALL its stored props each
  // call, including useDevicePixels, and any Deck.setProps carrying that prop
  // makes luma's CanvasContext re-measure the canvas (`_updateDrawingBufferSize`
  // → getBoundingClientRect) — a forced style/layout flush. This effect runs
  // every playback frame, right after the panels' DOM updates, so that was a
  // full-page layout per frame (profiled: the single largest non-GL item,
  // ~1.6 ms/frame on a desktop, ~10 ms under 6x CPU throttling). `_deck` is the
  // overlay's private field (overlaid mode simply forwards layers to it);
  // fall back to the public path if it is ever absent.
  $effect(() => {
    if (!mapReady || !overlay) return;
    const layers = buildLayers();
    const deck = (overlay as unknown as { _deck?: { setProps(p: { layers: Layer[] }): void } })._deck;
    if (deck) deck.setProps({ layers });
    else overlay.setProps({ layers });
  });

  // Stacked layouts: the desktop centre/zoom (tuned for a wide canvas) puts the
  // country under the header and timebar — at 390px wide, zoom 5.1 is ~630px of
  // Colombia. Fit the mainland municipio centroids between the measured chrome
  // instead. San Andrés y Providencia (dept 88) is excluded: it would drag the
  // frame ~800 km west for a 52 km² island. Centroids outside a generous
  // Colombia window are skipped too: munis.json carries at least one corrupt
  // centroid (73443 Mariquita: lat 525, lon -74916667 — a source-side decimal
  // slip), and a single one of those turns the bounds into an invalid LngLat.
  // Framing only — no data is derived. Runs once per layout switch
  // (mapReady / stacked), never on legend or panel toggles: after the first
  // frame the view is the user's.
  const mainlandBounds = $derived.by((): [[number, number], [number, number]] => {
    let w = 180;
    let s = 90;
    let e = -180;
    let n = -90;
    for (let i = 0; i < munis.codes.length; i++) {
      if (Math.floor(munis.codes[i] / 1000) === 88) continue;
      const lon = munis.lon[i];
      const lat = munis.lat[i];
      if (!(lat > -6 && lat < 15 && lon > -80 && lon < -66)) continue;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
    // centroids sit inside the border: pad ~30 km so the outline is in frame
    const PAD = 0.3;
    return [
      [w - PAD, s - PAD],
      [e + PAD, n + PAD],
    ];
  });
  $effect(() => {
    if (!mapReady || !map || !stacked) return;
    const c = untrack(() => chrome);
    map.fitBounds(mainlandBounds, {
      padding: { top: (c?.top ?? 120) + 8, bottom: c?.bottom ?? 200, left: 8, right: 8 },
      animate: false,
    });
  });

  // useDevicePixels (dpr cap) changes only on a governor demotion — its own effect.
  $effect(() => {
    if (!mapReady || !overlay) return;
    overlay.setProps({ useDevicePixels: dprCap });
  });

  // basemap resolution follows governor demotions (deck's follows via the
  // setProps above; the construction-time values cover the common no-demotion
  // session)
  $effect(() => {
    if (mapReady) map?.setPixelRatio(dprCap);
  });

  // While memoria OR deforestation playback runs, sample frame times and demote
  // the tier if the device can't hold frame rate (one-way; persists across visits).
  // The governor only measures rAF deltas, so it works for either scene; demoting
  // drops dprCap + the loss-tile cache and switches the forest to cheap noise.
  $effect(() => {
    if (!(app.playing && (app.tab === 'memoria' || app.tab === 'deforestation')) || !mapReady)
      return;
    return startFpsGovernor();
  });

  // Keep the memoria tooltip live while time is flowing. deck's onHover only
  // fires on pointer movement, so under a stationary cursor the events/field
  // beneath it change without the card refreshing. Re-pick at the last cursor
  // position each colour bucket (the granularity the choropleth updates at) so
  // the card tracks what is actually under the cursor instead of going stale.
  // Tier throttle: each re-pick is a CPU scan over the events (~1 ms) — skipped
  // entirely on 'low' (the tooltip still refreshes on pointer movement).
  $effect(() => {
    void colorBucket;
    if (P.repickBuckets === 0 || colorBucket % P.repickBuckets !== 0) return;
    if (app.playing && app.tab === 'memoria' && lastPointer) {
      memoriaPickAt(lastPointer.x, lastPointer.y);
    }
  });
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
    background: var(--ink);
  }
</style>

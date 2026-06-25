<script lang="ts">
  import type { ViolenceData, ElectionsData, DeforestationData } from './data';
  import { MAX_DAY, formatMonthYear, yearProgress } from './memoria';
  import { app } from './state.svelte';
  import { t, ui, electionLabel } from './i18n.svelte';
  import { formatInt } from './data';

  let {
    violence,
    elections,
    deforestation = null,
  }: {
    violence: ViolenceData;
    elections: ElectionsData;
    deforestation?: DeforestationData | null;
  } = $props();

  // deforestation: national annual loss bars + the bar max (for the histogram)
  const defNatMax = $derived(
    deforestation ? Math.max(1, ...deforestation.national) : 1
  );
  const defYearMin = $derived(deforestation ? deforestation.years[0] : 2001);
  const defYearMax = $derived(
    deforestation ? deforestation.years[deforestation.years.length - 1] : 2024
  );

  const yearMin = $derived(violence.meta.yearMin);
  const yearMax = $derived(violence.meta.yearMax);
  const nYears = $derived(yearMax - yearMin + 1);

  const electionList = $derived(elections.bodies[app.body]);
  const electionSel = $derived(electionList[app.electionIdx[app.body]]);

  // memoria: VICTIMS per year summed across the enabled modalities (the wound
  // metric — area follows victims). Recomputes only when the enabled set
  // changes, not per playback frame.
  const maHist = $derived.by(() => {
    const out = new Array<number>(nYears).fill(0);
    for (const m of violence.meta.modalities) {
      if (!app.enabled[m.code]) continue;
      for (let i = 0; i < m.n; i++) {
        out[violence.year[m.start + i] - yearMin] += violence.victims[m.start + i];
      }
    }
    return out;
  });
  const maHistMax = $derived(Math.max(1, ...maHist));

  // deforestation playback: continuous time via rAF so the loss raster dissolves
  // in and the playhead glides, instead of jumping a whole year per tick. Loops
  // back to the start once the present is reached (an exploration, not a memorial).
  const DEF_RATE = 1.6; // calendar years per real second
  $effect(() => {
    if (!app.playing || app.tab !== 'deforestation') return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      // cap the per-tick advance so a stalled tab resumes smoothly, never lurching
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const next = app.defPos + dt * DEF_RATE;
      app.defPos = next > defYearMax ? defYearMin : next;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  // Histogram fill fraction: years already passed are full (1); the year
  // currently elapsing fills from the bottom up proportionally to the fractional
  // scrub position; future years are 0 (only the faint silhouette shows).
  function defBarFill(year: number): number {
    const f = app.defPos;
    const whole = Math.floor(f);
    if (year <= whole) return 1;
    if (year === whole + 1) return f - whole;
    return 0;
  }

  // elections playback: advance one election per tick
  $effect(() => {
    if (!app.playing || app.tab !== 'elections') return;
    const id = setInterval(() => {
      const idx = app.electionIdx[app.body];
      app.electionIdx[app.body] = idx >= electionList.length - 1 ? 0 : idx + 1;
    }, 420);
    return () => clearInterval(id);
  });

  // memoria playback: continuous time via rAF; stops at the window end (a
  // memorial should not loop). Scrubbing pauses.
  $effect(() => {
    if (!app.playing || app.tab !== 'memoria') return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      // cap the per-tick advance at 100 ms of real time: on a machine that
      // can't hold 10 fps, sim time slows down rather than lurching years
      // ahead in invisible jumps (a memorial must not skip eras silently)
      app.mday = Math.min(MAX_DAY, app.mday + (Math.min(now - last, 100) / 1000) * app.mspeed);
      last = now;
      if (app.mday >= MAX_DAY) {
        app.playing = false;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  const SPEEDS = [
    { v: 90, label: '½×' },
    { v: 180, label: '1×' },
    { v: 720, label: '4×' },
  ];

  // First timeline interaction this session: drops the attention pulse on the
  // play button and the one-time "press play" hint armed by the welcome modal.
  let interacted = $state(false);

  // keyboard steps for the day slider: ±1 day per keypress over a 25k-day range
  // is unusable — arrows move a month, PageUp/Down a year
  function mdayKeys(ev: KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowLeft: -30,
      ArrowDown: -30,
      ArrowRight: 30,
      ArrowUp: 30,
      PageDown: -365,
      PageUp: 365,
    };
    let next: number | null = null;
    if (ev.key in step) next = app.mday + step[ev.key];
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = MAX_DAY;
    if (next === null) return;
    ev.preventDefault();
    interacted = true;
    app.playing = false;
    app.mday = Math.max(0, Math.min(MAX_DAY, next));
  }
</script>

<div class="timebar">
  {#if app.tab === 'memoria'}
    <div class="readout">
      <button
        class="play mono"
        class:beckon={!interacted && !app.playing}
        onclick={() => {
          interacted = true;
          app.playing = !app.playing;
        }}
        aria-label={app.playing ? t('pause') : t('play')}
        title={app.playing ? t('pause') : t('play')}
      >
        {app.playing ? '❚❚' : '▶'}
      </button>
      <span class="year mono">{yearProgress(app.mday).year}</span>
      <!-- how much of the year has passed — wordless, no month name -->
      <span class="yeardial" aria-hidden="true">
        <span class="yearfill" style:width="{yearProgress(app.mday).frac * 100}%"></span>
      </span>
      {#if app.playHint && !interacted && !app.playing}
        <span class="hint mono">{t('hint_play')}</span>
      {/if}
      <span class="speeds mono" role="group" aria-label={t('speed')}>
        {#each SPEEDS as s (s.v)}
          <button
            class="spd"
            class:active={app.mspeed === s.v}
            aria-pressed={app.mspeed === s.v}
            onclick={() => (app.mspeed = s.v)}
          >
            {s.label}
          </button>
        {/each}
      </span>
    </div>

    <div class="strip">
      <svg class="hist" viewBox="0 0 {nYears} 44" preserveAspectRatio="none" aria-hidden="true">
        {#each maHist as v, i (i)}
          <rect
            class="ma"
            x={i + 0.12}
            y={44 - Math.sqrt(v / maHistMax) * 44}
            width="0.76"
            height={Math.sqrt(v / maHistMax) * 44}
          />
        {/each}
      </svg>
      <input
        class="slider"
        type="range"
        min="0"
        max={MAX_DAY}
        step="1"
        bind:value={app.mday}
        oninput={() => {
          interacted = true;
          app.playing = false;
        }}
        onkeydown={mdayKeys}
        aria-label={t('date')}
        aria-valuetext={formatMonthYear(app.mday, ui.lang)}
      />
      <div class="axis mono dim" aria-hidden="true">
        <span>{yearMin}</span><span>1975</span><span>1990</span><span>2005</span><span
          >{yearMax}</span
        >
      </div>
    </div>
  {:else if app.tab === 'deforestation'}
    <div class="readout">
      <button
        class="play mono"
        onclick={() => (app.playing = !app.playing)}
        aria-label={app.playing ? t('pause') : t('play')}
        title={app.playing ? t('pause') : t('play')}
      >
        {app.playing ? '❚❚' : '▶'}
      </button>
      <span class="year mono">{app.defYear}</span>
      {#if deforestation}
        <span class="count mono dim">
          {formatInt(Math.round(deforestation.national[app.defYear - defYearMin]), ui.lang)}
          {t('def_ha')} · {t('def_hansen_series')}
        </span>
      {/if}
    </div>
    <div class="strip">
      {#if deforestation}
        <svg
          class="hist"
          viewBox="0 0 {deforestation.years.length} 44"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {#each deforestation.national as v, i (i)}
            {@const h = Math.sqrt(v / defNatMax) * 44}
            {@const f = defBarFill(defYearMin + i)}
            <!-- faint full-height silhouette: shows the spike that's coming -->
            <rect class="def track" x={i + 0.12} y={44 - h} width="0.76" height={h} />
            <!-- solid fill, grows from the bottom as the year elapses -->
            {#if f > 0}
              <rect class="def" x={i + 0.12} y={44 - h * f} width="0.76" height={h * f} />
            {/if}
          {/each}
        </svg>
      {/if}
      <input
        class="slider"
        type="range"
        min={defYearMin}
        max={defYearMax}
        step="any"
        bind:value={app.defPos}
        oninput={() => (app.playing = false)}
        aria-label={t('year')}
        aria-valuetext={String(app.defYear)}
      />
      <div class="axis mono dim" aria-hidden="true">
        <span>{defYearMin}</span><span>{defYearMax}</span>
      </div>
    </div>
  {:else}
    <div class="readout">
      <button
        class="play mono"
        onclick={() => (app.playing = !app.playing)}
        aria-label={app.playing ? t('pause') : t('play')}
      >
        {app.playing ? '❚❚' : '▶'}
      </button>
      <span class="year mono">{electionSel ? electionLabel(electionSel) : ''}</span>
      <span class="count mono dim">{t(app.body)}</span>
    </div>
    <div class="strip elections-strip">
      <input
        class="slider"
        type="range"
        min="0"
        max={electionList.length - 1}
        step="1"
        bind:value={app.electionIdx[app.body]}
        oninput={() => (app.playing = false)}
        aria-label={t('year')}
      />
      <div class="ticks" aria-hidden="true">
        {#each electionList as e, i (e.label)}
          <button
            class="tick mono"
            class:active={i === app.electionIdx[app.body]}
            style:left="{(i / Math.max(1, electionList.length - 1)) * 100}%"
            onclick={() => {
              app.electionIdx[app.body] = i;
              app.playing = false;
            }}
            title={electionLabel(e)}
          >
            <span class="dot"></span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .timebar {
    padding: 10px 16px 12px;
  }

  .readout {
    display: flex;
    align-items: baseline;
    gap: 14px;
  }

  .play {
    font-size: 16px;
    color: var(--gold);
    border: 1px solid var(--gold);
    border-radius: 50%;
    width: 44px;
    height: 44px;
    line-height: 1;
    flex: none;
    align-self: center;
  }

  .play:hover {
    color: var(--ink);
    background: var(--gold);
  }

  /* attention affordance until the first interaction — the global
     prefers-reduced-motion override (app.css) caps it at one iteration */
  .beckon {
    animation: beckon 2.6s ease-out infinite;
  }

  @keyframes beckon {
    0% {
      box-shadow: 0 0 0 0 rgba(201, 162, 39, 0.35);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(201, 162, 39, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(201, 162, 39, 0);
    }
  }

  .hint {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--gold);
    align-self: center;
    animation: hintpulse 2.4s ease-in-out infinite;
  }

  @keyframes hintpulse {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 1;
    }
  }

  .year {
    font-size: 26px;
    font-weight: 500;
    color: var(--paper);
    letter-spacing: 0.04em;
    min-width: 4.2ch;
  }

  .count {
    font-size: 11px;
  }

  .strip {
    position: relative;
    margin-top: 6px;
  }

  .hist {
    display: block;
    width: 100%;
    height: 64px;
  }

  .hist rect {
    fill: rgba(232, 64, 58, 0.38);
  }

  .slider {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 100%;
    margin: 0;
    height: 24px;
    background: transparent;
    cursor: pointer;
  }

  .slider::-webkit-slider-runnable-track {
    height: 3px;
    background: var(--hairline);
  }

  .slider::-moz-range-track {
    height: 3px;
    background: var(--hairline);
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 7px;
    height: 22px;
    margin-top: -9.5px;
    border-radius: 2px;
    background: var(--gold);
    border: none;
  }

  .slider::-moz-range-thumb {
    width: 7px;
    height: 22px;
    border-radius: 2px;
    background: var(--gold);
    border: none;
  }

  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    margin-top: 2px;
    letter-spacing: 0.1em;
  }

  .elections-strip {
    padding-top: 16px;
  }

  /* ---------- memoria mode ---------- */
  .yeardial {
    align-self: center;
    width: 64px;
    height: 3px;
    border-radius: 2px;
    background: var(--hairline);
    overflow: hidden;
  }

  .yearfill {
    display: block;
    height: 100%;
    background: var(--gold);
  }

  .speeds {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }

  .spd {
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--paper-faint);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 4px 9px;
  }

  .spd:hover {
    color: var(--paper);
  }

  .spd.active {
    color: var(--gold);
    border-color: var(--gold);
  }

  .hist rect.ma {
    fill: rgba(255, 47, 64, 0.42);
  }

  .hist rect.def {
    fill: rgba(232, 130, 30, 0.62);
  }

  .hist rect.def.track {
    fill: rgba(232, 130, 30, 0.18);
  }

  .ticks {
    position: relative;
    height: 12px;
    margin: 2px 6px 0;
  }

  .tick {
    position: absolute;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-size: 8px;
    color: var(--paper-faint);
  }

  .tick .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--hairline);
  }

  .tick.active {
    color: var(--gold);
  }

  .tick.active .dot {
    background: var(--gold);
  }

  .tick:hover {
    color: var(--paper);
  }
</style>

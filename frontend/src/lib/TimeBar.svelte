<script lang="ts">
  import type { ViolenceData, ElectionsData } from './data';
  import { formatInt } from './data';
  import {
    type MemoriaData,
    MAX_DAY,
    dayOfISO,
    formatMonthYear,
  } from './memoria';
  import { app } from './state.svelte';
  import { t, ui, electionLabel } from './i18n.svelte';

  let {
    violence,
    elections,
    memoria,
  }: { violence: ViolenceData; elections: ElectionsData; memoria: MemoriaData } = $props();

  const yearMin = $derived(violence.meta.yearMin);
  const yearMax = $derived(violence.meta.yearMax);
  const nYears = $derived(yearMax - yearMin + 1);

  // per-year totals across the enabled modalities (sqrt scale for the bars —
  // AS peaks would otherwise flatten everything else)
  const hist = $derived.by(() => {
    const out = new Array<number>(nYears).fill(0);
    for (const m of violence.meta.modalities) {
      if (!app.enabled[m.code]) continue;
      for (let i = 0; i < nYears; i++) out[i] += m.yearCounts[i];
    }
    return out;
  });
  const histMax = $derived(Math.max(1, ...hist));

  const yearCount = $derived(
    app.allYears ? hist.reduce((a, b) => a + b, 0) : (hist[app.year - yearMin] ?? 0)
  );

  const electionList = $derived(elections.bodies[app.body]);
  const electionSel = $derived(electionList[app.electionIdx[app.body]]);

  // memoria: massacre VICTIMS per year (the wound metric — area follows victims)
  const maHist = $derived.by(() => {
    const out = new Array<number>(nYears).fill(0);
    const ma = violence.meta.modalities[0];
    for (let i = 0; i < ma.n; i++) {
      out[violence.year[ma.start + i] - yearMin] += violence.victims[ma.start + i];
    }
    return out;
  });
  const maHistMax = $derived(Math.max(1, ...maHist));
  const memoriaTicks = $derived(
    memoria.bodies[app.mbody]
      .filter((e) => e.date)
      .map((e) => ({
        day: dayOfISO(e.date as string),
        label: electionLabel(e),
        fn: !!e.fn_consensus,
      }))
  );

  // playback: advance one year (violence) or one election (elections) per tick
  $effect(() => {
    if (!app.playing || app.tab === 'memoria') return;
    const id = setInterval(() => {
      if (app.tab === 'violence') {
        app.allYears = false;
        app.year = app.year >= yearMax ? yearMin : app.year + 1;
      } else {
        const idx = app.electionIdx[app.body];
        app.electionIdx[app.body] = idx >= electionList.length - 1 ? 0 : idx + 1;
      }
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
      app.mday = Math.min(MAX_DAY, app.mday + ((now - last) / 1000) * app.mspeed);
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
    app.playing = false;
    app.mday = Math.max(0, Math.min(MAX_DAY, next));
  }

  function barYear(i: number): number {
    return yearMin + i;
  }
</script>

<div class="timebar">
  {#if app.tab === 'violence'}
    <div class="readout">
      <button
        class="play mono"
        onclick={() => (app.playing = !app.playing)}
        aria-label={app.playing ? t('pause') : t('play')}
        title={app.playing ? t('pause') : t('play')}
      >
        {app.playing ? '❚❚' : '▶'}
      </button>
      <span class="year mono">{app.allYears ? `${yearMin}–${yearMax}` : app.year}</span>
      <span class="count mono dim">
        {formatInt(yearCount, ui.lang)}
        {app.allYears ? t('events_total') : `${t('events_in')} ${app.year}`}
      </span>
      <label class="all mono">
        <input type="checkbox" bind:checked={app.allYears} />
        {t('all_years')}
      </label>
    </div>

    <div class="strip">
      <svg
        class="hist"
        viewBox="0 0 {nYears} 30"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#each hist as v, i (i)}
          <rect
            x={i + 0.12}
            y={30 - Math.sqrt(v / histMax) * 30}
            width="0.76"
            height={Math.sqrt(v / histMax) * 30}
            class:current={!app.allYears && barYear(i) === app.year}
            class:all={app.allYears}
          />
        {/each}
      </svg>
      <input
        class="slider"
        type="range"
        min={yearMin}
        max={yearMax}
        step="1"
        bind:value={app.year}
        oninput={() => {
          app.allYears = false;
          app.playing = false;
        }}
        aria-label={t('year')}
      />
      <div class="axis mono dim" aria-hidden="true">
        <span>{yearMin}</span><span>1975</span><span>1990</span><span>2005</span><span
          >{yearMax}</span
        >
      </div>
    </div>
  {:else if app.tab === 'memoria'}
    <div class="readout">
      <button
        class="play mono"
        onclick={() => (app.playing = !app.playing)}
        aria-label={app.playing ? t('pause') : t('play')}
        title={app.playing ? t('pause') : t('play')}
      >
        {app.playing ? '❚❚' : '▶'}
      </button>
      <span class="year mono mdate">{formatMonthYear(app.mday, ui.lang)}</span>
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
      <svg class="hist" viewBox="0 0 {nYears} 30" preserveAspectRatio="none" aria-hidden="true">
        {#each maHist as v, i (i)}
          <rect
            class="ma"
            x={i + 0.12}
            y={30 - Math.sqrt(v / maHistMax) * 30}
            width="0.76"
            height={Math.sqrt(v / maHistMax) * 30}
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
        oninput={() => (app.playing = false)}
        onkeydown={mdayKeys}
        aria-label={t('date')}
        aria-valuetext={formatMonthYear(app.mday, ui.lang)}
      />
      <div class="mticks">
        {#each memoriaTicks as tk (tk.day)}
          <button
            class="mtick"
            class:fn={tk.fn}
            style:left="{(tk.day / MAX_DAY) * 100}%"
            title={tk.label}
            aria-label={`${t(app.mbody)} ${tk.label}`}
            onclick={() => {
              app.mday = tk.day;
              app.playing = false;
            }}
          ></button>
        {/each}
      </div>
      <div class="axis mono dim" aria-hidden="true">
        <span>{yearMin}</span><span>1975</span><span>1990</span><span>2005</span><span
          >{yearMax}</span
        >
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
    font-size: 13px;
    color: var(--gold);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    width: 30px;
    height: 26px;
    line-height: 1;
    flex: none;
    align-self: center;
  }

  .play:hover {
    border-color: var(--gold);
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

  .all {
    margin-left: auto;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--paper-dim);
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .all input {
    accent-color: var(--gold);
  }

  .strip {
    position: relative;
    margin-top: 6px;
  }

  .hist {
    display: block;
    width: 100%;
    height: 30px;
  }

  .hist rect {
    fill: rgba(232, 64, 58, 0.38);
  }

  .hist rect.current,
  .hist rect.all {
    fill: var(--accent);
  }

  .slider {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 100%;
    margin: 0;
    height: 18px;
    background: transparent;
    cursor: pointer;
  }

  .slider::-webkit-slider-runnable-track {
    height: 2px;
    background: var(--hairline);
  }

  .slider::-moz-range-track {
    height: 2px;
    background: var(--hairline);
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 4px;
    height: 16px;
    margin-top: -7px;
    border-radius: 1px;
    background: var(--gold);
    border: none;
  }

  .slider::-moz-range-thumb {
    width: 4px;
    height: 16px;
    border-radius: 1px;
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
  .mdate {
    font-size: 19px;
    /* widest case "septiembre de 2026" — keep the readout from jittering
       between months during playback */
    min-width: 19ch;
  }

  .speeds {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }

  .spd {
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--paper-faint);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 3px 7px;
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

  .mticks {
    position: relative;
    height: 8px;
    margin: 1px 6px 0;
  }

  .mtick {
    position: absolute;
    transform: translateX(-50%) rotate(45deg);
    width: 6px;
    height: 6px;
    background: var(--gold);
    opacity: 0.75;
  }

  .mtick:hover {
    opacity: 1;
  }

  .mtick:focus-visible {
    opacity: 1;
    outline: 1px solid var(--paper);
    outline-offset: 2px;
  }

  .mtick.fn {
    background: transparent;
    border: 1px solid var(--gold);
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

<script lang="ts">
  import type { ViolenceData } from './data';
  import { formatInt } from './data';
  import { t, ui } from './i18n.svelte';

  let { violence }: { violence: ViolenceData } = $props();

  const maMeta = $derived(violence.meta.modalities[0]);
  // massacres with year known but exact date unknown (scar-only display rule)
  const scarOnly = $derived.by(() => {
    let n = 0;
    for (let i = 0; i < maMeta.n; i++) if (violence.day[maMeta.start + i] < 0) n++;
    return n;
  });
  const totalVictims = $derived.by(() => {
    let n = 0;
    for (let i = 0; i < maMeta.n; i++) n += violence.victims[maMeta.start + i];
    return n;
  });
</script>

<div class="legend">
  <span class="eyebrow">{t('wounds_title')}</span>
  <ul class="wounds">
    <li>
      <span class="w fresh"></span>
      <span class="wl">{t('wound_fresh')}</span>
    </li>
    <li>
      <span class="w mid"></span>
      <span class="wl">{t('wound_healing')}</span>
    </li>
    <li>
      <span class="w scar"></span>
      <span class="wl">{t('wound_scar')}</span>
    </li>
    <li>
      <span class="w tendril"></span>
      <span class="wl">{t('wound_tendrils')}</span>
    </li>
  </ul>
  <p class="note mono">
    {t('victims_area')} · {formatInt(maMeta.n, ui.lang)}
    {ui.lang === 'es' ? 'masacres' : 'massacres'},
    {formatInt(totalVictims, ui.lang)}
    {ui.lang === 'es' ? 'víctimas' : 'victims'}
  </p>

  <hr class="rule" />

  <details class="method">
    <summary class="mono">{t('memoria_method_title')}</summary>
    <p class="note mono">{t('memoria_method_massacres')}</p>
    <p class="note mono">
      {formatInt(scarOnly, ui.lang)}
      {t('date_known_year')}.
      {t('never_imputed')}
    </p>
  </details>
</div>

<style>
  .legend {
    padding: 12px 16px 14px;
  }

  .wounds {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  .wounds li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 3px 0;
    font-size: 11.5px;
  }

  .w {
    flex: none;
    border-radius: 50%;
  }

  .w.fresh {
    width: 13px;
    height: 13px;
    background: rgb(255, 47, 64);
    box-shadow: 0 0 9px 3px rgba(255, 58, 28, 0.55);
  }

  .w.mid {
    width: 10px;
    height: 10px;
    background: rgba(255, 47, 64, 0.45);
    box-shadow: 0 0 5px 1px rgba(255, 58, 28, 0.25);
  }

  .w.scar {
    width: 8px;
    height: 8px;
    background: rgba(96, 16, 22, 0.85);
  }

  .w.tendril {
    width: 13px;
    height: 3px;
    border-radius: 2px;
    background: linear-gradient(90deg, rgba(255, 58, 28, 0.9), rgba(255, 58, 28, 0));
  }

  .wl {
    color: var(--paper-dim);
  }

  .note {
    margin: 7px 0 0;
    font-size: 10px;
    line-height: 1.6;
    color: var(--paper-faint);
  }

  .method summary {
    cursor: pointer;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--paper-dim);
    margin-top: 2px;
  }

  .method summary:hover {
    color: var(--gold);
  }
</style>

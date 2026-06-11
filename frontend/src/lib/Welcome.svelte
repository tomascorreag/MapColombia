<script lang="ts">
  import { t, ui, toggleLang } from './i18n.svelte';

  let { onclose }: { onclose: () => void } = $props();

  function onkeydown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') onclose();
  }
</script>

<svelte:window {onkeydown} />

<!-- only direct backdrop clicks close — clicks inside the card bubble up
     with a different target, so no stopPropagation handler on the card -->
<div
  class="backdrop"
  onclick={(ev) => ev.target === ev.currentTarget && onclose()}
  role="presentation"
>
  <div class="ficha card" role="dialog" aria-modal="true" tabindex="-1" aria-label={t('title')}>
    <button class="lang mono" onclick={toggleLang} aria-label="Cambiar idioma / switch language">
      {ui.lang === 'es' ? 'EN' : 'ES'}
    </button>
    <span class="eyebrow">{t('welcome_eyebrow')}</span>
    <h1>{t('title')}</h1>

    <p class="what">{t('welcome_what')}</p>

    <ul class="how">
      <li>{t('welcome_how_play')}</li>
      <li>{t('welcome_how_legend')}</li>
      <li>{t('welcome_how_hover')}</li>
      <li>{t('welcome_how_lang')}</li>
    </ul>

    <p class="dignity dim">{t('welcome_dignity')}</p>

    <div class="actions">
      <button class="enter mono" onclick={onclose}>{t('welcome_enter')}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(7, 9, 12, 0.62);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .card {
    position: relative;
    width: min(560px, 100%);
    max-height: min(78vh, 720px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--hairline) transparent;
    padding: 20px 24px 22px;
  }

  /* mirrors the header's ES/EN button so the affordance reads as the same control */
  .lang {
    position: absolute;
    top: 16px;
    right: 20px;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--paper-dim);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 4px 8px;
  }

  .lang:hover {
    color: var(--gold);
    border-color: var(--gold);
  }

  h1 {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 600;
    line-height: 1.1;
    margin: 6px 0 12px;
  }

  .what {
    font-size: 13px;
    line-height: 1.55;
    color: var(--paper);
    margin: 0 0 14px;
  }

  .how {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .how li {
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--paper-dim);
  }

  .dignity {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 12px;
    line-height: 1.5;
    margin: 14px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--hairline-soft);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .enter {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold);
    border: 1px solid var(--gold);
    border-radius: 2px;
    padding: 8px 14px;
  }

  .enter:hover {
    color: var(--ink);
    background: var(--gold);
  }
</style>

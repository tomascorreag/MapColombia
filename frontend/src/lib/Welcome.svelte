<script lang="ts">
  import { t, ui, toggleLang } from './i18n.svelte';

  // 'violence' (default) or 'deforestation' — each archive gets its own title,
  // framing paragraph, and how-to bullets; the dignity line is violence-only
  // (its honesty caveat lives inside def_welcome_what instead).
  let {
    onclose,
    variant = 'violence',
  }: { onclose: () => void; variant?: 'violence' | 'deforestation' } = $props();
  const def = $derived(variant === 'deforestation');

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
  <div
    class="ficha card"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    aria-label={def ? t('def_title') : t('title')}
  >
    <button class="lang mono" onclick={toggleLang} aria-label="Cambiar idioma / switch language">
      {ui.lang === 'es' ? 'EN' : 'ES'}
    </button>
    <span class="eyebrow">{t('welcome_eyebrow')}</span>
    <h1>{def ? t('def_title') : t('title')}</h1>

    <p class="what">{def ? t('def_welcome_what') : t('welcome_what')}</p>

    <ul class="how">
      <li>{t('welcome_how_play')}</li>
      <li>{def ? t('def_welcome_how_legend') : t('welcome_how_legend')}</li>
      <li>{def ? t('def_click_hint') : t('welcome_how_hover')}</li>
      <li>{t('welcome_how_lang')}</li>
    </ul>

    {#if !def}
      <p class="dignity dim">{t('welcome_dignity')}</p>
    {/if}

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
    /* the scrim develops in after the arrival veil has cleared */
    animation: backdropIn 0.5s ease 0.35s both;
  }
  @keyframes backdropIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .card {
    position: relative;
    width: min(560px, 100%);
    max-height: min(78vh, 720px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--hairline) transparent;
    padding: 20px 24px 22px;
    /* rises + settles once the black has lifted */
    animation: cardIn 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.45s both;
  }
  @keyframes cardIn {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* inner blocks develop in sequence for an unfolding "dossier" feel */
  .card > :is(.eyebrow, h1, .what, .how, .dignity, .actions) {
    animation: itemIn 0.5s ease both;
  }
  .card > .eyebrow {
    animation-delay: 0.6s;
  }
  .card > h1 {
    animation-delay: 0.68s;
  }
  .card > .what {
    animation-delay: 0.76s;
  }
  .card > .how {
    animation-delay: 0.84s;
  }
  .card > .dignity {
    animation-delay: 0.92s;
  }
  .card > .actions {
    animation-delay: 1s;
  }
  @keyframes itemIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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

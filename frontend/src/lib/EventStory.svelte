<script lang="ts">
  import type { EventAnnotation } from './data';
  import { t, ui } from './i18n.svelte';

  let { annotation, onclose }: { annotation: EventAnnotation; onclose: () => void } =
    $props();

  // ISO match date -> localized long date (the coded Fecha_Hecho, episode start)
  const dateLabel = $derived(
    new Date(`${annotation.match.date}T00:00:00Z`).toLocaleDateString(
      ui.lang === 'es' ? 'es-CO' : 'en-GB',
      { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }
    )
  );

  function onkeydown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') onclose();
  }
</script>

<svelte:window {onkeydown} />

<!-- only direct backdrop clicks close — clicks inside the card bubble up with a
     different target, so no stopPropagation handler on the card -->
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
    aria-label={annotation.title[ui.lang]}
  >
    <div class="head">
      <span class="eyebrow">{t('story_eyebrow')}</span>
      <button class="close mono" onclick={onclose} aria-label={t('close')}>✕</button>
    </div>

    <h2>{annotation.title[ui.lang]}</h2>
    <p class="rec mono dim">
      {t('story_record')} {t('record_no')} {annotation.idCaso} · {dateLabel}
    </p>

    {#if annotation.merge.mode !== 'auto'}
      <p class="review">
        <strong>{t('story_under_review')}.</strong>
        {t('story_review_note')}
      </p>
    {/if}

    <p class="narrative">{annotation.narrative[ui.lang]}</p>

    <span class="eyebrow srclabel">{t('sources')}</span>
    <ul>
      {#each annotation.sources as s (s.url)}
        <li>
          <a href={s.url} target="_blank" rel="noopener">{s.title}</a>
          <span class="pub dim">— {s.publisher}</span>
        </li>
      {/each}
    </ul>
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
    width: min(560px, 100%);
    max-height: min(78vh, 720px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--hairline) transparent;
    padding: 16px 20px 18px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }

  .close {
    font-size: 11px;
    color: var(--paper-dim);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 3px 7px;
  }

  .close:hover {
    color: var(--gold);
    border-color: var(--gold);
  }

  h2 {
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    margin: 8px 0 2px;
  }

  .rec {
    font-size: 10px;
    letter-spacing: 0.06em;
    margin: 0 0 12px;
  }

  .review {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--paper-dim);
    background: rgba(201, 162, 39, 0.08);
    border-left: 2px solid var(--gold);
    padding: 8px 10px;
    margin: 0 0 12px;
  }

  .review strong {
    color: var(--gold);
    font-weight: 600;
  }

  .narrative {
    font-size: 13px;
    line-height: 1.6;
    color: var(--paper);
    margin: 0 0 14px;
  }

  .srclabel {
    display: block;
    padding-top: 10px;
    border-top: 1px solid var(--hairline-soft);
    margin-bottom: 6px;
  }

  ul {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  li {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--paper-dim);
    margin: 0;
  }

  .pub {
    font-size: 10.5px;
  }

  a {
    color: var(--gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(201, 162, 39, 0.35);
  }

  a:hover {
    border-bottom-color: var(--gold);
  }
</style>

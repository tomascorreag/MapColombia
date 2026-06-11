<script lang="ts">
  import { ui } from './i18n.svelte';

  let { onclose }: { onclose: () => void } = $props();

  // Static, developer-authored bilingual content (inline links via {@html}).
  // Attribution wording follows each source's stated requirements — see
  // data/processed/frontend/README.md for the per-file legal terms.
  type Entry = { es: string; en: string };

  const SOURCES: Entry[] = [
    {
      es: '<strong>Violencia</strong> — Centro Nacional de Memoria Histórica (CNMH), Sistema de Información de Eventos de Violencia del Conflicto Armado Colombiano (SIEVCAC), Observatorio de Memoria y Conflicto. Corte 2026-03-31, vía el <a href="https://geoportal-de-datos-abiertos-cnmh-cnmh.hub.arcgis.com/" target="_blank" rel="noopener">Geoportal de Datos Abiertos del CNMH</a>. Licencia <a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noopener">CC BY 4.0</a>. Datos transformados por este proyecto (filtrado y recodificación; exclusiones documentadas, nunca imputadas).',
      en: '<strong>Violence</strong> — Centro Nacional de Memoria Histórica (CNMH), Sistema de Información de Eventos de Violencia del Conflicto Armado Colombiano (SIEVCAC), Observatorio de Memoria y Conflicto. Cut 2026-03-31, via the <a href="https://geoportal-de-datos-abiertos-cnmh-cnmh.hub.arcgis.com/" target="_blank" rel="noopener">CNMH Open Data Geoportal</a>. Licensed <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Data transformed by this project (filtering and recoding; exclusions documented, never imputed).',
    },
    {
      es: '<strong>Elecciones</strong> — Resultados Electorales de Colombia, Centro de Estudios sobre Desarrollo Económico (CEDE), Universidad de los Andes. DOI <a href="https://doi.org/10.71590/R2KLKI" target="_blank" rel="noopener">10.71590/R2KLKI</a>, licencia <a href="https://creativecommons.org/publicdomain/zero/1.0/deed.es" target="_blank" rel="noopener">CC0 1.0</a>. Datos transformados por este proyecto.',
      en: '<strong>Elections</strong> — Resultados Electorales de Colombia, Centro de Estudios sobre Desarrollo Económico (CEDE), Universidad de los Andes. DOI <a href="https://doi.org/10.71590/R2KLKI" target="_blank" rel="noopener">10.71590/R2KLKI</a>, licensed <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0 1.0</a>. Data transformed by this project.',
    },
    {
      es: '<strong>Centroides municipales</strong> — "MinSalud Divipola - Municipios", Ministerio de Salud y Protección Social. Licencia <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Fuente: Portal de Datos Abiertos <a href="https://www.datos.gov.co" target="_blank" rel="noopener">www.datos.gov.co</a> (última consulta 2026-06-05). Datos transformados; el derivado se comparte bajo la misma licencia.',
      en: '<strong>Municipal centroids</strong> — "MinSalud Divipola - Municipios", Ministerio de Salud y Protección Social. Licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Source: Portal de Datos Abiertos <a href="https://www.datos.gov.co" target="_blank" rel="noopener">www.datos.gov.co</a> (last retrieved 2026-06-05). Data transformed; the derivative is shared under the same license.',
    },
    {
      es: '<strong>Límites municipales</strong> — Marco Geoestadístico Nacional (MGN2023), Departamento Administrativo Nacional de Estadística - DANE: <a href="https://www.dane.gov.co" target="_blank" rel="noopener">www.dane.gov.co</a>. Geometrías simplificadas por este proyecto.',
      en: '<strong>Municipal boundaries</strong> — Marco Geoestadístico Nacional (MGN2023), Departamento Administrativo Nacional de Estadística - DANE: <a href="https://www.dane.gov.co" target="_blank" rel="noopener">www.dane.gov.co</a>. Geometries simplified by this project.',
    },
    {
      es: '<strong>Mapa base</strong> — © <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, © colaboradores de <a href="https://www.openstreetmap.org/about/" target="_blank" rel="noopener">OpenStreetMap</a>.',
      en: '<strong>Basemap</strong> — © <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, © <a href="https://www.openstreetmap.org/about/" target="_blank" rel="noopener">OpenStreetMap</a> contributors.',
    },
  ];

  const NOTICES: Entry[] = [
    {
      es: 'Este mapa representa víctimas reales del conflicto armado colombiano. Se publica con fines de memoria, investigación y educación, con respeto por las víctimas y sus comunidades.',
      en: 'This map depicts real victims of the Colombian armed conflict. It is published for memory, research and education, with respect for the victims and their communities.',
    },
    {
      es: 'Los datos reflejan el registro SIEVCAC al corte 2026-03-31. Todo registro de esta naturaleza es incompleto: los conteos pueden cambiar entre cortes. Los eventos sin fecha o municipio conocido se excluyen y se contabilizan; ningún dato faltante se estima ni se imputa.',
      en: 'The data reflect the SIEVCAC registry as of the 2026-03-31 cut. Any registry of this nature is incomplete: counts may change between cuts. Events without a known date or municipality are excluded and counted; no missing value is ever estimated or imputed.',
    },
    {
      es: 'Las atribuciones de responsabilidad (incluidas las de agentes del Estado) son las del registro del CNMH — presuntos responsables según la fuente, no declaraciones judiciales de responsabilidad.',
      en: 'Perpetrator attributions (including those of state agents) are those recorded by the CNMH — alleged perpetrators per the source, not judicial findings of responsibility.',
    },
    {
      es: 'La yuxtaposición espacial y temporal de violencia y resultados electorales no implica relación causal. Este es un instrumento de exploración, no un análisis causal.',
      en: 'The spatial and temporal juxtaposition of violence and electoral results does not imply causation. This is an exploration instrument, not a causal analysis.',
    },
    {
      es: 'La escala izquierda–derecha de partidos es una clasificación académica preliminar elaborada por este proyecto (una cita por partido), pendiente de revisión; el método y la cobertura se publican junto a cada puntaje.',
      en: 'The party left–right scale is a preliminary scholarly classification produced by this project (one citation per party), pending review; method and coverage are published alongside every score.',
    },
    {
      es: 'Proyecto independiente. No está afiliado al CNMH, al DANE, al CEDE/Universidad de los Andes ni a MinSalud, y ninguna de esas entidades avala esta visualización.',
      en: 'Independent project. Not affiliated with CNMH, DANE, CEDE/Universidad de los Andes or MinSalud; none of those institutions endorses this visualization.',
    },
  ];

  const LICENSING: Entry = {
    es: 'Los datos derivados publicados por este proyecto se comparten bajo CC BY 4.0 (centroides municipales: CC BY-SA 4.0); el código, bajo licencia MIT. Cada archivo de datos lleva su procedencia y método en su bloque <span class="mono">meta</span>.',
    en: 'The derived datasets published by this project are shared under CC BY 4.0 (municipal centroids: CC BY-SA 4.0); the code is MIT-licensed. Every data file carries its provenance and method in its <span class="mono">meta</span> block.',
  };

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
    aria-label={ui.lang === 'es' ? 'Fuentes y créditos' : 'Sources & credits'}
  >
    <div class="head">
      <span class="eyebrow">
        {ui.lang === 'es' ? 'Fuentes y créditos' : 'Sources & credits'}
      </span>
      <button class="close mono" onclick={onclose} aria-label={ui.lang === 'es' ? 'Cerrar' : 'Close'}>
        ✕
      </button>
    </div>

    <h2>{ui.lang === 'es' ? 'Fuentes de datos' : 'Data sources'}</h2>
    <ul>
      {#each SOURCES as s (s.en)}
        <li>{@html s[ui.lang]}</li>
      {/each}
    </ul>

    <h2>{ui.lang === 'es' ? 'Avisos' : 'Notices'}</h2>
    <ul>
      {#each NOTICES as n (n.en)}
        <li>{@html n[ui.lang]}</li>
      {/each}
    </ul>

    <h2>{ui.lang === 'es' ? 'Licencias de este proyecto' : 'Licensing of this project'}</h2>
    <p class="lic">{@html LICENSING[ui.lang]}</p>
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
    font-size: 14px;
    font-weight: 600;
    margin: 14px 0 6px;
    padding-top: 10px;
    border-top: 1px solid var(--hairline-soft);
  }

  ul {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  li,
  .lic {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--paper-dim);
    margin: 0;
  }

  li :global(strong) {
    color: var(--paper);
    font-weight: 600;
  }

  li :global(a),
  .lic :global(a) {
    color: var(--gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(201, 162, 39, 0.35);
  }

  li :global(a:hover),
  .lic :global(a:hover) {
    border-bottom-color: var(--gold);
  }
</style>

// Hand-rolled ES/EN dictionary. ES is the primary language of the archive;
// EN is a full mirror. `ui.lang` is reactive — t() calls re-evaluate in markup.

export type Lang = 'es' | 'en';

export const ui = $state({ lang: 'es' as Lang });

const dict: Record<string, { es: string; en: string }> = {
  title: { es: 'La violencia y el voto', en: 'Violence and the Vote' },
  eyebrow: { es: 'Archivo cartográfico · Colombia 1958–2026', en: 'Cartographic archive · Colombia 1958–2026' },
  subtitle: {
    es: 'Conflicto armado y elecciones, municipio por municipio',
    en: 'Armed conflict and elections, municipality by municipality',
  },
  tab_violence: { es: 'Violencia', en: 'Violence' },
  tab_elections: { es: 'Elecciones', en: 'Elections' },
  loading: { es: 'Abriendo el archivo…', en: 'Opening the archive…' },
  load_error: { es: 'Error al cargar los datos', en: 'Failed to load data' },

  presidencia: { es: 'Presidencia', en: 'Presidency' },
  senado: { es: 'Senado', en: 'Senate' },
  camara: { es: 'Cámara', en: 'Chamber' },

  all_years: { es: 'Todo el periodo', en: 'Entire period' },
  play: { es: 'Reproducir', en: 'Play' },
  pause: { es: 'Pausa', en: 'Pause' },
  year: { es: 'Año', en: 'Year' },
  events_in: { es: 'casos en', en: 'cases in' },
  events_total: { es: 'casos en total', en: 'cases in total' },
  all: { es: 'Todas', en: 'All' },
  none: { es: 'Ninguna', en: 'None' },

  modalities: { es: 'Modalidades de violencia', en: 'Forms of violence' },
  winner_party: { es: 'Partido más votado por municipio', en: 'Most-voted party by municipality' },
  munis_won: { es: 'municipios', en: 'municipalities' },
  senate_note: {
    es: 'Senado desde 1991 es circunscripción nacional: se muestra el partido más votado localmente, no un ganador de curul.',
    en: 'Since 1991 the Senate is a national constituency: the map shows the locally most-voted party, not a seat winner.',
  },
  consulados_note: {
    es: 'El voto en el exterior (consulados) no se muestra en el mapa.',
    en: 'Votes cast abroad (consulates) are not shown on the map.',
  },

  integrity_title: { es: 'Registro de exclusiones', en: 'Exclusion record' },
  undated_note: {
    es: 'casos sin año conocido quedan fuera de la línea de tiempo',
    en: 'cases with unknown year are outside the timeline',
  },
  nomuni_note: {
    es: 'casos sin municipio precisable no se ubican en el mapa',
    en: 'cases without an identifiable municipality are not placed on the map',
  },
  never_imputed: {
    es: 'Ningún dato faltante se estima ni se imputa.',
    en: 'No missing value is ever estimated or imputed.',
  },

  // tooltip labels
  record: { es: 'Registro CNMH', en: 'CNMH record' },
  date: { es: 'Fecha', en: 'Date' },
  date_unknown_day: { es: 'día exacto desconocido', en: 'exact day unknown' },
  municipality: { es: 'Municipio', en: 'Municipality' },
  modality: { es: 'Modalidad', en: 'Type' },
  victims: { es: 'Víctimas', en: 'Victims' },
  responsible: { es: 'Presunto responsable', en: 'Alleged perpetrator' },
  party: { es: 'Partido', en: 'Party' },
  candidate: { es: 'Candidato', en: 'Candidate' },
  votes: { es: 'votos', en: 'votes' },
  of_votes: { es: 'de', en: 'of' },
  unknown: { es: 'Sin información', en: 'No information' },

  sources: { es: 'Fuentes', en: 'Sources' },
  round_1: { es: '1ª vuelta', en: 'first round' },
  round_2: { es: '2ª vuelta', en: 'runoff' },
};

/** localized election label (the pipeline `label` field is Spanish-only) */
export function electionLabel(e: { year: number; round: number }): string {
  return e.round === 0 ? String(e.year) : `${e.year} · ${t(`round_${e.round}`)}`;
}

export function t(key: string): string {
  const entry = dict[key];
  if (!entry) return key;
  return entry[ui.lang];
}

// Curated short display names per modality code (raw names are shouty/long).
const MODALITY_NAMES: Record<string, { es: string; en: string }> = {
  MA: { es: 'Masacres', en: 'Massacres' },
  AS: { es: 'Asesinatos selectivos', en: 'Selective killings' },
  DF: { es: 'Desaparición forzada', en: 'Forced disappearance' },
  SE: { es: 'Secuestro', en: 'Kidnapping' },
  RU: { es: 'Reclutamiento de menores', en: 'Child recruitment' },
  MI: { es: 'Minas antipersonal', en: 'Landmines' },
  VS: { es: 'Violencia sexual', en: 'Sexual violence' },
  AT: { es: 'Atentados terroristas', en: 'Terrorist attacks' },
  AP: { es: 'Ataques a poblados', en: 'Attacks on towns' },
  AB: { es: 'Acciones bélicas', en: 'Combat actions' },
  DB: { es: 'Daño a bienes civiles', en: 'Damage to civilian property' },
};

export function modalityName(code: string): string {
  const entry = MODALITY_NAMES[code];
  return entry ? entry[ui.lang] : code;
}

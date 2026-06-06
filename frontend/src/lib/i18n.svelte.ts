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

  // memoria view
  tab_memoria: { es: 'Memoria', en: 'Memory' },
  memoria_field: {
    es: 'Campo político (resultados recientes ponderados)',
    en: 'Political field (weighted recent results)',
  },
  lr_left: { es: 'izquierda', en: 'left' },
  lr_right: { es: 'derecha', en: 'right' },
  no_data: { es: 'sin datos', en: 'no data' },
  low_coverage: {
    es: 'atenuado: menos del 50 % del voto tiene partido clasificado',
    en: 'dimmed: under 50% of the vote has a classified party',
  },
  wounds_title: { es: 'Masacres', en: 'Massacres' },
  wound_fresh: { es: 'masacre reciente', en: 'recent massacre' },
  wound_healing: { es: 'se desvanece en ~3 años', en: 'fades over ~3 years' },
  wound_scar: { es: 'cicatriz permanente', en: 'permanent scar' },
  victims_area: { es: 'área ∝ víctimas', en: 'area ∝ victims' },
  memoria_method_title: { es: 'Método', en: 'Method' },
  memoria_method: {
    es: 'El color de cada municipio pondera sus elecciones pasadas: cada una entra gradualmente durante un año y decae con vida media de ~8 años, según la posición izquierda–derecha ponderada por votos (escala de 5 puntos con cita por partido; las coaliciones derivadas toman el promedio de sus miembros clasificados). Partidos sin clasificación citable quedan fuera y se publica la cobertura. Las masacres aparecen en su fecha exacta.',
    en: 'Each municipality’s colour weights its past elections: each enters gradually over one year and decays with a ~8-year half-life, using the vote-weighted left–right position (5-point scale with one citation per party; derived coalitions take the mean of their classified members). Parties without a citable classification are excluded and coverage is published. Massacres appear on their exact date.',
  },
  fn_banner: {
    es: 'Frente Nacional: elección de consenso — un partido tradicional no compitió; el campo político refleja el pacto, no la preferencia local.',
    en: 'National Front: consensus election — one traditional party did not run; the field reflects the pact, not local preference.',
  },
  speed: { es: 'Velocidad', en: 'Speed' },
  political_score: { es: 'Posición ponderada', en: 'Weighted position' },
  coverage: { es: 'Cobertura', en: 'Coverage' },
  based_on: { es: 'Ponderado de', en: 'Weighted from' },
  no_data_yet: { es: 'Sin elecciones aún', en: 'No elections yet' },
  massacre: { es: 'Masacre', en: 'Massacre' },
  date_known_year: {
    es: 'casos con año conocido pero fecha exacta desconocida aparecen solo como cicatriz al cierre de su año, nunca como herida',
    en: 'cases with a known year but unknown exact date appear only as a scar once their year closes, never as a wound',
  },
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

// Hand-rolled ES/EN dictionary. ES is the primary language of the archive;
// EN is a full mirror. `ui.lang` is reactive — t() calls re-evaluate in markup.

export type Lang = 'es' | 'en';

// ?lang=en|es in the URL overrides the ES default, so a shared link opens in
// that language directly.
function initialLang(): Lang {
  const p = new URLSearchParams(location.search).get('lang');
  return p === 'en' || p === 'es' ? p : 'es';
}

export const ui = $state({ lang: initialLang() });

/** switch language and keep ?lang= in the address bar so the URL stays shareable */
export function setLang(lang: Lang) {
  ui.lang = lang;
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
}

export function toggleLang() {
  setLang(ui.lang === 'es' ? 'en' : 'es');
}

const dict: Record<string, { es: string; en: string }> = {
  title: { es: 'Cicatrices de violencia', en: 'Scars of Violence' },
  eyebrow: { es: 'Archivo cartográfico · Colombia 1958–2026', en: 'Cartographic archive · Colombia 1958–2026' },
  subtitle: {
    es: 'El conflicto armado, municipio por municipio',
    en: 'The armed conflict, municipality by municipality',
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
  participants: { es: 'Participantes', en: 'Participants' },
  initiative: { es: 'Iniciativa', en: 'Initiative' },
  party: { es: 'Partido', en: 'Party' },
  candidate: { es: 'Candidato', en: 'Candidate' },
  votes: { es: 'votos', en: 'votes' },
  of_votes: { es: 'de', en: 'of' },
  unknown: { es: 'Sin información', en: 'No information' },
  n_more: { es: 'más', en: 'more' },

  // detail panel
  view_geoportal: { es: 'Ver en el Geoportal del CNMH', en: 'View on the CNMH Geoportal' },
  license: { es: 'Licencia', en: 'License' },
  dataset: { es: 'Conjunto de datos', en: 'Dataset' },
  // header count is time-anchored to the click-time timeline month (app.selectedDay)
  cases_through: { es: 'casos hasta', en: 'cases through' },
  cases_through_one: { es: 'caso hasta', en: 'case through' },
  record_no: { es: 'N.º', en: 'no.' },
  close: { es: 'Cerrar', en: 'Close' },

  // event annotation modal ("Read more…")
  read_more: { es: 'Leer más', en: 'Read more' },
  story_eyebrow: { es: 'Narrativa documentada', en: 'Documented narrative' },
  story_record: { es: 'CNMH · Registro', en: 'CNMH · Record' },
  story_under_review: { es: 'Cifras en revisión', en: 'Figures under review' },
  story_review_note: {
    es: 'Las fuentes difieren en el número de víctimas de este evento; la cifra que se muestra es la registrada por el CNMH. Entrada pendiente de revisión editorial.',
    en: 'Sources differ on this event’s victim count; the figure shown is the one recorded by the CNMH. Entry pending editorial review.',
  },

  // victim portrait (detail panel)
  victims_portrait: { es: 'Las víctimas', en: 'The victims' },
  civilians: { es: 'civiles', en: 'civilians' },
  combatants: { es: 'combatientes', en: 'combatants' },
  recorded_individually: {
    es: 'registradas individualmente',
    en: 'recorded individually',
  },
  sex_label: { es: 'Sexo', en: 'Sex' },
  // tally nouns come in singular (key + '_one') / plural (key) pairs so counts agree
  civilians_one: { es: 'civil', en: 'civilian' },
  combatants_one: { es: 'combatiente', en: 'combatant' },
  men: { es: 'hombres', en: 'men' },
  men_one: { es: 'hombre', en: 'man' },
  women: { es: 'mujeres', en: 'women' },
  women_one: { es: 'mujer', en: 'woman' },
  unrecorded: { es: 'sin registrar', en: 'unrecorded' },
  unrecorded_one: { es: 'sin registrar', en: 'unrecorded' },
  age_where_known: { es: 'Edad (donde se conoce)', en: 'Age (where known)' },
  age_children: { es: 'niños', en: 'children' },
  age_children_one: { es: 'niño', en: 'child' },
  age_adolescents: { es: 'adolescentes', en: 'adolescents' },
  age_adolescents_one: { es: 'adolescente', en: 'adolescent' },
  age_adults: { es: 'adultos', en: 'adults' },
  age_adults_one: { es: 'adulto', en: 'adult' },
  age_elderly: { es: 'personas mayores', en: 'older people' },
  age_elderly_one: { es: 'persona mayor', en: 'older person' },
  outcome_label: { es: 'Desenlace', en: 'Outcome' },
  fatal: { es: 'mortales', en: 'fatal' },
  fatal_one: { es: 'mortal', en: 'fatal' },
  nonfatal: { es: 'no mortales', en: 'non-fatal' },
  nonfatal_one: { es: 'no mortal', en: 'non-fatal' },
  occupation_top: { es: 'Ocupación más frecuente', en: 'Most frequent occupation' },
  recorded_individually_one: {
    es: 'registrada individualmente',
    en: 'recorded individually',
  },
  portrait_caption: {
    es: 'Conteos de las víctimas registradas una por una en el archivo; los atributos en blanco no se cuentan ni se estiman.',
    en: 'Tallies of victims recorded one by one in the archive; blank attributes are neither counted nor estimated.',
  },

  sources: { es: 'Fuentes', en: 'Sources' },
  credits_btn: { es: 'créditos y avisos', en: 'credits & notices' },

  // welcome modal (first-visit onboarding; reopened via the "?" button)
  welcome_eyebrow: { es: 'Cómo leer este artefacto', en: 'How to read this artifact' },
  welcome_what: {
    es: 'Este mapa presenta los eventos de violencia del conflicto armado colombiano documentados por el Centro Nacional de Memoria Histórica, 1958–2026. Cada evento aparece en su fecha como una herida que se extiende sobre el territorio; con los años se desvanece y deja una cicatriz permanente. Nada se estima: cada punto es un caso documentado, con su registro citado.',
    en: "This map presents the violence of Colombia's armed conflict as documented by the National Center for Historical Memory, 1958–2026. Each event appears on its date as a wound spreading across the territory; over the years it fades, leaving a permanent scar. Nothing is estimated: every point is a documented case with its cited record.",
  },
  welcome_how_play: {
    es: 'Pulse ▶ o arrastre la línea de tiempo para recorrer los años.',
    en: 'Press ▶ or drag the timeline to move through the years.',
  },
  welcome_how_legend: {
    es: 'Active o desactive las modalidades de violencia en el panel izquierdo.',
    en: 'Toggle the forms of violence in the left panel.',
  },
  welcome_how_hover: {
    es: 'Pase el cursor sobre un evento para un resumen; haga clic para abrir el registro completo.',
    en: 'Hover over an event for a summary; click to open the full record.',
  },
  welcome_how_lang: {
    es: 'Cambie de idioma con el botón ES/EN.',
    en: 'Switch languages with the ES/EN button.',
  },
  welcome_dignity: {
    es: 'Este archivo registra víctimas reales. Se publica con fines de memoria, investigación y educación.',
    en: 'This archive records real victims. It is published for memory, research and education.',
  },
  welcome_enter: { es: 'Entrar al archivo', en: 'Enter the archive' },
  about_btn: { es: 'Acerca de este mapa', en: 'About this map' },
  hint_play: { es: 'Pulse ▶ para recorrer los años', en: 'Press ▶ to move through the years' },
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
  no_data: { es: 'transparente: centro o sin datos', en: 'transparent: centre or no data' },
  low_coverage: {
    es: 'atenuado: menos del 50 % del voto tiene partido clasificado',
    en: 'dimmed: under 50% of the vote has a classified party',
  },
  wounds_title: { es: 'Heridas en el tiempo', en: 'Wounds over time' },
  wound_fresh: { es: 'evento reciente', en: 'recent event' },
  wound_healing: { es: 'se desvanece en ~3 años', en: 'fades over ~3 years' },
  wound_scar: { es: 'cicatriz permanente', en: 'permanent scar' },
  wound_tendrils: {
    es: 'sangre que se extiende desde cada evento y cicatriza',
    en: 'blood spreading from each event, scarring permanently',
  },
  victims_area: { es: 'área ∝ víctimas', en: 'area ∝ victims' },
  memoria_method_title: { es: 'Método', en: 'Method' },
  memoria_method_massacres: {
    es: 'Cada evento aparece en su fecha exacta como una herida cuya área es proporcional a las víctimas; la herida se desvanece en ~3 años y deja una cicatriz permanente. La cantidad de sangre que se extiende sigue al número de víctimas. Fuente: CNMH/SIEVCAC, con cita por registro.',
    en: 'Each event appears on its exact date as a wound whose area is proportional to its victims; the wound fades over ~3 years into a permanent scar. The amount of blood that spreads follows the number of victims. Source: CNMH/SIEVCAC, with a citation per record.',
  },
  memoria_method: {
    es: 'El color de cada municipio pondera sus elecciones pasadas: cada una entra gradualmente durante un año y decae con vida media de ~8 años, según la posición izquierda–derecha ponderada por votos (escala de 5 puntos con cita por partido; las coaliciones derivadas toman el promedio de sus miembros clasificados). La escala es una clasificación académica preliminar, pendiente de revisión. Partidos sin clasificación citable quedan fuera y se publica la cobertura. Las masacres aparecen en su fecha exacta.',
    en: 'Each municipality’s colour weights its past elections: each enters gradually over one year and decays with a ~8-year half-life, using the vote-weighted left–right position (5-point scale with one citation per party; derived coalitions take the mean of their classified members). The scale is a preliminary scholarly classification, pending review. Parties without a citable classification are excluded and coverage is published. Massacres appear on their exact date.',
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

  // landing page (root `/`, no ?section= flag): the gateway to both archives
  landing_eyebrow: {
    es: 'Colombia · dos archivos de la pérdida',
    en: 'Colombia · two archives of loss',
  },
  landing_title: { es: 'Lo que Colombia ha perdido', en: 'What Colombia has lost' },
  landing_sub: {
    es: 'Dos archivos cartográficos: la violencia humana y ecológica.',
    en: "Two cartographic archives: human and ecological violence.",
  },
  landing_enter: { es: 'Entrar', en: 'Enter' },
  landing_file: { es: 'Expediente', en: 'File' },

  // deforestation view
  def_title: { es: 'Cenizas de muerte', en: 'Ashes of death' },
  def_eyebrow: {
    es: 'Pérdida de cobertura arbórea · Colombia 2001–2025',
    en: 'Tree-cover loss · Colombia 2001–2025',
  },
  def_subtitle: {
    es: 'Dónde y cuándo se perdió el bosque',
    en: 'Where and when forest was lost',
  },
  def_cumulative_to: { es: 'Pérdida acumulada hasta', en: 'Cumulative loss through' },
  def_hectares: { es: 'hectáreas', en: 'hectares' },
  def_ha: { es: 'ha', en: 'ha' },
  def_drivers_title: { es: 'Causas por año', en: 'Drivers by year' },
  def_drivers_hint: {
    es: 'Motor dominante 2001–2023 por celda de 1 km (WRI/Google DeepMind).',
    en: 'Dominant driver 2001–2023 per 1 km cell (WRI/Google DeepMind).',
  },
  def_lens_agri: { es: 'Agricultura', en: 'Agriculture' },
  def_lens_legality: { es: 'Legalidad', en: 'Legality' },
  def_lens_drivers: { es: 'Motores (WRI)', en: 'Drivers (WRI)' },
  def_mode_year: { es: 'Año', en: 'Year' },
  def_mode_total: { es: 'Acumulado', en: 'Cumulative' },
  def_bucket_hide: { es: 'Clic para ocultar en el mapa', en: 'Click to hide on map' },
  def_bucket_show: { es: 'Clic para mostrar en el mapa', en: 'Click to show on map' },
  def_legality_hint: {
    es: 'Pérdida dentro de áreas protegidas (RUNAP) y reservas de Ley 2ª. Clasificación zonal, no un fallo jurídico.',
    en: 'Loss inside protected areas (RUNAP) and Ley 2ª reserves. Zonal classification, not a legal verdict.',
  },
  def_agri_hint: {
    es: 'Cobertura del suelo despejado (CORINE 2022) + coca (SIMCI). Pasto ≈ ganadería.',
    en: 'Land cover of cleared land (CORINE 2022) + coca (SIMCI). Pasture ≈ cattle ranching.',
  },
  def_agri_vintage: {
    es: 'Reparto según la cobertura de 2022, no el año del corte: una celda despejada en 2004 se clasifica por lo que era en 2022. Una sola clase por celda (~700 m); el pasto gana los empates. Cifras indicativas del orden, no hectáreas exactas.',
    en: 'Buckets reflect 2022 cover, not the year of clearing: a cell cleared in 2004 is classed by what it was in 2022. One class per ~700 m cell; pasture wins ties. Figures indicate ordering, not exact hectares.',
  },
  // Per-lens provenance caveats (bilingual; previously baked single-language in
  // deforestation.json meta and shown regardless of UI language).
  def_cav_drivers: {
    es: 'Motor de pérdida de cobertura arbórea por celda de 1 km (WRI/Google DeepMind), una ÚNICA clase dominante para 2001–2023 — no un muestreo anual. La variación año a año refleja solo CUÁNDO ocurrió la pérdida, atribuida al motor dominante del periodo en cada lugar. Clases globales genéricas, no los motores específicos de Colombia del IDEAM; motores de pérdida de cobertura (definición Hansen), no deforestación del IDEAM.',
    en: "Driver of tree-cover loss per 1 km cell (WRI/Google DeepMind), a SINGLE dominant class for 2001–2023 — not a per-year survey. Year-to-year change reflects only WHEN loss occurred, attributed to each location's period-dominant driver. Generic global classes, not IDEAM's Colombia-specific drivers; tree-cover-loss drivers (Hansen definition), not IDEAM deforestation.",
  },
  def_cav_agkind: {
    es: 'COBERTURA posterior del suelo (CORINE Land Cover, IDEAM, 2022) de las celdas despejadas — un proxy del USO del suelo, NO el agente del corte: muestra lo que la tierra ES hoy, no quién la taló. «Pastos» es cobertura de pasto, un proxy fuerte pero indirecto de la ganadería, nunca una prueba. Escala 1:100.000, unidad mínima 25 ha: el corte pequeño o fragmentado queda subresuelto. Cobertura leída contra una única fecha de 2022. CORINE clasifica la coca como cultivo permanente, así que la coca que alcanza a mapear se cuenta en «Cultivos»; las parcelas más pequeñas quedan bajo la unidad mínima y se reparten sin etiqueta entre las tres clases.',
    en: 'Subsequent land COVER (CORINE Land Cover, IDEAM, 2022) of cleared cells — a proxy for land USE, NOT the clearing agent: it shows what the land IS now, not who cut it. «Pastos» is grass cover, a strong but indirect proxy for cattle ranching, never proof of it. Scale 1:100,000, minimum mapping unit 25 ha: small or fragmented clearing is under-resolved. Cover read against a single 2022 vintage. CORINE maps coca as a permanent crop, so any coca it resolves is counted under «Cultivos»; smaller coca plots fall below the mapping unit and scatter unlabeled across all three classes.',
  },
  def_cav_legality: {
    es: 'Clasificación ZONAL, no un fallo jurídico: «dentro de un parque / reserva» significa uso del suelo NO permitido ALLÍ, nunca un veredicto contra una persona (no se observan permisos ni derechos por píxel). Los límites son de una sola fecha (RUNAP vigente; zonas de Ley 2ª de 1959) y se contrastan con pérdida de 2001–2025 — fecha etiquetada, jamás presentada como hecho anacrónico. Excluye la frontera agrícola UPRA y resguardos (MVP).',
    en: 'ZONAL classification, not a legal ruling: «inside a park / reserve» means land use NOT permitted THERE, never a verdict against a person (permits and rights are not observed per pixel). Boundaries are single-vintage (current RUNAP; Ley 2ª zones of 1959) and contrasted with 2001–2025 loss — vintage labeled, never presented as an anachronistic fact. Excludes the UPRA agricultural frontier and resguardos (MVP).',
  },
  def_cav_definition: {
    es: 'La PÉRDIDA de cobertura arbórea de Hansen incluye plantaciones, incendios y pérdida natural, y NO equivale a la deforestación del IDEAM (conversión permanente de bosque natural). Las dos series nacionales difieren por definición.',
    en: 'Hansen tree-cover LOSS includes plantations, fire and natural loss and is NOT the same as IDEAM deforestation (permanent natural-forest conversion). The two national series differ by definition.',
  },
  def_coca_overlay: { es: 'presencia · 1 km, no comparable', en: 'presence · 1 km, not comparable' },
  def_coca_note: {
    es: 'Área de coca monitoreada (SIMCI/UNODC), un stock anual — no es pérdida de bosque ni una cobertura, por eso no se ordena junto a las clases de arriba. El mapa resalta la pérdida que coincide con celdas con coca: correlación de presencia, no causa.',
    en: 'Monitored coca area (SIMCI/UNODC), an annual stock — not forest loss and not a land cover, so it is not ranked beside the classes above. The map highlights loss coinciding with coca cells: presence-correlation, not cause.',
  },
  def_cattle: { es: 'Inventario bovino (ICA)', en: 'Cattle inventory (ICA)' },
  def_cattle_head: { es: 'cabezas', en: 'head' },
  def_causes_title: { es: 'Ranking cualitativo IDEAM', en: 'IDEAM qualitative ranking' },
  def_causes_disclaimer: {
    es: 'Orden estimado según IDEAM — no es una proporción medida. Las causas y los actores se atribuyen a nivel regional (IDEAM SMByC, FCDS, MAAP), no por píxel. Pendiente de revisión.',
    en: 'Estimated ordering per IDEAM — not a measured proportion. Drivers and actors are attributed regionally (IDEAM SMByC, FCDS, MAAP), not per pixel. Pending review.',
  },
  def_disclaimers_title: { es: 'Advertencias', en: 'Disclaimers' },
  def_method_title: { es: 'Método', en: 'Method' },
  def_method: {
    es: 'Cada celda muestra el año más temprano de pérdida de cobertura arbórea (Hansen/UMD, 30 m, remuestreado para visualización). La pérdida de Hansen NO equivale a la deforestación del IDEAM (definiciones distintas). Las hectáreas por municipio se cuentan de los píxeles de 30 m, unidas por código DANE. Nada se estima ni se imputa.',
    en: 'Each cell shows the earliest year of tree-cover loss (Hansen/UMD, 30 m, resampled for display). Hansen loss is NOT the same as IDEAM deforestation (different definitions). Per-municipio hectares are counted from the 30 m pixels, joined on DANE code. Nothing is estimated or imputed.',
  },
  def_ideam_ref: { es: 'Referencia IDEAM (deforestación)', en: 'IDEAM reference (deforestation)' },
  def_hansen_series: { es: 'Hansen (pérdida de cobertura)', en: 'Hansen (tree-cover loss)' },
  def_total_muni: { es: 'Pérdida acumulada', en: 'Cumulative loss' },
  def_loss_in: { es: 'Pérdida en', en: 'Loss in' },
  def_no_loss_muni: { es: 'Sin pérdida registrada', en: 'No recorded loss' },
  def_click_hint: {
    es: 'Haga clic en un municipio para ver su pérdida anual.',
    en: 'Click a municipality to see its annual loss.',
  },
  def_welcome_how_legend: {
    es: 'Cambie de lente — Agricultura, Legalidad, Motores — y pase el cursor sobre una clase para resaltarla en el mapa; haga clic para ocultarla.',
    en: 'Switch lenses — Agriculture, Legality, Drivers — and hover a class to spotlight it on the map; click to hide it.',
  },
  def_welcome_what: {
    es: 'Este mapa muestra la pérdida de cobertura arbórea en Colombia, 2001–2025, según los datos satelitales de Hansen/UMD (Global Forest Change). Cada celda aparece en el año más temprano en que se detectó pérdida. La pérdida de cobertura arbórea no equivale a la deforestación oficial del IDEAM: incluye plantaciones, incendios y pérdida natural. Los actores y las causas se atribuyen a nivel regional, no por píxel.',
    en: 'This map shows tree-cover loss in Colombia, 2001–2025, from Hansen/UMD satellite data (Global Forest Change). Each cell appears in the earliest year loss was detected. Tree-cover loss is not the same as IDEAM official deforestation: it includes plantations, fire and natural loss. Actors and drivers are attributed regionally, not per pixel.',
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

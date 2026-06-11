// Narrative sentence builder for the click detail panel. Each card renders one
// prose sentence per event instead of a stat grid. Integrity rule: a clause may
// only assert what the CNMH record supports — death only where definitional to
// the modality (MA, AS) or recorded (MI via nFatal/nNonFatal), sex/age only
// when exactly one victim is recorded with exactly one value, and every
// attribution carries "(presunto)" / "alleged". Missing values drop the clause;
// nothing is estimated.
//
// Pure functions: `lang` is passed explicitly; reactivity comes from the
// caller ($derived in DetailPanel reads ui.lang and the lazy details prop).

import type { ViolenceData, ViolenceDetails, Munis } from './data';
import { formatDay, formatInt } from './data';
import type { Lang } from './i18n.svelte';
import { modalityName } from './i18n.svelte';
import { muniLabel, isRealGroup } from './eventFormat';

// Grammatical gender of the chosen ES noun phrase — NOT the victim's sex.
// Participles agree with the noun: "una persona fue asesinada" is feminine
// agreement even for a male victim, because "persona" is a feminine noun.
type GG = 'm' | 'f';

interface Subject {
  es: string;
  en: string;
  g: GG;
  pl: boolean;
  digit: boolean; // starts with a numeral — ES inserts a comma after the date
}

/** ES past participle with noun agreement: pp('asesinad', s) → asesinado/a/os/as */
const pp = (stem: string, s: Subject) => stem + (s.g === 'm' ? 'o' : 'a') + (s.pl ? 's' : '');
const fue = (s: Subject) => (s.pl ? 'fueron' : 'fue');
const murio = (s: Subject) => (s.pl ? 'murieron' : 'murió');
const resulto = (s: Subject) => (s.pl ? 'resultaron' : 'resultó');

type AgeBucket = 'child' | 'adolescent' | 'adult' | 'elder';

// Single-victim subject. Sex is asserted only when exactly one of male/female
// is recorded; the age bucket only when exactly one bucket holds the victim.
function singleSubject(details: ViolenceDetails | null, gi: number): Subject {
  const unk: Subject = { es: 'una persona', en: 'a person', g: 'f', pl: false, digit: false };
  if (!details) return unk;
  const male = details.nMale[gi] === 1 && details.nFemale[gi] === 0;
  const female = details.nFemale[gi] === 1 && details.nMale[gi] === 0;
  const counts = [
    details.nChild[gi],
    details.nAdolescent[gi],
    details.nAdult[gi],
    details.nElder[gi],
  ];
  const buckets: AgeBucket[] = ['child', 'adolescent', 'adult', 'elder'];
  const age: AgeBucket | null =
    counts.filter((n) => n > 0).length === 1 && counts.some((n) => n === 1)
      ? buckets[counts.findIndex((n) => n === 1)]
      : null;

  // combatant status replaces the noun outright
  if (details.comb[gi] === 1) {
    if (male) return { es: 'un combatiente', en: 'a combatant', g: 'm', pl: false, digit: false };
    if (female)
      return { es: 'una combatiente', en: 'a combatant', g: 'f', pl: false, digit: false };
    return { es: 'una persona combatiente', en: 'a combatant', g: 'f', pl: false, digit: false };
  }

  if (age === 'child') {
    if (male) return { es: 'un niño', en: 'a boy', g: 'm', pl: false, digit: false };
    if (female) return { es: 'una niña', en: 'a girl', g: 'f', pl: false, digit: false };
    return { es: 'una persona menor de edad', en: 'a child', g: 'f', pl: false, digit: false };
  }
  if (age === 'adolescent') {
    if (male) return { es: 'un adolescente', en: 'an adolescent', g: 'm', pl: false, digit: false };
    if (female)
      return { es: 'una adolescente', en: 'an adolescent', g: 'f', pl: false, digit: false };
    return { es: 'una persona adolescente', en: 'an adolescent', g: 'f', pl: false, digit: false };
  }
  if (age === 'elder') {
    if (male)
      return { es: 'un hombre mayor', en: 'an elderly man', g: 'm', pl: false, digit: false };
    if (female)
      return { es: 'una mujer mayor', en: 'an elderly woman', g: 'f', pl: false, digit: false };
    return { es: 'una persona mayor', en: 'an elderly person', g: 'f', pl: false, digit: false };
  }

  // adult or unknown age; the "civil" qualifier applies only here — "un niño
  // civil" is unnatural and civilian status is near-definitional for minors
  const civ = details.civ[gi] === 1;
  if (male)
    return civ
      ? { es: 'un hombre civil', en: 'a civilian man', g: 'm', pl: false, digit: false }
      : { es: 'un hombre', en: 'a man', g: 'm', pl: false, digit: false };
  if (female)
    return civ
      ? { es: 'una mujer civil', en: 'a civilian woman', g: 'f', pl: false, digit: false }
      : { es: 'una mujer', en: 'a woman', g: 'f', pl: false, digit: false };
  return civ
    ? { es: 'una persona civil', en: 'a civilian', g: 'f', pl: false, digit: false }
    : unk;
}

// Multi-victim subject. Attributes are asserted only when they cover ALL N
// victims (homogeneous per the record); anything mixed or unloaded → "personas".
function multiSubject(n: number, details: ViolenceDetails | null, gi: number): Subject {
  const nEs = formatInt(n, 'es');
  const nEn = formatInt(n, 'en');
  if (details) {
    if (details.comb[gi] === n)
      return { es: `${nEs} combatientes`, en: `${nEn} combatants`, g: 'm', pl: true, digit: true };
    const civ = details.civ[gi] === n;
    if (details.vn[gi] === n && details.nFemale[gi] === n)
      return civ
        ? { es: `${nEs} mujeres civiles`, en: `${nEn} civilian women`, g: 'f', pl: true, digit: true }
        : { es: `${nEs} mujeres`, en: `${nEn} women`, g: 'f', pl: true, digit: true };
    if (details.vn[gi] === n && details.nMale[gi] === n)
      return civ
        ? { es: `${nEs} hombres civiles`, en: `${nEn} civilian men`, g: 'm', pl: true, digit: true }
        : { es: `${nEs} hombres`, en: `${nEn} men`, g: 'm', pl: true, digit: true };
    if (civ)
      return { es: `${nEs} civiles`, en: `${nEn} civilians`, g: 'm', pl: true, digit: true };
  }
  return { es: `${nEs} personas`, en: `${nEn} people`, g: 'f', pl: true, digit: true };
}

// Verb phrase per subject-framed modality (MA AS DF SE RU MI VS). Death is
// asserted only where definitional (massacre, asesinato) or recorded (MI).
function verbPhrase(
  code: string,
  s: Subject,
  details: ViolenceDetails | null,
  gi: number,
  n: number
): { es: string; en: string } {
  const was = s.pl ? 'were' : 'was';
  switch (code) {
    case 'MA':
      return {
        es: `${fue(s)} ${pp('asesinad', s)} en una masacre`,
        en: `${was} killed in a massacre`,
      };
    case 'AS':
      return { es: `${murio(s)} ${pp('asesinad', s)}`, en: `${was} killed` };
    case 'DF':
      return {
        es: `${fue(s)} ${pp('desaparecid', s)} forzadamente`,
        en: `${was} forcibly disappeared`,
      };
    case 'SE':
      return { es: `${fue(s)} ${pp('secuestrad', s)}`, en: `${was} kidnapped` };
    case 'RU':
      // mirrors the dataset's "reclutamiento ilícito"; "forzosamente" is not asserted
      return {
        es: `${fue(s)} ${pp('reclutad', s)} ilícitamente`,
        en: `${was} unlawfully recruited`,
      };
    case 'MI': {
      if (details && details.nFatal[gi] === n)
        return {
          es: `${murio(s)} a causa de una mina antipersonal`,
          en: `${was} killed by an antipersonnel mine`,
        };
      if (details && details.nNonFatal[gi] === n)
        return {
          es: `${resulto(s)} ${pp('herid', s)} por una mina antipersonal`,
          en: `${was} wounded by an antipersonnel mine`,
        };
      return {
        es: `${fue(s)} víctima${s.pl ? 's' : ''} de una mina antipersonal`,
        en: s.pl
          ? 'were victims of an antipersonnel mine'
          : 'was the victim of an antipersonnel mine',
      };
    }
    case 'VS':
      return {
        es: `${fue(s)} víctima${s.pl ? 's' : ''} de violencia sexual`,
        en: s.pl ? 'were victims of sexual violence' : 'was a victim of sexual violence',
      };
    default:
      // unreachable for current codes; assert nothing beyond victimhood
      return {
        es: `${fue(s)} víctima${s.pl ? 's' : ''} de la violencia`,
        en: s.pl ? 'were victims of violence' : 'was a victim of violence',
      };
  }
}

// Event-framed core for AT AP AB DB — and the guard for any modality recorded
// with zero victims, where a victim-subject sentence would assert too much.
function eventPhrase(code: string, n: number, lang: Lang): string {
  const nn = formatInt(n, lang);
  const vEs = `dejó ${nn} víctima${n === 1 ? '' : 's'}`;
  const vEn = `left ${nn} victim${n === 1 ? '' : 's'}`;
  switch (code) {
    case 'AT':
      if (n > 0)
        return lang === 'es' ? `un atentado terrorista ${vEs}` : `a terrorist attack ${vEn}`;
      return lang === 'es' ? 'se registró un atentado terrorista' : 'a terrorist attack was recorded';
    case 'AP':
      if (n > 0)
        return lang === 'es' ? `un ataque a la población ${vEs}` : `an attack on a town ${vEn}`;
      return lang === 'es' ? 'se registró un ataque a la población' : 'an attack on a town was recorded';
    case 'AB':
      if (n > 0) return lang === 'es' ? `una acción bélica ${vEs}` : `a combat action ${vEn}`;
      return lang === 'es' ? 'se registró una acción bélica' : 'a combat action was recorded';
    case 'DB':
      if (n > 0)
        return lang === 'es'
          ? `un evento de daño a bienes civiles ${vEs}`
          : `an incident of damage to civilian property ${vEn}`;
      return lang === 'es'
        ? 'se registró daño a bienes civiles'
        : 'damage to civilian property was recorded';
    default:
      // subject-framed modality recorded with zero victims. modalityName()
      // reads ui.lang, which equals the caller-passed lang in practice.
      return lang === 'es'
        ? `se registró un caso de ${modalityName(code).toLowerCase()}`
        : `a case of ${modalityName(code).toLowerCase()} was recorded`;
  }
}

// Curated prose forms for the 17 SIEVCAC perpetrator categories (raw values
// are uppercase labels, unusable mid-sentence). null = unattributed → the
// sentence states it explicitly rather than staying silent. Combined "A - B"
// categories are worded with "y" on the assumption the CNMH dash denotes
// joint attribution; if the codebook says otherwise, fall back to "A — B".
const PERP_PHRASES: Record<string, { es: string; en: string } | null> = {
  BANDOLERISMO: { es: 'el bandolerismo', en: 'bandolerismo groups' },
  'GRUPO ARMADO NO IDENTIFICADO': {
    es: 'un grupo armado no identificado',
    en: 'an unidentified armed group',
  },
  DESCONOCIDO: null,
  'NO IDENTIFICADO': null,
  'AGENTE DEL ESTADO': { es: 'agentes del Estado', en: 'state agents' },
  GUERRILLA: { es: 'la guerrilla', en: 'guerrilla forces' },
  'GRUPO PARAMILITAR': { es: 'un grupo paramilitar', en: 'a paramilitary group' },
  OTRO: { es: 'otro actor', en: 'another actor' },
  'OTRO ¿CUÁL?': { es: 'otro actor', en: 'another actor' },
  'AGENTE EXTRANJERO': { es: 'un agente extranjero', en: 'a foreign agent' },
  'CRIMEN ORGANIZADO': { es: 'el crimen organizado', en: 'organized crime' },
  'GRUPO POSDESMOVILIZACIÓN': {
    es: 'un grupo posdesmovilización',
    en: 'a post-demobilization group',
  },
  'AGENTE DEL ESTADO - GRUPO PARAMILITAR': {
    es: 'agentes del Estado y un grupo paramilitar',
    en: 'state agents and a paramilitary group',
  },
  'AGENTE DEL ESTADO - GRUPO POSDESMOVILIZACIÓN': {
    es: 'agentes del Estado y un grupo posdesmovilización',
    en: 'state agents and a post-demobilization group',
  },
  'AGENTE DEL ESTADO - GUERRILLA': {
    es: 'agentes del Estado y la guerrilla',
    en: 'state agents and guerrilla forces',
  },
  'GRUPO POSDESMOVILIZACIÓN - GUERRILLA': {
    es: 'un grupo posdesmovilización y la guerrilla',
    en: 'a post-demobilization group and guerrilla forces',
  },
  'GRUPO PARAMILITAR - GUERRILLA': {
    es: 'un grupo paramilitar y la guerrilla',
    en: 'a paramilitary group and guerrilla forces',
  },
};

// Prose perpetrator, or null when the record attributes nobody. The specific
// group (FARC, ELN, …) is appended verbatim uppercase — no casing heuristic
// over 76 free-form names (same placeholder filter as responsible() in
// eventFormat.ts). Unmapped future categories fall back to the raw label.
function perpOf(violence: ViolenceData, gi: number, lang: Lang): string | null {
  const catRaw = violence.meta.respCategories[violence.cat[gi]];
  const entry = PERP_PHRASES[catRaw];
  if (entry === null) return null;
  let phrase = entry ? entry[lang] : catRaw;
  const grp = violence.meta.respGroups[violence.grp[gi]];
  if (isRealGroup(grp)) phrase += ` — ${grp}`;
  return phrase;
}

/**
 * One prose sentence for event `gi`, e.g. ES: "El 3 de mayo de 1958 un hombre
 * civil murió asesinado por el bandolerismo (presunto) en Mariquita, Tolima."
 * Degrades gracefully while `details` is null (ungendered subject) and when
 * the municipality or perpetrator is unrecorded (clause dropped / stated).
 */
export function narrativeOf(
  violence: ViolenceData,
  munis: Munis,
  details: ViolenceDetails | null,
  gi: number,
  lang: Lang
): string {
  const code = violence.meta.modalities[violence.modOf[gi]].code;
  const n = violence.victims[gi];

  const exact = formatDay(violence.day[gi], lang);
  const date =
    lang === 'es'
      ? exact
        ? `El ${exact}`
        : `En ${violence.year[gi]}`
      : exact
        ? `On ${exact}`
        : `In ${violence.year[gi]}`;

  const mi = violence.muni[gi];
  // never "en Sin información" — an unplaceable record simply has no clause
  const place = mi !== 0xffff ? `${lang === 'es' ? 'en' : 'in'} ${muniLabel(munis, mi)}` : null;

  const perp = perpOf(violence, gi, lang);
  const noPerpTail =
    lang === 'es' ? '; sin presunto responsable identificado' : '; no alleged perpetrator identified';

  const eventFramed = code === 'AT' || code === 'AP' || code === 'AB' || code === 'DB' || n === 0;
  if (eventFramed) {
    // label form ("presunto responsable: X") carries the allegation without
    // ES participle agreement against the event noun or a+el contractions
    let sent = lang === 'es' ? `${date} ${eventPhrase(code, n, lang)}` : `${date}, ${eventPhrase(code, n, lang)}`;
    if (place) sent += ` ${place}`;
    sent += perp
      ? lang === 'es'
        ? `; presunto responsable: ${perp}`
        : `; alleged perpetrator: ${perp}`
      : noPerpTail;
    return sent + '.';
  }

  const s = n === 1 ? singleSubject(details, gi) : multiSubject(n, details, gi);
  const vp = verbPhrase(code, s, details, gi, n);
  if (lang === 'es') {
    let sent = `${date}${s.digit ? ',' : ''} ${s.es} ${vp.es}`;
    if (perp) sent += ` por ${perp} (presunto)`;
    if (place) sent += ` ${place}`;
    if (!perp) sent += noPerpTail;
    return sent + '.';
  }
  let sent = `${date}, ${s.en} ${vp.en}`;
  if (perp) sent += `, allegedly by ${perp}`;
  if (place) sent += perp ? `, ${place}` : ` ${place}`;
  if (!perp) sent += noPerpTail;
  return sent + '.';
}

/**
 * Whether the statistical victim portrait still carries facts the sentence
 * does not. Occupation never enters the sentence; multi-victim per-victim
 * tallies and mixed compositions do not either. Errs toward showing — the
 * portrait is the archive's transparency device.
 */
export function portraitAddsInfo(
  violence: ViolenceData,
  details: ViolenceDetails | null,
  gi: number
): boolean {
  if (!details) return false;
  if (details.occTop[gi] !== 0xffff) return true;
  const n = violence.victims[gi];
  const code = violence.meta.modalities[violence.modOf[gi]].code;
  if (n > 1) return details.vn[gi] > 0 || (details.civ[gi] > 0 && details.comb[gi] > 0);
  if (n === 1) {
    // event-framed sentences carry no per-victim attributes at all
    if (code === 'AT' || code === 'AP' || code === 'AB' || code === 'DB')
      return details.vn[gi] > 0;
    // subject-framed: sex/age/civ are in the sentence; a recorded outcome adds
    // info except where the verb already states it (MA/AS definitional, MI used)
    return (
      details.nFatal[gi] + details.nNonFatal[gi] > 0 &&
      code !== 'MA' &&
      code !== 'AS' &&
      code !== 'MI'
    );
  }
  return details.vn[gi] > 0;
}

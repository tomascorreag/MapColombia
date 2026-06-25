// Shared event display helpers used by the hover card (MapView) and the click
// detail panel (DetailPanel). Extracted so the muni label and perpetrator
// string are defined once.

import type { ViolenceData, Munis } from './data';
import { t, type Lang } from './i18n.svelte';

/** "{name}, {dept}" for a muni index, or the localized unknown label (0xFFFF). */
export function muniLabel(munis: Munis, idx: number): string {
  if (idx === 0xffff) return t('unknown');
  return `${munis.names[idx]}, ${munis.depts[idx]}`;
}

// Group values that carry no attribution beyond the category (incl. gender
// variants). "GRUPO ARMADO NO DIRIMIDO" / "PRESENCIA GAO SIN ATRIBUCIÓN" stay:
// they assert something about the record, not nothing.
const GROUP_PLACEHOLDERS = new Set(['NO IDENTIFICADO', 'NO IDENTIFICADA', 'NO APLICA', 'OTRO', 'OTRA']);

/** whether a respGroups value is a real attribution rather than a placeholder */
export function isRealGroup(grp: string): boolean {
  return !!grp && !GROUP_PLACEHOLDERS.has(grp);
}

/** alleged perpetrator: category alone, or "category · group" when the group is
 *  a real attribution (not a placeholder). Mirrors the source recoding.
 *  NOTE: not meaningful for AB (acciones bélicas) — there the coded value is the
 *  first combat party (often the attacked force), not a perpetrator; use
 *  abParticipants()/abInitiative() instead. */
export function responsible(violence: ViolenceData, gi: number): string {
  const cat = violence.meta.respCategories[violence.cat[gi]];
  const grp = violence.meta.respGroups[violence.grp[gi]];
  return isRealGroup(grp) ? `${cat} · ${grp}` : cat;
}

const NONE8 = 0xff;

/** Display name for one combat party (cat/grp index pair): the specific group
 *  when it is a real attribution (e.g. "FARC", "EJÉRCITO NACIONAL"), else the
 *  broad category. 255 = no party → null. */
function partyLabel(violence: ViolenceData, ci: number, di: number): string | null {
  if (ci === NONE8) return null;
  const grp = di === NONE8 ? '' : violence.meta.respGroups[di];
  return isRealGroup(grp) ? grp : violence.meta.respCategories[ci];
}

/** AB combat participants: first party (cat/grp) and, when present, the second
 *  party (ga2/grp2). The coding lists the attacked force first; this surfaces
 *  both sides instead of mislabeling one as "responsible". */
export function abParticipants(violence: ViolenceData, gi: number): string[] {
  const out: string[] = [];
  const first = partyLabel(violence, violence.cat[gi], violence.grp[gi]);
  if (first) out.push(first);
  const second = partyLabel(violence, violence.ga2[gi], violence.grp2[gi]);
  if (second) out.push(second);
  return out;
}

// Combat-initiative phrasing keyed by the raw initiatives[] value. "" and
// SIN INFORMACIÓN carry no offensive attribution → null (clause dropped).
const INITIATIVE_PHRASES: Record<string, { es: string; en: string } | null> = {
  '': null,
  'SIN INFORMACIÓN': null,
  'FUERZAS ARMADAS ESTATALES': {
    es: 'ofensiva de la fuerza pública',
    en: 'offensive by state forces',
  },
  'GRUPOS ARMADOS ORGANIZADOS': {
    es: 'ofensiva de un grupo armado organizado',
    en: 'offensive by an organized armed group',
  },
  NINGUNO: { es: 'sin ofensiva atribuida', en: 'no attributed offensive' },
  OTRO: { es: 'otra iniciativa', en: 'other initiative' },
};

/** Which side took the offensive in an AB combat event, as a localized phrase,
 *  or null when unrecorded/not applicable. */
export function abInitiative(violence: ViolenceData, gi: number, lang: Lang): string | null {
  const raw = violence.meta.initiatives[violence.initiative[gi]];
  const entry = INITIATIVE_PHRASES[raw];
  return entry ? entry[lang] : null;
}

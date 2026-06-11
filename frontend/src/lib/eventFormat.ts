// Shared event display helpers used by the hover card (MapView) and the click
// detail panel (DetailPanel). Extracted so the muni label and perpetrator
// string are defined once.

import type { ViolenceData, Munis } from './data';
import { t } from './i18n.svelte';

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
 *  a real attribution (not a placeholder). Mirrors the source recoding. */
export function responsible(violence: ViolenceData, gi: number): string {
  const cat = violence.meta.respCategories[violence.cat[gi]];
  const grp = violence.meta.respGroups[violence.grp[gi]];
  return isRealGroup(grp) ? `${cat} · ${grp}` : cat;
}

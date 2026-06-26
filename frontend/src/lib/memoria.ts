// Memoria view: time-axis math and date formatting for the violence timeline.

export const EPOCH_MS = Date.UTC(1958, 0, 1);
export const DAY_MS = 86_400_000;
export const MAX_DAY = (Date.UTC(2026, 11, 31) - EPOCH_MS) / DAY_MS;

export const WOUND_FADE_DAYS = 1050; // a wound takes ~3 years to close into a scar
export const COLOR_BUCKET_DAYS = 15; // tooltip re-pick granularity during playback (sim time)

export function formatMonthYear(day: number, lang: 'es' | 'en'): string {
  const d = new Date(EPOCH_MS + day * DAY_MS);
  const s = d.toLocaleDateString(lang === 'es' ? 'es-CO' : 'en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
  // "agosto de 1997" -> "Agosto de 1997" (CSS capitalize would also hit "de")
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "marzo de 2020" (ES, lowercase for mid-sentence/header use) / "March 2020" (EN) */
export function formatMonthYearInline(day: number, lang: 'es' | 'en'): string {
  const s = formatMonthYear(day, lang);
  return lang === 'es' ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** year + fraction of that year elapsed at `day` (timeline readout) */
export function yearProgress(day: number): { year: number; frac: number } {
  const d = new Date(EPOCH_MS + day * DAY_MS);
  const year = d.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return { year, frac: (d.getTime() - start) / (end - start) };
}

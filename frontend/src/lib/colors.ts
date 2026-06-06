// Categorical palettes tuned for the dark ink basemap.
// Masacres get the signal red; the rest are distinguishable but quieter.

export const MODALITY_COLORS: Record<string, string> = {
  MA: '#ff4154', // masacres — the signal color
  AS: '#f2a65a', // asesinatos selectivos
  DF: '#9d7bd8', // desaparición forzada
  SE: '#5ab3f0', // secuestro
  RU: '#e8d44d', // reclutamiento de menores
  MI: '#67d98b', // minas
  VS: '#f06ba8', // violencia sexual
  AT: '#5ad9d0', // atentado terrorista
  AP: '#b3c84e', // ataque a poblado
  AB: '#8a93a6', // acciones bélicas
  DB: '#c98f5a', // daño a bienes civiles
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

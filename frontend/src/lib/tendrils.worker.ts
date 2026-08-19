// Web Worker wrapper around buildTendrils (tendrils.ts). Building a full-tier
// field is ~0.5–1 s of pure CPU (142k curves × 22 flow-field steps, then
// packing ~7M strip vertices); on the main thread that was a visible freeze at
// load and again on every governor demotion / debug-panel geometry commit.
// The packed vertex buffer and the appearDay index are transferred back
// (zero-copy); the event columns are copied in per job (~6 MB, milliseconds).
// Pure data in, pure data out — no DOM, no deck.
import { buildTendrils, type TendrilGeoParams, type TendrilSource } from './tendrils';

export interface TendrilJob {
  id: number;
  src: TendrilSource;
  params: TendrilGeoParams;
}

export interface TendrilResult {
  id: number;
  nCurves: number;
  vertexCount: number;
  bytes: ArrayBuffer;
  appearDay: Float32Array;
}

const ctx = self as unknown as {
  postMessage(msg: TendrilResult, transfer: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: MessageEvent<TendrilJob>) => void): void;
};

ctx.addEventListener('message', (e) => {
  const { id, src, params } = e.data;
  const field = buildTendrils(src, params);
  const msg: TendrilResult = {
    id,
    nCurves: field.nCurves,
    vertexCount: field.vertexCount,
    bytes: field.bytes,
    appearDay: field.appearDay,
  };
  ctx.postMessage(msg, [field.bytes, field.appearDay.buffer]);
});

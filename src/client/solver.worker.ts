// Le solveur tourne dans un Web Worker pour ne pas figer la page pendant la recherche.
import { rooms } from '../rooms';
import type { Layout, SolveOptions } from '../shared/types';

self.onmessage = (e: MessageEvent<{ roomId: string; base: Layout; allowNotch: boolean; sizes?: SolveOptions['sizes'] }>) => {
  const { roomId, base, allowNotch, sizes } = e.data;
  try {
    self.postMessage({ ok: true, result: rooms[roomId].solve(base, { allowNotch, sizes, limit: 20 }) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};

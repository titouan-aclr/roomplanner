// Le solveur tourne dans un Web Worker pour ne pas figer la page pendant la recherche.
import { rooms } from '../rooms';
import type { Layout } from '../shared/types';

self.onmessage = (e: MessageEvent<{ roomId: string; base: Layout; allowNotch: boolean }>) => {
  const { roomId, base, allowNotch } = e.data;
  try {
    self.postMessage({ ok: true, result: rooms[roomId].solve(base, { allowNotch }) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};

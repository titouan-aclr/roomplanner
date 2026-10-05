import { RoomGeo } from '../../shared/core';
import type { RoomData, RoomModule } from '../../shared/types';
import { catalog } from './catalog';
import { proposals } from './proposals';
import data from './room.json';
import { evaluateChambre } from './rules';
import { solveChambre } from './solver';

const room = data as unknown as RoomData;
const geo = new RoomGeo(room);

export const chambre: RoomModule = {
  data: room,
  catalog,
  starter: proposals.find((p) => p.key === 'D')!.layout,
  evaluate: (layout) => evaluateChambre(geo, layout),
  solve: (base, opts) => solveChambre(geo, base, opts),
  proposals,
  explore: {
    required: ['bed', 'wardrobe', 'desk'],
    optional: ['dresser', 'piano'],
    sizes: {
      bed: { widths: [150], depths: [212] },
      wardrobe: { widths: [140, 160], depths: [60] },
      desk: { widths: [140, 160], depths: [60, 70] },
      dresser: { widths: [60], depths: [40] },
      piano: { widths: [135], depths: [32] },
    },
    notch: { fixed: 'chimney', label: 'Autoriser le bureau découpé autour de la cheminée' },
  },
};

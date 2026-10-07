import { RoomGeo } from '../../shared/core';
import type { RoomData, RoomModule } from '../../shared/types';
import { catalog } from './catalog';
import { proposals } from './proposals';
import data from './room.json';
import { evaluateSejour } from './rules';
import { solveSejour } from './solver';

const room = data as unknown as RoomData;
const geo = new RoomGeo(room);

export const sejour: RoomModule = {
  data: room,
  catalog,
  starter: proposals[0]?.layout ?? [],
  evaluate: (layout) => evaluateSejour(geo, layout),
  solve: (base, opts) => solveSejour(geo, base, opts),
  proposals,
  explore: {
    required: ['table', 'sofa'],
    optional: ['lamp', 'armchair', 'coffee', 'piano'],
    sizes: {
      table: { widths: [70], depths: [70] },
      sofa: { widths: [150, 190, 230], depths: [95] },
      lamp: { widths: [30], depths: [30] },
      armchair: { widths: [63], depths: [75] },
      coffee: { widths: [30, 45], depths: [30, 45] },
      piano: { widths: [135], depths: [32] },
    },
  },
};

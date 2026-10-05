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
};

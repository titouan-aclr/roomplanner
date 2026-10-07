// Séjour : la géométrie est en place ; les meubles, leurs règles et la stratégie du solveur viendront ensuite.
import { Checker, RoomGeo } from '../../shared/core';
import type { FurnitureType, Layout, RoomData, RoomModule } from '../../shared/types';
import data from './room.json';

const room = data as unknown as RoomData;
const geo = new RoomGeo(room);

const catalog: Record<string, FurnitureType> = {
  custom: { label: 'Meuble', color: 'extra', render: 'box', w: 60, d: 40, h: 80, multiple: true },
};

/** Vérifications communes seulement : murs, obstacles, zones libres, chevauchements, espaces devant, circulation. */
function evaluateSejour(layout: Layout) {
  const c = new Checker(geo, catalog, layout);
  c.placement();
  c.overlaps();
  c.frontClearances();
  c.reachability();
  return c.result(6);
}

export const sejour: RoomModule = {
  data: room,
  catalog,
  starter: [],
  evaluate: evaluateSejour,
  solve: () => ({ families: [], evaluated: 0, valid: 0, ms: 0 }),
  proposals: [],
  explore: { required: [], optional: [], sizes: {} },
};

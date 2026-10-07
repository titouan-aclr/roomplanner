import type { RoomModule } from '../shared/types';
import { chambre } from './chambre';
import { sejour } from './sejour';

/** Pièces disponibles. Pour en ajouter une : créer src/rooms/<pièce>/ sur le modèle de la chambre et l'inscrire ici. */
export const rooms: Record<string, RoomModule> = { chambre, sejour };

export const roomList = Object.values(rooms).map((r) => ({ id: r.data.id, name: r.data.name, home: r.data.home }));

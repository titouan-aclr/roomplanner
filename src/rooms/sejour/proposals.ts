// Dispositions de départ du séjour, tirées des meilleurs résultats du solveur.
import type { Face, PlacedItem, Proposal } from '../../shared/types';
import { catalog } from './catalog';

const P = (type: string, face: Face, x: number, y: number, w: number, d: number, extra: Partial<PlacedItem> = {}): PlacedItem =>
  ({ id: type, type, label: catalog[type].label, face, x, y, w, d, ...extra });

export const proposals: Proposal[] = [
  {
    key: 'A', name: 'Fauteuil près de la fenêtre, 3 chaises',
    pros: ['Tout le programme : canapé-lit de 200 sur le mur de gauche, fauteuil et table d’appoint près de la fenêtre, lampadaire au bout du canapé.', 'Place pour 3 chaises autour de la table.', 'Rien devant la cheminée.'],
    cons: ['Le fauteuil et la table d’appoint bloquent le battant du haut de la fenêtre (celui du bas s’ouvre).', '3,6 m² de circulation.'],
    layout: [P('table', 'S', 180, 150, 70, 70, { count: 4 }), P('sofa', 'E', 2, 50, 200, 95), P('lamp', 'S', 2, 252, 30, 30), P('armchair', 'W', 285, 80, 63, 75), P('coffee', 'S', 330, 145, 30, 30)],
  },
  {
    key: 'B', name: 'Table d’appoint devant le canapé',
    pros: ['Même coin salon, avec la table d’appoint à 45 cm devant le canapé.', 'Un seul battant de la fenêtre gêné, par le fauteuil.'],
    cons: ['Place pour 2 chaises seulement autour de la table.', '3,4 m² de circulation.'],
    layout: [P('table', 'S', 180, 150, 70, 70, { count: 4 }), P('sofa', 'E', 2, 50, 200, 95), P('lamp', 'S', 2, 252, 30, 30), P('armchair', 'W', 285, 80, 63, 75), P('coffee', 'W', 142, 135, 30, 30)],
  },
  {
    key: 'C', name: 'Sans fauteuil, plus d’espace',
    pros: ['La plus grande circulation : 4,4 m².', 'Place pour 3 chaises.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Pas de fauteuil ni de table d’appoint.'],
    layout: [P('table', 'S', 190, 150, 70, 70, { count: 4 }), P('sofa', 'E', 2, 50, 200, 95), P('lamp', 'S', 2, 252, 30, 30)],
  },
  {
    key: 'D', name: 'Avec le piano',
    pros: ['Le piano s’ajoute en épi, clavier tourné vers le canapé.', 'Canapé-lit et lampadaire gardés.'],
    cons: ['Le piano se trouve devant la cheminée.', 'Pas de fauteuil ni de table d’appoint.', 'Place pour 2 chaises seulement.'],
    layout: [P('table', 'S', 200, 150, 70, 70, { count: 4 }), P('sofa', 'E', 2, 50, 200, 95), P('lamp', 'S', 2, 252, 30, 30), P('piano', 'W', 168, 55, 135, 32)],
  },
];

// Dispositions de départ du séjour, tirées des meilleurs résultats du solveur.
import type { Face, PlacedItem, Proposal } from '../../shared/types';
import { catalog } from './catalog';

const P = (type: string, face: Face, x: number, y: number, w: number, d: number, extra: Partial<PlacedItem> = {}): PlacedItem =>
  ({ id: type, type, label: catalog[type].label, face, x, y, w, d, ...extra });

export const proposals: Proposal[] = [
  {
    key: 'A', name: 'Canapé à gauche, coin salon complet',
    pros: ['Canapé-lit de 190 dos au mur de gauche, fauteuil devant la cheminée, table d’appoint et lampadaire à côté des assises.', 'Table ronde entre le coin salon et la fenêtre.'],
    cons: ['Place pour 2 chaises seulement autour de la table.', '3,6 m² de circulation.'],
    layout: [P('table', 'S', 220, 150, 70, 70, { count: 4 }), P('sofa', 'E', 2, 50, 190, 95), P('lamp', 'S', 2, 242, 30, 30), P('armchair', 'S', 150, 49, 63, 75), P('coffee', 'S', 215, 49, 30, 30)],
  },
  {
    key: 'B', name: 'Canapé devant la cheminée',
    pros: ['Canapé-lit adossé à la cheminée, fauteuil sur le mur de gauche : coin salon en L.', 'Lampadaire et table d’appoint entre les deux assises.'],
    cons: ['Le canapé dépasse de la cheminée et ne touche pas le mur sur toute sa longueur.', 'Place pour 2 chaises seulement autour de la table.'],
    layout: [P('table', 'S', 220, 150, 70, 70, { count: 4 }), P('sofa', 'S', 2, 49, 190, 95), P('lamp', 'S', 194, 49, 30, 30), P('armchair', 'E', 1, 190, 63, 75), P('coffee', 'S', 194, 114, 30, 30)],
  },
  {
    key: 'C', name: 'Sans fauteuil, 3 chaises',
    pros: ['La plus grande circulation : 4,5 m².', 'Place pour 3 chaises autour de la table.', 'Lampadaire et table d’appoint dans le coin en haut à gauche, au bout du canapé.'],
    cons: ['Pas de fauteuil.', 'Chaises un peu à l’étroit d’un côté.'],
    layout: [P('table', 'S', 170, 150, 70, 70, { count: 4 }), P('sofa', 'E', 2, 60, 190, 95), P('lamp', 'S', 2, 28, 30, 30), P('coffee', 'S', 67, 28, 30, 30)],
  },
  {
    key: 'D', name: 'Avec le piano',
    pros: ['Le piano s’ajoute près de la fenêtre, en épi.', 'Canapé-lit, lampadaire et table d’appoint gardés.'],
    cons: ['Le banc du piano gêne l’ouverture de la fenêtre.', 'Pas de fauteuil, 2 chaises seulement.'],
    layout: [P('table', 'S', 170, 150, 70, 70, { count: 4 }), P('sofa', 'E', 2, 60, 190, 95), P('lamp', 'S', 2, 28, 30, 30), P('coffee', 'S', 67, 28, 30, 30), P('piano', 'E', 240, 75, 135, 32)],
  },
];

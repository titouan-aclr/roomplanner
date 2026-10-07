// Dispositions de départ du séjour, retenues parmi celles du solveur et celles composées à la main.
// Le lampadaire et la table d'appoint ne sont pas cherchés par le solveur : on les ajoute à la main.
import type { Face, PlacedItem, Proposal } from '../../shared/types';
import { catalog } from './catalog';

const P = (type: string, face: Face, x: number, y: number, w: number, d: number, extra: Partial<PlacedItem> = {}): PlacedItem =>
  ({ id: type, type, label: catalog[type].label, face, x, y, w, d, ...extra });
const T = (x: number, y: number) => P('table', 'S', x, y, 70, 70, { count: 4 });

export const proposals: Proposal[] = [
  {
    key: 'A', name: 'Fauteuil face à la cheminée, table près de la fenêtre',
    pros: ['Canapé sur le mur de gauche et fauteuil au milieu, tourné vers la cheminée : un vrai coin salon.', 'Coin repas près de la fenêtre.'],
    cons: ['La table cache le battant du haut de la fenêtre.', 'Place pour 2 chaises.'],
    layout: [T(290, 77), P('sofa', 'E', 2, 48, 200, 95), P('lamp', 'S', 5, 250, 30, 30), P('armchair', 'N', 176, 150, 63, 75), P('coffee', 'S', 153, 61, 30, 30)],
  },
  {
    key: 'B', name: 'Canapé au mur, fauteuil près de la fenêtre',
    pros: ['Canapé-lit de 200 sur le mur de gauche, fauteuil près de la fenêtre tourné vers lui, lampadaire au bout du canapé.', 'Table d’appoint près de la cheminée, devant le canapé.', 'Place pour 3 chaises autour de la table.'],
    cons: ['Le fauteuil cache le battant du haut de la fenêtre (celui du bas s’ouvre).'],
    layout: [T(190, 150), P('sofa', 'E', 2, 50, 200, 95), P('lamp', 'S', 2, 252, 30, 30), P('armchair', 'W', 285, 80, 63, 75), P('coffee', 'S', 160, 56, 30, 30)],
  },
  {
    key: 'C', name: 'Canapé face à la cheminée, table près de la fenêtre',
    pros: ['Canapé au milieu, face à la cheminée, fauteuil dans le coin : le salon se regroupe autour de la cheminée.', 'Coin repas près de la fenêtre.'],
    cons: ['La table cache le battant du haut de la fenêtre.', 'Place pour 2 chaises, un peu à l’étroit.'],
    layout: [T(290, 94), P('sofa', 'N', 2, 130, 200, 95), P('lamp', 'S', 227, 23, 30, 30), P('armchair', 'E', 2, 23, 63, 75), P('coffee', 'S', 165, 53, 30, 30)],
  },
  {
    key: 'D', name: 'Canapé face à la cheminée, table à gauche',
    pros: ['Canapé au milieu, face à la cheminée, fauteuil dans le coin.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Place pour 2 chaises, un peu à l’étroit.'],
    layout: [T(25, 151), P('sofa', 'N', 104, 130, 200, 95), P('lamp', 'S', 2, 87, 30, 30), P('armchair', 'E', 2, 23, 63, 75), P('coffee', 'S', 165, 53, 30, 30)],
  },
  {
    key: 'E', name: 'Salon autour de la cheminée, table au centre',
    pros: ['Canapé au milieu, face à la cheminée, fauteuil dans le coin tourné lui aussi vers la cheminée.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Place pour 2 chaises.', 'Canapé et fauteuil un peu justes pour les jambes (44 et 48 cm).'],
    layout: [T(205, 150), P('sofa', 'N', 2, 130, 200, 95), P('armchair', 'E', 2, 23, 63, 75), P('lamp', 'S', 227, 23, 30, 30)],
  },
];

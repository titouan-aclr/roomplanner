// Dispositions de départ du séjour : les plus variées du solveur, et celles composées à la main.
// Le lampadaire et la table d'appoint ne sont pas cherchés par le solveur : on les ajoute à la main.
import type { Face, PlacedItem, Proposal } from '../../shared/types';
import { catalog } from './catalog';

const P = (type: string, face: Face, x: number, y: number, w: number, d: number, extra: Partial<PlacedItem> = {}): PlacedItem =>
  ({ id: type, type, label: catalog[type].label, face, x, y, w, d, ...extra });
const T = (x: number, y: number) => P('table', 'S', x, y, 70, 70, { count: 4 });

export const proposals: Proposal[] = [
  {
    key: 'A', name: 'Canapé au mur, fauteuil près de la fenêtre',
    pros: ['Canapé-lit de 200 sur le mur de gauche, fauteuil et table d’appoint près de la fenêtre, lampadaire au bout du canapé.', 'Place pour 3 chaises autour de la table.', 'Rien devant la cheminée.'],
    cons: ['Le fauteuil et la table d’appoint bloquent le battant du haut de la fenêtre (celui du bas s’ouvre).'],
    layout: [T(190, 150), P('sofa', 'E', 2, 50, 200, 95), P('lamp', 'S', 2, 252, 30, 30), P('armchair', 'W', 285, 80, 63, 75), P('coffee', 'S', 330, 145, 30, 30)],
  },
  {
    key: 'B', name: 'Canapé au mur, table d’appoint devant',
    pros: ['Même coin salon, avec la table d’appoint à 45 cm devant le canapé.', 'Un seul battant de la fenêtre gêné, par le fauteuil.'],
    cons: ['Place pour 2 chaises autour de la table.'],
    layout: [T(190, 150), P('sofa', 'E', 2, 50, 200, 95), P('lamp', 'S', 2, 252, 30, 30), P('armchair', 'W', 285, 80, 63, 75), P('coffee', 'W', 142, 135, 30, 30)],
  },
  {
    key: 'C', name: 'Fauteuil face à la cheminée, table près de la fenêtre',
    pros: ['Canapé sur le mur de gauche et fauteuil au milieu, tourné vers la cheminée : un vrai coin salon.', 'Coin repas près de la fenêtre.'],
    cons: ['La table bloque le battant du haut de la fenêtre.', 'Place pour 2 chaises.'],
    layout: [T(290, 77), P('sofa', 'E', 2, 48, 200, 95), P('lamp', 'S', 5, 250, 30, 30), P('armchair', 'N', 176, 150, 63, 75), P('coffee', 'S', 153, 61, 30, 30)],
  },
  {
    key: 'D', name: 'Canapé face à la cheminée, table près de la fenêtre',
    pros: ['Canapé au milieu, face à la cheminée, fauteuil dans le coin : le salon se regroupe autour de la cheminée.', 'Coin repas près de la fenêtre.'],
    cons: ['La table bloque le battant du haut de la fenêtre.', 'Place pour 2 chaises, un peu à l’étroit.'],
    layout: [T(290, 94), P('sofa', 'N', 2, 130, 200, 95), P('lamp', 'S', 227, 23, 30, 30), P('armchair', 'E', 2, 23, 63, 75), P('coffee', 'S', 165, 53, 30, 30)],
  },
  {
    key: 'E', name: 'Canapé face à la cheminée, table à gauche',
    pros: ['Canapé au milieu, face à la cheminée, fauteuil dans le coin.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Place pour 2 chaises, un peu à l’étroit.'],
    layout: [T(25, 151), P('sofa', 'N', 104, 130, 200, 95), P('lamp', 'S', 2, 87, 30, 30), P('armchair', 'E', 2, 23, 63, 75), P('coffee', 'S', 165, 53, 30, 30)],
  },
  {
    key: 'F', name: 'Canapé séparateur face à la cheminée, fauteuil vers la porte',
    pros: ['Canapé au milieu, tourné vers la cheminée, qui sépare le salon du coin repas.', 'Fauteuil contre le mur de gauche, près de la porte du bas.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Place pour 2 chaises.'],
    layout: [T(205, 140), P('sofa', 'N', 2, 110, 200, 95), P('armchair', 'E', 1, 210, 63, 75)],
  },
  {
    key: 'G', name: 'Canapé séparateur dos à la cheminée',
    pros: ['Canapé au milieu, tourné vers la cuisine, fauteuil dans le coin près de la cheminée.', 'Le plus de place parmi les dispositions avec fauteuil.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Place pour 2 chaises.', 'Fauteuil un peu juste pour les jambes (48 cm).'],
    layout: [T(205, 140), P('sofa', 'S', 2, 110, 200, 95), P('armchair', 'E', 2, 30, 63, 75)],
  },
  {
    key: 'H', name: 'Canapé séparateur, fauteuil au milieu',
    pros: ['Canapé au milieu, tourné vers la cuisine, fauteuil au milieu de l’espace devant la cheminée.'],
    cons: ['Place pour 2 chaises.', 'Fauteuil juste pour les jambes (30 cm).'],
    layout: [T(205, 140), P('sofa', 'S', 2, 110, 200, 95), P('armchair', 'E', 20, 40, 63, 75)],
  },
  {
    key: 'I', name: 'Canapé au mur, fauteuil au milieu, table vers la chambre',
    pros: ['Canapé sur le mur de gauche, fauteuil au milieu de la pièce.', 'Table près de la porte de la chambre : place pour 3 chaises.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Une chaise un peu à l’étroit (60 cm derrière).'],
    layout: [T(230, 80), P('sofa', 'E', 2, 50, 200, 95), P('armchair', 'S', 160, 140, 63, 75)],
  },
  {
    key: 'J', name: 'Sans fauteuil, très dégagé',
    pros: ['Le plus de place : 4,5 m² de circulation.', 'Place pour 3 chaises, la fenêtre s’ouvre en grand.'],
    cons: ['Pas de fauteuil.'],
    layout: [T(180, 130), P('sofa', 'E', 2, 50, 200, 95)],
  },
  {
    key: 'K', name: 'Canapé séparateur, sans fauteuil',
    pros: ['Canapé au milieu, dos à la cheminée, beaucoup de place autour.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Pas de fauteuil.', 'Place pour 2 chaises.'],
    layout: [T(205, 140), P('sofa', 'S', 2, 110, 200, 95)],
  },
  {
    key: 'L', name: 'Avec le piano en épi',
    pros: ['Piano au milieu, perpendiculaire à la cheminée, qui sépare le salon du coin repas.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Pas de fauteuil.', 'Place pour 2 chaises.'],
    layout: [T(210, 150), P('sofa', 'E', 2, 50, 200, 95), P('piano', 'W', 178, 55, 135, 32)],
  },
  {
    key: 'M', name: 'Avec le piano et le fauteuil',
    pros: ['Tout y est : canapé, fauteuil et piano au milieu, clavier vers la cheminée.'],
    cons: ['Le fauteuil bloque le battant du haut de la fenêtre.', 'Le banc du piano empiète sur le passage depuis la chambre.', 'Place pour 2 chaises, 3,2 m² de circulation.'],
    layout: [T(210, 150), P('sofa', 'E', 2, 50, 200, 95), P('armchair', 'S', 297, 80, 63, 75), P('piano', 'N', 145, 118, 135, 32)],
  },
];

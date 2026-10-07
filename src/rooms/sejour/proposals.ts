// Dispositions de départ du séjour : sélection faite dans l'application, avec les propositions
// « carte blanche » (banquettes sur mesure, salon sans canapé…).
import type { Face, PlacedItem, Proposal } from '../../shared/types';
import { catalog } from './catalog';

const P = (type: string, face: Face, x: number, y: number, w: number, d: number, extra: Partial<PlacedItem> = {}): PlacedItem =>
  ({ id: type, type, label: catalog[type].label, face, x, y, w, d, ...extra });

export const proposals: Proposal[] = [
  {
    key: 'A', name: 'Fauteuil face à la cheminée, table près de la fenêtre',
    pros: ['Canapé-lit de 200 sur le mur de gauche, face à la fenêtre ; fauteuil en biais au milieu, tourné à la fois vers le canapé et la cheminée.', 'Table d’appoint près de la cheminée, à portée du canapé.', 'Coin repas près de la fenêtre.'],
    cons: ['La table cache le battant du haut de la fenêtre et encombre l’arrivée depuis la chambre.', 'Place pour 2 chaises.', '3,3 m² de circulation.'],
    layout: [P('table', 'S', 290, 77, 70, 70, { count: 4 }), P('sofa', 'E', 2, 31, 200, 95), P('lamp', 'S', 4, 237, 30, 30), P('armchair', 'W', 153, 127, 63, 75, { tilt: true }), P('coffee', 'S', 153, 61, 30, 30)],
  },
  {
    key: 'B', name: 'Canapé au mur, fauteuil près de la fenêtre',
    pros: ['Canapé-lit de 200 sur le mur de gauche, tourné vers la lumière ; fauteuil près de la fenêtre, face à lui.', 'Place pour 3 chaises autour de la table, au centre.', 'Table d’appoint près de la cheminée, lampadaire au bout du canapé.'],
    cons: ['Le fauteuil cache le battant du haut de la fenêtre (celui du bas s’ouvre) et se trouve sur le trajet depuis la chambre.'],
    layout: [P('table', 'S', 190, 150, 70, 70, { count: 4 }), P('sofa', 'E', 2, 31, 200, 95), P('lamp', 'S', 2, 235, 30, 30), P('armchair', 'W', 285, 80, 63, 75), P('coffee', 'S', 160, 56, 30, 30)],
  },
  {
    key: 'C', name: 'Canapé face à la cheminée, table près de la fenêtre',
    pros: ['Canapé au milieu, face à la cheminée, fauteuil dans le coin de la niche : le salon se regroupe autour de la cheminée.', 'Coin repas près de la fenêtre.'],
    cons: ['La table cache le battant du haut de la fenêtre.', 'Place pour 2 chaises, dont une à l’étroit (61 cm).', 'Canapé et fauteuil un peu justes pour les jambes (44 et 48 cm).'],
    layout: [P('table', 'S', 290, 94, 70, 70, { count: 4 }), P('sofa', 'N', 2, 130, 200, 95), P('lamp', 'S', 227, 23, 30, 30), P('armchair', 'E', 2, 23, 63, 75), P('coffee', 'S', 165, 53, 30, 30)],
  },
  {
    key: 'D', name: 'Canapé face à la cheminée, table à gauche',
    pros: ['Canapé au milieu, face à la cheminée, fauteuil dans le coin de la niche.', 'La fenêtre s’ouvre en grand.'],
    cons: ['Table contre le mur de gauche : 2 chaises à l’étroit (60 et 67 cm).', 'Lampadaire loin des assises.', 'La moins de place : 3 m² de circulation.'],
    layout: [P('table', 'S', 2, 153, 70, 70, { count: 4 }), P('sofa', 'N', 104, 130, 200, 95), P('lamp', 'S', 227, 23, 30, 30), P('armchair', 'E', 2, 23, 63, 75), P('coffee', 'S', 165, 53, 30, 30)],
  },
  {
    key: 'E', name: 'Salon tourné vers la cheminée, fenêtre libre',
    pros: ['Salon tourné vers la cheminée : canapé de 90 cm de profondeur au milieu, fauteuil dans la niche tourné vers lui, un lampadaire entre les deux.', 'Toute la bande côté fenêtre reste libre : 85 cm de passage direct de la chambre à la cuisine, les deux battants s’ouvrent.', 'Table ronde avec 2 chaises au quotidien, 2 chaises pliantes pour recevoir à 4.', 'À prévoir : suspension au-dessus de la table, miroir sur la cheminée, table d’appoint en C.'],
    cons: ['Pas de place pour une table basse (86 cm jusqu’à la cheminée).', 'Pour dormir, reculer le canapé d’une trentaine de centimètres le temps d’ouvrir le rapido.'],
    layout: [P('sofa', 'N', 2, 135, 200, 90), P('armchair', 'E', 3, 24, 63, 75), P('lamp', 'S', 2, 98, 30, 30), P('table', 'S', 205, 150, 70, 70, { count: 2 })],
  },
  {
    key: 'F', name: 'Coin bistrot dans la niche, canapé face à la cheminée',
    pros: ['La niche devient un coin repas bistrot : banquette sur mesure 123 × 45 avec coffres, bibliothèque murale au-dessus, guéridon Ø 65 à pied central (3 places).', 'Canapé 180 × 85 centré sur l’axe de la cheminée.', 'Fenêtre et passage entièrement libres (94 cm).', 'À prévoir : suspension basse au-dessus du guéridon, lampadaire liseuse au bout du canapé.'],
    cons: ['Demande du sur-mesure (banquette, bibliothèque) et un canapé de 180.', 'Canapé vu de dos depuis la cuisine : choisir un dos fini et des pieds hauts.', 'Pas de table basse : une table d’appoint en C contre l’accoudoir.'],
    layout: [P('bench', 'S', 2, 23, 123, 45), P('table', 'S', 30, 68, 65, 65, { count: 3 }), P('sofa', 'N', 86, 135, 180, 85), P('lamp', 'S', 236, 105, 30, 30)],
  },
  {
    key: 'G', name: 'Salon de conversation, sans canapé',
    pros: ['Salon à la française : deux fauteuils face à face de part et d’autre de la cheminée, petite table ronde entre eux.', 'La pièce la plus ouverte (4,3 m²).', 'Repas à deux près de la cuisine.'],
    cons: ['Pas de canapé pour s’allonger ni de couchage.', 'Le fauteuil de droite cache un battant de la fenêtre et longe le passage.', 'Fauteuils justes pour les jambes (37 et 45 cm).'],
    layout: [P('armchair', 'E', 30, 55, 70, 75), P('armchair', 'W', 232, 80, 70, 75, { id: 'armchair2' }), P('coffee', 'S', 150, 85, 45, 45), P('lamp', 'S', 2, 23, 30, 30), P('table', 'S', 5, 140, 70, 70, { count: 2 })],
  },
  {
    key: 'H', name: 'Banquette d\'angle, tout en un',
    pros: ['Banquette sur mesure en L dans l’angle de la niche (123 + 140 cm, 55 de profondeur) avec un guéridon Ø 65 : 4 places, dont 2 sur la banquette.', 'Un fauteuil en biais, tourné vers l’angle, ferme le cercle.', 'Le reste de la pièce est entièrement libre (4,3 m²).'],
    cons: ['Pas de vrai canapé : la banquette sert de méridienne.', 'Demande du sur-mesure (banquette, bibliothèque au-dessus).'],
    layout: [P('bench', 'S', 2, 23, 123, 55), P('bench', 'E', 2, 78, 140, 55, { id: 'bench2' }), P('table', 'S', 60, 80, 65, 65, { count: 4 }), P('armchair', 'W', 190, 120, 70, 75, { tilt: true }), P('lamp', 'S', 2, 225, 30, 30)],
  },
  {
    key: 'I', name: 'Piano compact dans la niche de la cheminée',
    pros: ['Un piano numérique compact se loge dans la niche de 123 cm à gauche de la cheminée.', 'Canapé au milieu, tourné vers la cheminée et le piano.'],
    cons: ['Le piano doit faire 120 cm au plus (beaucoup de modèles font 130 à 135 cm).', 'Pas de fauteuil.', 'La table cache le battant du haut de la fenêtre ; place pour 2 chaises.'],
    layout: [P('piano', 'S', 2, 23, 120, 32), P('sofa', 'N', 2, 130, 200, 95), P('table', 'S', 290, 78, 70, 70, { count: 4 }), P('lamp', 'S', 227, 25, 30, 30)],
  },
];

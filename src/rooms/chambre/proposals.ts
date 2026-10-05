// Dispositions de départ de la chambre (utilisées pour remplir une base vide).
import type { Face, PlacedItem, Proposal } from '../../shared/types';
import { catalog } from './catalog';

const P = (type: string, face: Face, x: number, y: number, w: number, d: number, extra: Partial<PlacedItem> = {}): PlacedItem =>
  ({ id: type, type, label: catalog[type].label, face, x, y, w, d, ...extra });
const chim = { notch: 'chimney' };

export const proposals: Proposal[] = [
  {
    key: 'A', name: 'Lit sous la cheminée, bureau dans le renfoncement',
    pros: ['Lit accessible des deux côtés, la cheminée sert de tête de lit.', 'Armoire de 160 sur le mur gauche.'],
    cons: ['Le lit au centre coupe la pièce.', 'Imprimante à côté de la tête de lit.', 'Bureau dos à la fenêtre.'],
    layout: [P('bed', 'S', 140, 52, 150, 212), P('wardrobe', 'E', 0, 165, 160, 60), P('desk', 'S', 0, 0, 140, 70), P('dresser', 'S', 294, 26, 60, 40)],
  },
  {
    key: 'B', name: 'Lit sous la cheminée, coin atelier',
    pros: ['Bureau et commode côte à côte sur le mur gauche.', 'Lit accessible des deux côtés.', 'Imprimante loin de la tête de lit.'],
    cons: ['80 cm pour la chaise.', 'Dos à la fenêtre.', 'Lit au centre.'],
    layout: [P('bed', 'S', 140, 52, 150, 212), P('wardrobe', 'S', 0, 0, 140, 60), P('desk', 'E', 0, 185, 140, 60), P('dresser', 'E', 0, 122, 60, 40)],
  },
  {
    key: 'C', name: 'Lit en coin, bureau-cheminée, armoire 140',
    pros: ['Bureau découpé autour de la cheminée, son dessus sert d’étagère.', 'Armoire dans le renfoncement.', 'Imprimante près de la fenêtre.'],
    cons: ['42 cm de plan devant la cheminée.', '80 cm pour la chaise.', 'Lit accessible d’un seul côté.'],
    layout: [P('bed', 'E', 0, 174, 150, 212), P('wardrobe', 'S', 0, 0, 140, 60), P('desk', 'S', 147, 26, 144, 68, chim), P('dresser', 'S', 294, 26, 60, 40)],
  },
  {
    key: 'D', name: 'Lit en coin, bureau-cheminée, armoire 160',
    pros: ['Même bureau que C.', 'Armoire de 160 sur le mur gauche, 60 cm devant.'],
    cons: ['L’armoire couvre l’applique du haut.', 'Lit accessible d’un seul côté.'],
    layout: [P('bed', 'E', 0, 174, 150, 212), P('wardrobe', 'E', 0, 0, 160, 60), P('desk', 'S', 147, 26, 144, 68, chim), P('dresser', 'S', 294, 26, 60, 40)],
  },
  {
    key: 'E', name: 'Lit en coin + piano au pied du lit',
    pros: ['Tout D, plus le piano adossé au pied du lit, clavier vers la fenêtre.'],
    cons: ['Le banc du piano empiète sur l’entrée.', 'Bureau ramené à 140.'],
    layout: [P('bed', 'E', 0, 174, 150, 212), P('wardrobe', 'E', 0, 0, 160, 60), P('desk', 'S', 150, 26, 140, 68, chim), P('dresser', 'S', 290, 26, 60, 40), P('piano', 'E', 212, 189, 135, 32)],
  },
  {
    key: 'F', name: 'Lit en coin + piano dans le renfoncement',
    pros: ['Le piano se glisse dans le renfoncement, face à l’armoire.', 'Rien ne gêne l’entrée.'],
    cons: ['55 cm entre l’armoire et le piano.', 'Lit accessible seulement par le pied avec un piano de 135.'],
    layout: [P('bed', 'E', 0, 179, 145, 212), P('wardrobe', 'E', 0, 0, 160, 60), P('desk', 'S', 150, 26, 140, 68, chim), P('dresser', 'S', 290, 26, 60, 40), P('piano', 'W', 115, 0, 135, 32)],
  },
  {
    key: 'G', name: 'Renfoncement, bureau-cheminée, commode près de la porte',
    pros: ['Lit de 145 dans le renfoncement.', 'Armoire de 160 sur le mur du bas.'],
    cons: ['34 cm de plan devant la cheminée.', '52 cm devant l’armoire.'],
    layout: [P('bed', 'S', 0, 0, 145, 212), P('wardrobe', 'N', 10, 264, 160, 60), P('desk', 'S', 147, 26, 144, 60, chim), P('dresser', 'N', 190, 284, 60, 40)],
  },
  {
    key: 'H', name: 'Renfoncement, bureau-cheminée, commode près de la fenêtre',
    pros: ['Bureau de 144 × 68 : 42 cm devant la cheminée.', 'Imprimante aérée et loin du lit.', 'Coin libre près de la porte.'],
    cons: ['52 cm devant l’armoire.', 'Lit accessible d’un seul côté.'],
    layout: [P('bed', 'S', 0, 0, 145, 212), P('wardrobe', 'N', 10, 264, 160, 60), P('desk', 'S', 147, 26, 144, 68, chim), P('dresser', 'S', 294, 26, 60, 40)],
  },
  {
    key: 'I', name: 'Renfoncement, bureau en épi face à la fenêtre',
    pros: ['Bureau de 160 en épi, encoche dans le coin autour de la cheminée.', 'Face à la fenêtre : la meilleure lumière.'],
    cons: ['Bureau au milieu de la pièce.', 'Écran à contre-jour.'],
    layout: [P('bed', 'S', 0, 0, 145, 212), P('wardrobe', 'N', 10, 264, 160, 60), P('desk', 'W', 231, 26, 160, 60, chim), P('dresser', 'S', 294, 26, 60, 40)],
  },
  {
    key: 'J', name: 'Renfoncement + piano sur le mur du bas',
    pros: ['Armoire et piano côte à côte sur le mur du bas.', '3,2 m² de circulation.'],
    cons: ['Armoire de 120 seulement.'],
    layout: [P('bed', 'S', 0, 0, 145, 212), P('wardrobe', 'N', 1, 265, 120, 60), P('desk', 'S', 147, 26, 144, 68, chim), P('dresser', 'S', 294, 26, 60, 40), P('piano', 'N', 121, 292, 135, 32)],
  },
  {
    key: 'K', name: 'Renfoncement + piano entre armoire et fenêtre',
    pros: ['Bureau-cheminée avec 90 cm pour la chaise.', 'Commode loin de la tête de lit.'],
    cons: ['Le banc du piano empiète sur l’entrée.', 'Imprimante loin de la fenêtre.'],
    layout: [P('bed', 'S', 0, 0, 145, 212), P('wardrobe', 'N', 60, 264, 160, 60), P('desk', 'S', 147, 26, 140, 68, chim), P('dresser', 'N', 0, 286, 60, 40), P('piano', 'E', 220, 189, 135, 32)],
  },
  {
    key: 'L', name: 'Renfoncement + piano près de la fenêtre',
    pros: ['Le piano s’appuie sur les 33 cm de mur entre la fenêtre et le radiateur.', 'On joue face à la cheminée.'],
    cons: ['On voit le dos du piano en entrant.', 'Le banc gêne l’ouverture de la fenêtre.'],
    layout: [P('bed', 'S', 0, 0, 145, 212), P('wardrobe', 'N', 10, 265, 160, 60), P('desk', 'S', 147, 26, 140, 68, chim), P('dresser', 'S', 290, 26, 60, 40), P('piano', 'N', 219, 210, 135, 32)],
  },
  {
    key: 'M', name: 'Bureau face à la fenêtre, lit contre le mur du bas',
    pros: ['Bureau en épi face à la fenêtre.', 'Applique du bas en lampe de chevet.'],
    cons: ['Écran à contre-jour.', 'Lit accessible d’un seul côté.'],
    layout: [P('bed', 'N', 0, 113, 150, 212), P('wardrobe', 'S', 0, 0, 140, 60), P('desk', 'W', 230, 52, 160, 60), P('dresser', 'S', 294, 26, 60, 40)],
  },
  {
    key: 'N', name: 'Cocon',
    pros: ['Lit en alcôve entre le mur et une cloison-étagère.'],
    cons: ['Lit accessible seulement par le pied.', '52 cm devant l’armoire.'],
    layout: [
      P('bed', 'N', 0, 112, 150, 212), P('wardrobe', 'S', 0, 0, 140, 60),
      { id: 'divider', type: 'custom', label: 'Cloison étagère', face: 'E', x: 150, y: 112, w: 212, d: 22 },
      P('desk', 'E', 172, 112, 140, 60), P('dresser', 'S', 264, 26, 90, 40),
    ],
  },
];

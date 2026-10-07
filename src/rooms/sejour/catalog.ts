import type { FurnitureType } from '../../shared/types';

export const catalog: Record<string, FurnitureType> = {
  /** Table déjà achetée : Ø 70. Les chaises se placent autour (voir rules.ts). */
  table: { label: 'Table ronde Ø70', color: 'table', render: 'roundTable', w: 70, d: 70, h: 75 },
  /**
   * Canapé-lit : 150 cm est la largeur des plus petits canapés-lits qui offrent un couchage de 140 ;
   * au-delà de 235 cm il prendrait trop de place.
   */
  sofa: {
    label: 'Canapé-lit', color: 'sofa', render: 'sofa', w: 200, d: 95, h: 85,
    front: { comfort: 45, min: 30, what: 'pour les jambes' },
    width: { min: 150, soft: 180, max: 235 },
  },
  lamp: { label: 'Lampadaire', color: 'lamp', render: 'lamp', w: 30, d: 30, h: 170 },
  /** Fauteuil pivotant IKEA DYVLINGE (63 × 75 × 68) : son orientation compte peu. */
  armchair: {
    label: 'Fauteuil', color: 'armchair', render: 'armchair', w: 63, d: 75, h: 68,
    front: { comfort: 50, min: 30, what: 'pour les jambes' },
  },
  /** Table basse ou simple table d'appoint : devant le canapé ou le fauteuil (à 30 cm au moins), ou à côté d'une assise si elle est petite. */
  coffee: { label: 'Table d’appoint', color: 'coffee', render: 'coffee', w: 30, d: 30, h: 45 },
  piano: {
    label: 'Piano', color: 'piano', render: 'piano', w: 135, d: 32, h: 90,
    front: { comfort: 65, min: 50, what: 'pour le banc' },
  },
  custom: { label: 'Meuble', color: 'extra', render: 'box', w: 60, d: 40, h: 80, multiple: true },
};

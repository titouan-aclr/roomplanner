import type { FurnitureType } from '../../shared/types';

export const catalog: Record<string, FurnitureType> = {
  bed: { label: 'Lit coffre', color: 'bed', render: 'bed', w: 150, d: 212, h: 100, sides: { comfort: 60, min: 45 } },
  wardrobe: {
    label: 'Armoire', color: 'wardrobe', render: 'wardrobe', w: 160, d: 60, h: 236,
    front: { comfort: 60, min: 50, what: 'pour ouvrir les portes' },
    width: { min: 120, soft: 135, max: 160 },
  },
  desk: {
    label: 'Bureau', color: 'desk', render: 'desk', w: 140, d: 70, h: 75,
    front: { comfort: 90, min: 75, what: 'pour la chaise' },
    width: { min: 140, max: 160 },
    notchable: 'chimney',
  },
  dresser: {
    label: 'Commode 3D', color: 'dresser', render: 'dresser', w: 60, d: 40, h: 80,
    front: { comfort: 50, min: 40, what: 'pour ouvrir les tiroirs' },
  },
  piano: {
    label: 'Piano', color: 'piano', render: 'piano', w: 135, d: 32, h: 90,
    front: { comfort: 65, min: 50, what: 'pour le banc' },
  },
  custom: { label: 'Meuble', color: 'extra', render: 'box', w: 50, d: 40, h: 80, multiple: true },
};

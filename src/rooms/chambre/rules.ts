// Règles et note propres à la chambre.
import { Checker, type RoomGeo } from '../../shared/core';
import { backCenter, FRONT, intersection } from '../../shared/geometry';
import type { Evaluation, Layout } from '../../shared/types';
import { catalog } from './catalog';

/** Ordre d'importance : la commode compte beaucoup, le piano passe après tout le reste. */
const PRESENCE = { dresser: 30, piano: 12 };

export function evaluateChambre(geo: RoomGeo, layout: Layout): Evaluation {
  const c = new Checker(geo, catalog, layout);
  c.placement();
  c.overlaps();
  c.wallFixed('wardrobe');

  // Bureau découpé autour de la cheminée
  for (const desk of c.byType('desk')) {
    const n = geo.notch(desk);
    if (!n) continue;
    if (n.mode === 'back') {
      const use = desk.d - geo.fixedDepth(n.fixed);
      if (use < 30) c.err(desk.id, `${desk.label} : ${use} cm de plan devant ${geo.fixedLabel(n.fixed)}, trop peu pour travailler.`);
      else if (use < 45) c.warn(desk.id, `${desk.label} : ${use} cm de plan utile devant ${geo.fixedLabel(n.fixed)} (clavier oui, écran plutôt sur bras).`);
      if (n.fixed.notchInfo) c.info(desk.id, n.fixed.notchInfo);
    } else {
      const cut = intersection(c.fp.get(desk.id)!, n.fixed.rect!);
      const rest = desk.d - (desk.face === 'E' || desk.face === 'W' ? cut.w : cut.h);
      if (rest < 25) c.err(desk.id, `${desk.label} : l'encoche autour de ${geo.fixedLabel(n.fixed)} laisse ${rest} cm de plateau, trop peu.`);
      else c.info(desk.id, `${desk.label} : encoche de ${Math.round(cut.w)} × ${Math.round(cut.h)} cm dans le coin. Le dessus de ${geo.fixedLabel(n.fixed)} sert d'étagère au bout du bureau.`);
    }
  }

  c.frontClearances();
  c.frontInZones('desk', 'La place de la chaise', { entry: 8, keepFree: 4 });
  c.frontInZones('piano', 'Le banc du piano', { entry: 4, keepFree: 4 });
  c.reachability();
  c.sideAccess('bed', 120, 15);

  c.heat('wardrobe', 25, 'Armoire devant le radiateur : la chaleur sera bloquée.');
  c.heat('bed', 10, 'Lit collé au radiateur.');
  c.heat('dresser', 6, 'Commode devant le radiateur (chaleur + imprimante, à éviter).');
  c.heat('piano', 8, 'Piano devant le radiateur : la chaleur abîme les instruments.');
  c.sconces('wardrobe');

  // Bureau : lumière naturelle
  const win = geo.opening('window')!.rect;
  for (const desk of c.byType('desk')) {
    const f = c.fp.get(desk.id)!;
    const vx = win.x + win.w / 2 - (f.x + f.w / 2), vy = win.y + win.h / 2 - (f.y + f.h / 2), len = Math.hypot(vx, vy) || 1;
    c.score -= len / 15;
    const [fx, fy] = FRONT[desk.face];
    if ((fx * vx + fy * vy) / len > 0.7) { c.score -= 6; c.info(desk.id, 'Dos à la fenêtre : ton ombre tombera sur le bureau.'); }
    // largeur et profondeur utiles
    c.score += desk.w >= 140 ? 15 + Math.min((desk.w - 140) / 3, 20) : (desk.w - 140) / 2;
    const n = geo.notch(desk);
    const depth = n?.mode === 'back' ? desk.d - geo.fixedDepth(n.fixed) / 2 : desk.d;
    c.score += Math.max(-10, Math.min(12, (depth - 60) * 0.6));
  }

  // Imprimante 3D loin de la tête de lit (bruit, odeurs)
  const bed = c.byType('bed')[0];
  for (const dr of c.byType('dresser')) {
    c.score += PRESENCE.dresser;
    if (!bed) continue;
    const [hx, hy] = backCenter(bed), f = c.fp.get(dr.id)!;
    const d = Math.hypot(f.x + f.w / 2 - hx, f.y + f.h / 2 - hy);
    c.score += Math.min(d, 250) / 25;
    if (d < 120) c.warn(dr.id, 'Imprimante 3D proche de la tête de lit (bruit, odeurs).');
  }
  for (const w of c.byType('wardrobe')) c.score += Math.max(0, Math.min(w.w - 135, 25)) * 0.8;
  c.score += c.byType('piano').length * PRESENCE.piano;

  return c.result(6);
}

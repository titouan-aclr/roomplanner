// Règles et note propres au séjour.
import { type Blocker, Checker, type RoomGeo } from '../../shared/core';
import { frontRect, localRect, overlap } from '../../shared/geometry';
import type { Evaluation, Layout, PlacedItem, Rect, Side } from '../../shared/types';
import { catalog } from './catalog';

/**
 * Bonus de présence, dans l'ordre de priorité : canapé, fauteuil, piano. Le lampadaire et la table d'appoint
 * ne comptent pas dans la note : ils se casent toujours quelque part, on les place à la main.
 */
const PRESENCE: Record<string, number> = { sofa: 40, armchair: 15, piano: 8 };
const SEAT = { comfort: 75, min: 60, width: 50 };
/** Largeur d'un accoudoir de canapé (15 à 25 cm en général). */
export const ARMREST = 20;
const SIDE_NAME: Record<Side, string> = { top: 'en haut', bottom: 'en bas', left: 'à gauche', right: 'à droite' };

/** Bande de profondeur d (largeur d'une chaise) sur un côté de la table. */
function seatStrip(f: Rect, side: Side, d: number): Rect {
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2, half = SEAT.width / 2;
  switch (side) {
    case 'top': return { x: cx - half, y: f.y - d, w: SEAT.width, h: d };
    case 'bottom': return { x: cx - half, y: f.y + f.h, w: SEAT.width, h: d };
    case 'left': return { x: f.x - d, y: cy - half, w: d, h: SEAT.width };
    default: return { x: f.x + f.w, y: cy - half, w: d, h: SEAT.width };
  }
}

const center = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
/** Écart entre deux rectangles (0 s'ils se touchent ou se chevauchent). */
function gap(a: Rect, b: Rect) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Le lampadaire peut se trouver devant le canapé ou le fauteuil, même collé. */
export const allowedInFront = (it: PlacedItem, other: PlacedItem) => other.type === 'lamp' && (it.type === 'sofa' || it.type === 'armchair');

export function evaluateSejour(geo: RoomGeo, layout: Layout): Evaluation {
  const c = new Checker(geo, catalog, layout);
  c.placement();
  c.overlaps();
  c.frontClearances(allowedInFront);
  c.frontInZones('piano', 'Le banc du piano', { entry: 4, keepFree: 4 });
  c.reachability();
  c.entriesConnected();
  c.zoneReachable('kitchenWork', 'On ne peut plus accéder à la cuisine depuis les portes.');
  const leaves = geo.data.zones.filter((z) => z.group === 'window');
  if (leaves.length && !leaves.some((z) => c.circ.reaches(z.rect))) c.err(null, 'On ne peut plus atteindre la fenêtre pour l’ouvrir.');

  const fp = (it: PlacedItem) => c.fp.get(it.id)!;
  const sofa = c.byType('sofa')[0], coffee = c.byType('coffee')[0], armchair = c.byType('armchair')[0];

  // Table ronde : une chaise par côté où il reste de la place pour s'asseoir et se lever.
  // une chaise peut toujours être devant la fenêtre (battants) : seules les autres zones la gênent
  const zones: Blocker[] = geo.data.zones.filter((z) => z.kind === 'keepFree' && !z.group).map((z) => ({ r: z.rect, label: z.label }));
  for (const t of c.byType('table')) {
    const f = fp(t), blockers = c.others(t.id).concat(zones);
    const wanted = Math.max(2, Math.min(4, t.count ?? 4));
    const sides: Side[] = [];
    const tight: string[] = [];
    const depths: { depth: number; ok: boolean }[] = [];
    for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
      const d = geo.freeDepth((x) => seatStrip(f, side, x), SEAT.comfort, blockers).depth;
      const ok = d >= SEAT.min && c.circ.reaches(seatStrip(f, side, Math.min(d, 60)));
      depths.push({ depth: d, ok });
      if (!ok) continue;
      sides.push(side);
      if (d < SEAT.comfort && sides.length <= wanted) tight.push(`${SIDE_NAME[side]} ${d} cm`);
    }
    c.seats[t.id] = sides.slice(0, wanted);
    // profondeur libre derrière chaque côté (haut, bas, gauche, droite), pour dessiner les dégagements
    c.sideDepths[t.id] = depths;
    const n = Math.min(sides.length, wanted);
    // 2 chaises suffisent ; une 3e ou une 4e est un petit plus
    if (sides.length < 2) c.err(t.id, `${t.label} : place pour ${sides.length} chaise${sides.length > 1 ? 's' : ''} seulement, il en faut au moins 2 (${SEAT.min} cm minimum derrière chaque chaise, ${SEAT.comfort} pour être à l'aise).`);
    else c.info(t.id, `${t.label} : ${n} chaises${n < wanted ? ` (${wanted} souhaitées)` : ''}.`);
    if (tight.length) c.warn(t.id, `${t.label} : chaises un peu à l'étroit (${tight.join(', ')} ; confort ${SEAT.comfort}).`);
    c.score += Math.max(0, n - 2) * 2 - tight.length;
  }

  // Canapé : contre un mur ou au milieu de la pièce, peu importe ; un peu plus large, c'est mieux
  if (sofa) c.score += PRESENCE.sofa + Math.min(sofa.w - 150, 50) * 0.1;

  // Table d'appoint (hors note) : jamais à moins de 30 cm devant le canapé ou le fauteuil
  if (coffee) {
    const seatsAround = [sofa, armchair].filter(Boolean) as PlacedItem[];
    const frontOf = seatsAround.filter((s) => {
      const zone = frontRect(s, 80), [x, y] = center(fp(coffee));
      return x > zone.x && x < zone.x + zone.w && y > zone.y && y < zone.y + zone.h;
    });
    for (const s of frontOf) {
      const g = gap(fp(coffee), fp(s));
      if (g < 30) c.err(coffee.id, `${coffee.label} à ${Math.round(g)} cm ${s.type === 'sofa' ? 'du canapé' : 'du fauteuil'} : 30 cm minimum devant une assise.`);
    }
  }

  // Fauteuil : n'importe où, sa position par rapport au canapé ne compte pas
  if (armchair) c.score += PRESENCE.armchair;

  // Gros meubles juste devant la cheminée : à éviter (une table d'appoint ne gêne pas)
  const chimney = geo.fixed('chimney')?.rect;
  if (chimney) {
    const front = { x: chimney.x, y: chimney.y + chimney.h, w: chimney.w, h: 60 };
    for (const it of c.items) {
      if (!['table', 'sofa', 'armchair'].includes(it.type)) continue;
      // les accoudoires du canapé peuvent dépasser devant la cheminée : seule l'assise compte
      const body = it.type === 'sofa' ? localRect(it, ARMREST, 0, Math.max(0, it.w - 2 * ARMREST), it.d) : fp(it);
      if (!overlap(body, front)) continue;
      c.warn(it.id, `${it.label} juste devant la cheminée : elle disparaît derrière.`);
      c.score -= 15;
    }
  }

  c.score += c.byType('piano').length * PRESENCE.piano;
  return c.result(6);
}

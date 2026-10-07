// Règles et note propres au séjour.
import { type Blocker, Checker, type RoomGeo } from '../../shared/core';
import { frontRect } from '../../shared/geometry';
import type { Evaluation, Layout, PlacedItem, Rect, Side } from '../../shared/types';
import { catalog } from './catalog';

/** Ordre de priorité donné : canapé, lampadaire, fauteuil, table basse, puis piano. */
const PRESENCE: Record<string, number> = { sofa: 40, lamp: 20, armchair: 15, coffee: 12, piano: 8 };
const SEAT = { comfort: 75, min: 60, width: 50 };
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

export function evaluateSejour(geo: RoomGeo, layout: Layout): Evaluation {
  const c = new Checker(geo, catalog, layout);
  c.placement();
  c.overlaps();
  c.frontClearances();
  c.frontInZones('piano', 'Le banc du piano', { entry: 4, keepFree: 4 });
  c.reachability();
  c.entriesConnected();
  c.zoneReachable('kitchenWork', 'On ne peut plus accéder à la cuisine depuis les portes.');
  c.zoneReachable('windowSwing', 'On ne peut plus atteindre la fenêtre pour l’ouvrir.');

  const fp = (it: PlacedItem) => c.fp.get(it.id)!;
  const sofa = c.byType('sofa')[0], coffee = c.byType('coffee')[0], armchair = c.byType('armchair')[0];

  // Table ronde : une chaise par côté où il reste de la place pour s'asseoir et se lever.
  const zones: Blocker[] = geo.data.zones.filter((z) => z.kind === 'keepFree').map((z) => ({ r: z.rect, label: z.label }));
  for (const t of c.byType('table')) {
    const f = fp(t), blockers = c.others(t.id).concat(zones);
    const wanted = Math.max(2, Math.min(4, t.count ?? 4));
    const sides: Side[] = [];
    const tight: string[] = [];
    for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
      const d = geo.freeDepth((x) => seatStrip(f, side, x), SEAT.comfort, blockers).depth;
      if (d < SEAT.min || !c.circ.reaches(seatStrip(f, side, Math.min(d, 60)))) continue;
      sides.push(side);
      if (d < SEAT.comfort) { tight.push(`${SIDE_NAME[side]} ${d} cm`); c.score -= (SEAT.comfort - d) * 0.2; }
    }
    c.seats[t.id] = sides.slice(0, wanted);
    const n = Math.min(sides.length, wanted);
    if (sides.length < 2) c.err(t.id, `${t.label} : place pour ${sides.length} chaise${sides.length > 1 ? 's' : ''} seulement, il en faut au moins 2 (${SEAT.min} cm minimum derrière chaque chaise, ${SEAT.comfort} pour être à l'aise).`);
    else if (n < wanted) c.warn(t.id, `${t.label} : place pour ${n} chaises sur ${wanted} souhaitées.`);
    else c.info(t.id, `${t.label} : ${n} chaises.`);
    if (tight.length) c.warn(t.id, `${t.label} : chaises un peu à l'étroit (${tight.join(', ')} ; confort ${SEAT.comfort}).`);
    c.score += n * 8;
    // près de la cuisine, c'est plus pratique pour servir
    const k = geo.zone('kitchenWork');
    if (k) { const [kx, ky] = center(k.rect), [tx, ty] = center(f); c.score -= Math.hypot(kx - tx, ky - ty) / 25; }
  }

  // Canapé : de préférence dos au mur
  if (sofa) {
    c.score += PRESENCE.sofa + Math.min(sofa.w - 150, 50) * 0.1;
    if (!geo.backOnWall(sofa)) { c.warn(sofa.id, `${sofa.label} décollé du mur : il coupe la pièce.`); c.score -= 5; }
  }

  // Table basse ou d'appoint : devant le canapé, ou (si elle est petite) à côté du canapé ou du fauteuil
  if (coffee) {
    c.score += PRESENCE.coffee;
    const inFront = !!sofa && (() => {
      const zone = frontRect(sofa, 80), [x, y] = center(fp(coffee));
      return x > zone.x && x < zone.x + zone.w && y > zone.y && y < zone.y + zone.h;
    })();
    const small = coffee.w <= 50 && coffee.d <= 50;
    const beside = small && [sofa, armchair].some((s) => s && gap(fp(coffee), fp(s)) <= 40);
    if (!inFront && !beside) { c.warn(coffee.id, `${coffee.label} : ni devant le canapé ni à côté d'une assise.`); c.score -= 8; }
  }

  // Fauteuil : assez proche du canapé ou de la table basse pour discuter
  if (armchair) {
    c.score += PRESENCE.armchair;
    const target = coffee ?? sofa;
    if (target) {
      const [ax, ay] = center(fp(armchair)), [bx, by] = center(fp(target));
      const d = Math.hypot(ax - bx, ay - by);
      if (d > 220) { c.warn(armchair.id, `${armchair.label} loin du coin salon (${Math.round(d)} cm) : il sera isolé.`); c.score -= 6; }
      else c.score += 4;
    }
  }

  // Lampadaire : à côté d'une assise, la pièce n'a pas d'éclairage au plafond
  for (const lamp of c.byType('lamp')) {
    c.score += PRESENCE.lamp;
    const seats = [sofa, armchair].filter(Boolean) as PlacedItem[];
    const near = seats.some((s) => gap(fp(lamp), fp(s)) <= 40);
    if (!near) { c.warn(lamp.id, `${lamp.label} loin du canapé et du fauteuil : il éclairera mal le coin salon.`); c.score -= 8; }
  }

  c.score += c.byType('piano').length * PRESENCE.piano;
  return c.result(6);
}

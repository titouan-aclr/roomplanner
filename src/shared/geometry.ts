import type { Face, PlacedItem, Point, Rect, Side } from './types';

export const EPS = 0.01;

export function pointInPoly(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Le rectangle est entièrement dans le polygone (coins + milieux des bords). */
export function rectInPoly(r: Rect, poly: Point[]): boolean {
  const x0 = r.x + EPS, y0 = r.y + EPS, x1 = r.x + r.w - EPS, y1 = r.y + r.h - EPS;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const pts: Point[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [mx, y0], [mx, y1], [x0, my], [x1, my]];
  return pts.every(([x, y]) => pointInPoly(x, y, poly));
}

export function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function intersection(a: Rect, b: Rect): Rect {
  const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w);
  const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

type Box = Pick<PlacedItem, 'face' | 'x' | 'y' | 'w' | 'd' | 'tilt'>;

/** Côté du carré englobant d'un meuble en biais (tourné de 45°). */
export const tiltSide = (p: Pick<PlacedItem, 'w' | 'd'>) => Math.round((p.w + p.d) * Math.SQRT1_2);

/** Direction vers laquelle le meuble regarde (vecteur unitaire, y vers le bas). En biais : tournée de 45° en sens horaire. */
export function facing(p: Pick<PlacedItem, 'face' | 'tilt'>): Point {
  const v: Record<Face, Point> = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };
  const [x, y] = v[p.face];
  return p.tilt ? [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2] : [x, y];
}

/**
 * Emprise au sol : (x, y) est toujours le coin haut-gauche, quelle que soit l'orientation.
 * En biais, c'est le carré qui englobe le meuble tourné (approximation prudente).
 */
export function footprint(p: Box): Rect {
  if (p.tilt) { const s = tiltSide(p); return { x: p.x, y: p.y, w: s, h: s }; }
  const vertical = p.face === 'S' || p.face === 'N';
  return { x: p.x, y: p.y, w: vertical ? p.w : p.d, h: vertical ? p.d : p.w };
}

/** Bande de profondeur `depth` devant la face avant. */
/** Coins du meuble en biais (losange inscrit dans son carré englobant). */
function tiltCorners(p: Box): Point[] {
  const f = footprint(p), cx = f.x + f.w / 2, cy = f.y + f.h / 2, [ux, uy] = facing(p), vx = -uy, vy = ux;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [cx + (a * p.d / 2) * ux + (b * p.w / 2) * vx, cy + (a * p.d / 2) * uy + (b * p.w / 2) * vy] as Point);
}

/** Rectangle englobant d'une liste de points. */
function bbox(pts: Point[]): Rect {
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Emprise réelle découpée en bandes horizontales : un seul rectangle pour un meuble droit,
 * quelques bandes qui épousent le losange pour un meuble en biais (collisions et circulation).
 */
export function parts(p: Box, n = 6): Rect[] {
  if (!p.tilt) return [footprint(p)];
  const poly = tiltCorners(p), f = footprint(p), out: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const y0 = f.y + (f.h * i) / n, y1 = f.y + (f.h * (i + 1)) / n, xs: number[] = [];
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % 4];
      if (ay >= y0 && ay <= y1) xs.push(ax);
      for (const yy of [y0, y1]) if ((ay - yy) * (by - yy) < 0) xs.push(ax + ((yy - ay) / (by - ay)) * (bx - ax));
    }
    if (xs.length) out.push({ x: Math.min(...xs), y: y0, w: Math.max(...xs) - Math.min(...xs), h: y1 - y0 });
  }
  return out;
}

export function frontRect(p: Box, depth: number): Rect {
  const f = footprint(p);
  if (p.tilt) {
    // en biais : rectangle qui englobe la bande de profondeur `depth` devant le bord avant
    const [ux, uy] = facing(p), [a, b] = tiltCorners(p);
    return bbox([a, b, [a[0] + depth * ux, a[1] + depth * uy], [b[0] + depth * ux, b[1] + depth * uy]]);
  }
  switch (p.face) {
    case 'S': return { x: f.x, y: f.y + f.h, w: f.w, h: depth };
    case 'N': return { x: f.x, y: f.y - depth, w: f.w, h: depth };
    case 'E': return { x: f.x + f.w, y: f.y, w: depth, h: f.h };
    default: return { x: f.x - depth, y: f.y, w: depth, h: f.h };
  }
}

/** Bandes latérales (gauche, droite), limitées aux `length` derniers cm côté avant ; on ignore toujours `headSkip` cm côté dos. */
export function sideRects(p: Box, depth: number, length: number, headSkip = 70): [Rect, Rect] {
  const f = footprint(p);
  const skip = Math.max(headSkip, p.d - length);
  switch (p.face) {
    case 'S': return [{ x: f.x - depth, y: f.y + skip, w: depth, h: f.h - skip }, { x: f.x + f.w, y: f.y + skip, w: depth, h: f.h - skip }];
    case 'N': return [{ x: f.x - depth, y: f.y, w: depth, h: f.h - skip }, { x: f.x + f.w, y: f.y, w: depth, h: f.h - skip }];
    case 'E': return [{ x: f.x + skip, y: f.y - depth, w: f.w - skip, h: depth }, { x: f.x + skip, y: f.y + f.h, w: f.w - skip, h: depth }];
    default: return [{ x: f.x, y: f.y - depth, w: f.w - skip, h: depth }, { x: f.x, y: f.y + f.h, w: f.w - skip, h: depth }];
  }
}

/** Milieu du dos du meuble (tête de lit). */
export function backCenter(p: Box): Point {
  const f = footprint(p);
  switch (p.face) {
    case 'S': return [f.x + f.w / 2, f.y];
    case 'N': return [f.x + f.w / 2, f.y + f.h];
    case 'E': return [f.x, f.y + f.h / 2];
    default: return [f.x + f.w, f.y + f.h / 2];
  }
}

export const BACK: Record<Face, Point> = { S: [0, -1], N: [0, 1], E: [-1, 0], W: [1, 0] };
export const FRONT: Record<Face, Point> = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };
/** Direction « latérale » utilisée pour pousser un meuble dans un coin. */
export const LATERAL: Record<Face, Point> = { S: [1, 0], N: [-1, 0], E: [0, -1], W: [0, 1] };
/** Côté du meuble qui touche le mur quand son dos est contre un mur donné. */
export const BACK_SIDE: Record<Face, Side> = { S: 'top', N: 'bottom', E: 'left', W: 'right' };
export const ROTATE_CW: Record<Face, Face> = { S: 'W', W: 'N', N: 'E', E: 'S' };

/** Convertit des coordonnées locales (u le long de la largeur, v du dos vers l'avant) en rectangle du plan. */
export function localRect(p: Box, u: number, v: number, du: number, dv: number): Rect {
  const f = footprint(p);
  const map = (uu: number, vv: number): Point => {
    switch (p.face) {
      case 'S': return [f.x + uu, f.y + vv];
      case 'N': return [f.x + p.w - uu, f.y + p.d - vv];
      case 'E': return [f.x + vv, f.y + p.w - uu];
      default: return [f.x + p.d - vv, f.y + uu];
    }
  };
  const [x1, y1] = map(u, v), [x2, y2] = map(u + du, v + dv);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

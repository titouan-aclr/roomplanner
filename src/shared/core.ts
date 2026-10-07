// Boîte à outils commune à toutes les pièces : géométrie, vérifications de base, génération de positions
// et recherche. Les règles propres à une pièce (et sa note) vivent dans son module, src/rooms/<pièce>/.
import {
  BACK, BACK_SIDE, footprint, frontRect, intersection, LATERAL, overlap, overlapArea, pointInPoly, rectInPoly, sideRects,
} from './geometry';
import type {
  Evaluation, FixedElement, FurnitureType, Issue, Layout, PlacedItem, Point, Rect, RoomData, Side, SolveFamily, Zone,
} from './types';

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
export const CELL = 5;
/** Demi-largeur d'un passage : ~45 cm. */
const PASSAGE_RADIUS = 22;

export interface Blocker { r: Rect; label: string }
export type NotchMode = { fixed: FixedElement; mode: 'back' | 'side' };

// =====================================================================
// Géométrie de la pièce
// =====================================================================
export class RoomGeo {
  readonly hard: FixedElement[];
  /** Zones d'entrée (une par porte) : la circulation part de chacune. */
  readonly entries: Zone[];
  readonly sconces: FixedElement[];
  readonly maxX: number;
  readonly maxY: number;

  constructor(readonly data: RoomData) {
    this.hard = data.fixed.filter((f) => f.kind === 'obstacle' && f.rect);
    this.entries = data.zones.filter((z) => z.kind === 'entry');
    this.sconces = data.fixed.filter((f) => f.kind === 'sconce');
    this.maxX = Math.max(...data.polygon.map((p) => p[0]));
    this.maxY = Math.max(...data.polygon.map((p) => p[1]));
  }

  fixed(id: string) { return this.data.fixed.find((f) => f.id === id); }
  opening(id: string) { return this.data.openings.find((o) => o.id === id); }
  zone(id: string) { return this.data.zones.find((z) => z.id === id); }
  fixedLabel(f: FixedElement) { return f.labelDef ?? f.label.toLowerCase(); }

  inRoom(r: Rect) { return rectInPoly(r, this.data.polygon); }
  /** Dans la pièce et hors des obstacles (sauf ceux de `ignore`). */
  fitsFixed(r: Rect, ignore: string[] = []) {
    if (!this.inRoom(r)) return false;
    for (const f of this.hard) if (!ignore.includes(f.id) && overlap(r, f.rect!)) return false;
    return true;
  }
  freeOfZones(r: Rect) { return this.data.zones.every((z) => !overlap(r, z.rect)); }

  /** Dos réellement contre un mur de la pièce (un élément fixe ne compte pas). */
  backOnWall(item: PlacedItem) {
    const f = footprint(item), pts: Point[] = [];
    for (let t = 0.1; t <= 0.91; t += 0.2) {
      if (item.face === 'S') pts.push([f.x + f.w * t, f.y - 3]);
      else if (item.face === 'N') pts.push([f.x + f.w * t, f.y + f.h + 3]);
      else if (item.face === 'E') pts.push([f.x - 3, f.y + f.h * t]);
      else pts.push([f.x + f.w + 3, f.y + f.h * t]);
    }
    return pts.every(([x, y]) => !pointInPoly(x, y, this.data.polygon));
  }

  /**
   * Plateau découpé autour de l'élément fixe `item.notch` : un bord du meuble touche le mur auquel l'élément
   * est adossé. « back » = dos contre ce mur (encoche au milieu du dos), « side » = en épi (encoche dans un coin).
   */
  notch(item: PlacedItem): NotchMode | null {
    if (!item.notch) return null;
    const fx = this.hard.find((h) => h.id === item.notch);
    if (!fx?.rect || !fx.attachedTo) return null;
    const f = footprint(item), r = fx.rect;
    if (!overlap(f, r)) return null;
    const touches = {
      top: Math.abs(f.y - r.y) <= 2,
      bottom: Math.abs(f.y + f.h - (r.y + r.h)) <= 2,
      left: Math.abs(f.x - r.x) <= 2,
      right: Math.abs(f.x + f.w - (r.x + r.w)) <= 2,
    }[fx.attachedTo];
    if (!touches) return null;
    const back = BACK_SIDE[item.face];
    if (back === fx.attachedTo) return { fixed: fx, mode: 'back' };
    if (back === OPPOSITE[fx.attachedTo]) return null;
    return { fixed: fx, mode: 'side' };
  }
  /** Profondeur de l'élément fixe, perpendiculairement à son mur. */
  fixedDepth(f: FixedElement) {
    return f.attachedTo === 'top' || f.attachedTo === 'bottom' ? f.rect!.h : f.rect!.w;
  }
  ignoredFor(item: PlacedItem): string[] {
    const n = this.notch(item);
    return n ? [n.fixed.id] : [];
  }

  /** Espace devant le meuble. En épi découpé, la partie devant l'élément fixe ne compte pas. */
  frontOf(item: PlacedItem, depth: number): Rect {
    const r = frontRect(item, depth);
    const n = this.notch(item);
    if (!n || n.mode !== 'side') return r;
    const fr = n.fixed.rect!;
    switch (n.fixed.attachedTo) {
      case 'top': { const t = fr.y + fr.h; return r.y < t ? { ...r, y: t, h: Math.max(1, r.y + r.h - t) } : r; }
      case 'bottom': { const b = fr.y; return r.y + r.h > b ? { ...r, h: Math.max(1, b - r.y) } : r; }
      case 'left': { const t = fr.x + fr.w; return r.x < t ? { ...r, x: t, w: Math.max(1, r.x + r.w - t) } : r; }
      default: { const b = fr.x; return r.x + r.w > b ? { ...r, w: Math.max(1, b - r.x) } : r; }
    }
  }

  /**
   * Profondeur libre (cm) d'une bande, testée cm par cm, et ce qui la bloque. La bande est rétrécie de 2 cm
   * sur ses bords latéraux pour tolérer les murs légèrement de biais.
   */
  freeDepth(strip: (d: number) => Rect, max: number, blockers: Blocker[]): { depth: number; by: string | null } {
    const blockedBy = (d: number): string | null => {
      const s0 = strip(d), next = strip(d + 1);
      const s = next.w === s0.w ? { ...s0, x: s0.x + 2, w: Math.max(1, s0.w - 4) } : { ...s0, y: s0.y + 2, h: Math.max(1, s0.h - 4) };
      if (!this.inRoom(s)) return 'le mur';
      for (const f of this.hard) if (overlap(s, f.rect!)) return this.fixedLabel(f);
      for (const b of blockers) if (overlap(s, b.r)) return b.label.toLowerCase();
      return null;
    };
    // pas de 5 cm, puis affinage au centimètre (la bande ne fait que grandir, le blocage est monotone)
    let free = 0;
    for (let d = 5; d <= max; d += 5) { if (blockedBy(d)) break; free = d; }
    for (let d = free + 1; d <= max; d++) {
      const by = blockedBy(d);
      if (by) return { depth: d - 1, by };
    }
    return { depth: max, by: null };
  }

  /** Cases de 5 cm accessibles depuis l'entrée par un passage d'environ 45 cm. */
  private baseGrid?: Uint8Array;
  /** Cases bloquées de la pièce vide (murs et obstacles), calculées une seule fois. */
  private emptyGrid(W: number, H: number) {
    if (this.baseGrid) return this.baseGrid;
    const g = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const cx = i * CELL + CELL / 2, cy = j * CELL + CELL / 2;
      let b = !pointInPoly(cx, cy, this.data.polygon);
      if (!b) for (const h of this.hard) { const r = h.rect!; if (cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h) { b = true; break; } }
      g[j * W + i] = b ? 1 : 0;
    }
    return (this.baseGrid = g);
  }

  circulation(rects: Rect[]) {
    const W = Math.ceil(this.maxX / CELL), H = Math.ceil(this.maxY / CELL);
    const blocked = this.emptyGrid(W, H).slice();
    for (const r of rects) {
      // cases dont le centre est strictement dans le rectangle
      const i0 = Math.max(0, Math.floor((r.x - CELL / 2) / CELL) + 1), i1 = Math.min(W - 1, Math.ceil((r.x + r.w - CELL / 2) / CELL) - 1);
      const j0 = Math.max(0, Math.floor((r.y - CELL / 2) / CELL) + 1), j1 = Math.min(H - 1, Math.ceil((r.y + r.h - CELL / 2) / CELL) - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * W + i] = 1;
    }
    const dist = new Float64Array(W * H);
    for (let k = 0; k < W * H; k++) dist[k] = blocked[k] ? 0 : 1e9;
    const a = CELL, b = CELL * Math.SQRT2;
    const g = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : dist[j * W + i]);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i; if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], g(i - 1, j) + a, g(i, j - 1) + a, g(i - 1, j - 1) + b, g(i + 1, j - 1) + b);
    }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i; if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], g(i + 1, j) + a, g(i, j + 1) + a, g(i + 1, j + 1) + b, g(i - 1, j + 1) + b);
    }
    const pass = (k: number) => dist[k] >= PASSAGE_RADIUS;
    const reach = new Uint8Array(W * H);
    const queue: number[] = [];
    for (const { rect: door } of this.entries) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const cx = i * CELL + CELL / 2, cy = j * CELL + CELL / 2, k = j * W + i;
      if (!reach[k] && cx > door.x + 15 && cx < door.x + door.w - 15 && cy > door.y && cy < door.y + door.h && pass(k)) { reach[k] = 1; queue.push(k); }
    }
    while (queue.length) {
      const k = queue.pop()!, i = k % W, j = (k - i) / W;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni; if (!reach[nk] && pass(nk)) { reach[nk] = 1; queue.push(nk); }
      }
    }
    let area = 0; for (let k = 0; k < W * H; k++) if (reach[k]) area++;
    return {
      W, H, cells: reach,
      areaM2: (area * CELL * CELL) / 10000,
      reaches(r: Rect) {
        for (let j = Math.max(0, Math.floor(r.y / CELL)); j < Math.min(H, Math.ceil((r.y + r.h) / CELL)); j++)
          for (let i = Math.max(0, Math.floor(r.x / CELL)); i < Math.min(W, Math.ceil((r.x + r.w) / CELL)); i++) if (reach[j * W + i]) return true;
        return false;
      },
    };
  }

  // ---------- Génération de positions ----------
  private push(p: PlacedItem, dir: Point, ignore: string[] = []): { pos: PlacedItem; hit: boolean } {
    let cur = p;
    for (let i = 0; i < 400; i++) {
      const next = { ...cur, x: cur.x + dir[0], y: cur.y + dir[1] };
      if (!this.fitsFixed(footprint(next), ignore)) return { pos: cur, hit: true };
      cur = next;
    }
    return { pos: cur, hit: false };
  }

  /** Positions dos au mur, poussées dans les coins, et (option) côté contre un mur. */
  wallCandidates(tpl: PlacedItem, sizes: { w: number; d: number }[], opts: { step: number; sidePush?: boolean }): PlacedItem[] {
    const out = new Map<string, PlacedItem>();
    const add = (m: PlacedItem) => { const k = `${m.face}|${m.x}|${m.y}|${m.w}|${m.d}`; if (!out.has(k)) out.set(k, m); };
    for (const s of sizes) for (const face of ['S', 'N', 'E', 'W'] as const) {
      for (let gx = 0; gx <= this.maxX; gx += opts.step) for (let gy = 0; gy <= this.maxY; gy += opts.step) {
        const base: PlacedItem = { ...tpl, face, x: gx, y: gy, w: s.w, d: s.d, notch: undefined };
        if (!this.fitsFixed(footprint(base))) continue;
        const back = this.push(base, BACK[face]);
        if (back.hit) {
          add(back.pos);
          const lat = LATERAL[face];
          const l = this.push(back.pos, lat); if (l.hit) add(l.pos);
          const r = this.push(back.pos, [-lat[0], -lat[1]]); if (r.hit) add(r.pos);
        }
        if (opts.sidePush) {
          const lat = LATERAL[face];
          for (const dir of [lat, [-lat[0], -lat[1]] as Point]) { const s2 = this.push(base, dir); if (s2.hit) add(s2.pos); }
        }
      }
    }
    return [...out.values()];
  }

  /** Positions découpées autour d'un élément fixe : dos au mur ou en épi. */
  notchCandidates(tpl: PlacedItem, sizes: { w: number; d: number }[], fixedId: string, step: number, minDepthInFront = 30): PlacedItem[] {
    const fx = this.hard.find((h) => h.id === fixedId);
    if (!fx?.rect || fx.attachedTo !== 'top') return []; // seul cas utilisé pour l'instant : élément adossé au mur du haut
    const out: PlacedItem[] = [];
    const y = fx.rect.y, depth = this.fixedDepth(fx);
    for (const s of sizes) {
      if (s.d - depth >= minDepthInFront) {
        for (let x = 0; x + s.w <= this.maxX; x += step) {
          const p: PlacedItem = { ...tpl, face: 'S', x, y, w: s.w, d: s.d, notch: fixedId };
          if (this.notch(p) && this.fitsFixed(footprint(p), [fixedId])) out.push(p);
        }
      }
      for (const face of ['E', 'W'] as const) for (let x = 0; x <= this.maxX; x += step / 2) {
        const p: PlacedItem = { ...tpl, face, x, y, w: s.w, d: s.d, notch: fixedId };
        const n = this.notch(p);
        if (!n) continue;
        const cut = intersection(footprint(p), fx.rect);
        if (cut.w > 0 && cut.w <= s.d - 25 && this.fitsFixed(footprint(p), [fixedId])) out.push(p);
      }
    }
    return out;
  }

  /** Positions adossées à un autre meuble (pied du lit, dos du bureau…). */
  backToCandidates(tpl: PlacedItem, others: PlacedItem[], step: number): PlacedItem[] {
    const out: PlacedItem[] = [];
    for (const o of others) {
      const f = footprint(o);
      for (let t = -tpl.w + 20; t <= Math.max(f.w, f.h) - 20; t += step) {
        out.push({ ...tpl, face: 'N', x: f.x + t, y: f.y - tpl.d });
        out.push({ ...tpl, face: 'S', x: f.x + t, y: f.y + f.h });
        out.push({ ...tpl, face: 'W', x: f.x - tpl.d, y: f.y + t });
        out.push({ ...tpl, face: 'E', x: f.x + f.w, y: f.y + t });
      }
    }
    return out.filter((c) => this.fitsFixed(footprint(c)) && this.freeOfZones(footprint(c)));
  }

  /** Côté du mur contre lequel le meuble est placé, pour regrouper les résultats en familles. */
  wallName(p: PlacedItem | null | undefined): string {
    if (!p) return '-';
    const n = this.notch(p);
    if (n) return n.mode === 'back' ? n.fixed.label.toLowerCase() : `${n.fixed.label.toLowerCase()} en épi`;
    return { S: 'haut', N: 'bas', E: 'gauche', W: 'droite' }[p.face];
  }
}

// =====================================================================
// Vérifications communes, réutilisées par l'évaluation de chaque pièce
// =====================================================================
export class Checker {
  readonly items: PlacedItem[];
  readonly fp: Map<string, Rect>;
  readonly errors: Issue[] = [];
  readonly notes: Issue[] = [];
  score = 0;
  frontDepth: Record<string, number> = {};
  fronts = new Map<string, Rect>();
  sideDepths: Evaluation['sideDepths'] = {};
  bedSides = 0;
  bedFoot = false;
  circ!: ReturnType<RoomGeo['circulation']>;

  constructor(readonly geo: RoomGeo, readonly catalog: Record<string, FurnitureType>, layout: Layout) {
    this.items = layout.filter((it) => !it.hidden);
    this.fp = new Map(this.items.map((it) => [it.id, footprint(it)]));
  }

  err(item: string | null, msg: string) { this.errors.push({ sev: 'error', item, msg }); }
  warn(item: string | null, msg: string) { this.notes.push({ sev: 'warn', item, msg }); }
  info(item: string | null, msg: string) { this.notes.push({ sev: 'info', item, msg }); }

  spec(it: PlacedItem): FurnitureType { return this.catalog[it.type] ?? this.catalog.custom; }
  byType(type: string) { return this.items.filter((it) => it.type === type); }
  others(id: string): Blocker[] { return this.items.filter((o) => o.id !== id).map((o) => ({ r: this.fp.get(o.id)!, label: o.label })); }
  front(it: PlacedItem) {
    const f = this.spec(it).front;
    const comfort = it.clear ?? f?.comfort ?? 0;
    if (!comfort) return null;
    return { comfort, min: Math.min(it.min ?? f?.min ?? comfort, comfort), what: f?.what ?? 'devant' };
  }

  /** Murs, obstacles, zones à garder libres, largeurs autorisées, plateaux découpés. */
  placement() {
    const { geo } = this;
    for (const it of this.items) {
      const f = this.fp.get(it.id)!, spec = this.spec(it);
      if (!geo.inRoom(f)) this.err(it.id, `${it.label} dépasse des murs.`);
      const ignore = geo.ignoredFor(it);
      for (const h of geo.hard) if (!ignore.includes(h.id) && overlap(f, h.rect!)) {
        const hint = spec.notchable === h.id ? ` (coche « découpé autour de ${geo.fixedLabel(h)} » pour l'intégrer)` : '';
        this.err(it.id, `${it.label} chevauche ${geo.fixedLabel(h)}${hint}.`);
      }
      for (const z of geo.data.zones) if (overlap(f, z.rect)) this.err(it.id, z.message.replace('{item}', it.label));
      const wr = spec.width;
      if (wr) {
        if (wr.min && it.w < wr.min) this.err(it.id, `${it.label} : ${it.w} cm de large, sous ta limite de ${wr.min} cm.`);
        else if (wr.soft && it.w < wr.soft) { this.warn(it.id, `${it.label} : ${it.w} cm de large, sous les ${wr.soft} cm souhaités (accepté jusqu'à ${wr.min ?? 0}).`); this.score -= (wr.soft - it.w) * 0.5; }
        if (wr.max && it.w > wr.max) this.err(it.id, `${it.label} : ${it.w} cm de large, au-dessus de ta limite de ${wr.max} cm.`);
      }
      if (it.notch && !geo.notch(it)) {
        const fx = geo.fixed(it.notch);
        if (fx?.rect && overlap(f, fx.rect)) this.err(it.id, `${it.label} : pour l'intégrer à ${geo.fixedLabel(fx)}, un bord du plateau doit toucher le mur derrière.`);
      }
    }
  }

  overlaps() {
    const its = this.items;
    for (let a = 0; a < its.length; a++) for (let b = a + 1; b < its.length; b++)
      if (overlap(this.fp.get(its[a].id)!, this.fp.get(its[b].id)!)) this.err(its[a].id, `${its[a].label} et ${its[b].label.toLowerCase()} se chevauchent.`);
  }

  wallFixed(type: string) {
    for (const it of this.byType(type)) if (!this.geo.backOnWall(it))
      this.err(it.id, `${it.label} : doit être fixée contre un vrai mur (${it.h ?? this.spec(it).h} cm de haut), pas contre un élément fixe ni dans le vide.`);
  }

  /** Espace devant : sous le minimum c'est bloquant, sous le confort c'est un avertissement. */
  frontClearances() {
    for (const it of this.items) {
      const fr = this.front(it);
      if (!fr) continue;
      const fd = this.geo.freeDepth((d) => this.geo.frontOf(it, d), fr.comfort, this.others(it.id));
      this.frontDepth[it.id] = fd.depth;
      this.fronts.set(it.id, this.geo.frontOf(it, Math.max(1, Math.min(fd.depth, fr.comfort))));
      if (fd.depth < fr.min) this.err(it.id, `${it.label} : ${fd.depth} cm ${fr.what}, bloqué par ${fd.by} (minimum ${fr.min}).`);
      else if (fd.depth < fr.comfort) { this.warn(it.id, `${it.label} : ${fd.depth} cm ${fr.what} (confort ${fr.comfort}, minimum ${fr.min}).`); this.score -= (fr.comfort - fd.depth) * 0.4; }
    }
  }

  /** Avertit si l'espace devant un meuble empiète sur une zone (entrée, ouverture de fenêtre). */
  frontInZones(type: string, subject: string, penalties: { entry: number; keepFree: number }) {
    for (const it of this.byType(type)) {
      const zone = this.fronts.get(it.id);
      if (!zone) continue;
      for (const z of this.geo.data.zones) {
        if (!z.frontWarning || overlapArea(zone, z.rect) <= (z.kind === 'entry' ? 0 : 400)) continue;
        this.warn(it.id, z.frontWarning.replace('{what}', subject));
        this.score -= z.kind === 'entry' ? penalties.entry : penalties.keepFree;
      }
    }
  }

  /** Circulation depuis la porte, et accès à l'espace devant chaque meuble. */
  reachability() {
    this.circ = this.geo.circulation([...this.fp.values()]);
    for (const it of this.items) {
      const zone = this.fronts.get(it.id), fr = this.front(it);
      if (zone && fr && this.frontDepth[it.id] >= fr.min && !this.circ.reaches(zone))
        this.err(it.id, `${it.label} : on ne peut pas y accéder depuis la porte (passage < 45 cm).`);
    }
  }

  /** Accès par les côtés (les `footLength` derniers cm), sinon par le pied. */
  sideAccess(type: string, footLength: number, bothSidesBonus: number) {
    for (const it of this.byType(type)) {
      const s = this.spec(it).sides;
      if (!s) continue;
      const comfy = it.sides ?? s.comfort, min = it.sidesMin ?? s.min;
      const block = this.others(it.id);
      const depths = [0, 1].map((k) => this.geo.freeDepth((d) => sideRects(it, d, footLength)[k], 80, block).depth);
      const usable = depths.map((d, k) => d >= min && this.circ.reaches(sideRects(it, Math.min(d, 60), footLength)[k]));
      const count = usable.filter(Boolean).length;
      this.sideDepths[it.id] = depths.map((d, k) => ({ depth: d, ok: usable[k] }));
      let foot = false;
      if (count === 0) {
        const fd = this.geo.freeDepth((d) => frontRect(it, d), 80, block).depth;
        foot = fd >= min && this.circ.reaches(frontRect(it, Math.min(fd, 60)));
        if (foot) { this.warn(it.id, `${it.label} : accessible seulement par le pied (${fd} cm), on y entre à quatre pattes.`); this.score -= 15; }
        else this.err(it.id, `${it.label} : aucun accès, ni par les côtés ni par le pied (${min} cm minimum).`);
      } else if (count === 1) this.info(it.id, `${it.label} accessible d’un seul côté.`);
      depths.forEach((d, k) => {
        if (usable[k] && d < comfy) { this.warn(it.id, `${it.label} : passage de ${d} cm sur un côté (confort ${comfy}).`); this.score -= (comfy - d) * 0.2; }
        if (d > 8 && d < min) this.info(it.id, `${it.label} : espace perdu de ${d} cm sur un côté (trop étroit pour passer).`);
      });
      if (count === 2) this.score += bothSidesBonus;
      this.bedSides = count; this.bedFoot = foot;
    }
  }

  /** Meuble placé devant une source de chaleur. */
  heat(type: string, penalty: number, message: string) {
    for (const it of this.byType(type)) {
      const f = this.fp.get(it.id)!;
      if (this.geo.hard.some((h) => h.heatZone && overlapArea(f, h.heatZone) > 0)) { this.warn(it.id, message); this.score -= penalty; }
    }
  }

  /** Meuble haut qui masque une applique murale. */
  sconces(type: string) {
    const { geo } = this;
    for (const it of this.byType(type)) {
      const f = this.fp.get(it.id)!, h = it.h ?? this.spec(it).h;
      for (const s of geo.sconces) {
        if (h < (s.bottom ?? 0) || s.at == null) continue;
        const half = (s.span ?? 24) / 2;
        const against = s.wall === 'left' ? f.x < 8 : s.wall === 'right' ? f.x + f.w > geo.maxX - 8 : s.wall === 'top' ? f.y < 8 : f.y + f.h > geo.maxY - 8;
        const along = s.wall === 'left' || s.wall === 'right' ? f.y < s.at + half && f.y + f.h > s.at - half : f.x < s.at + half && f.x + f.w > s.at - half;
        if (against && along) { this.score -= 3; this.info(it.id, `${it.label} devant une applique : il faudra la déplacer.`); }
      }
    }
  }

  result(freeAreaWeight: number): Evaluation {
    this.score += this.circ.areaM2 * freeAreaWeight;
    return {
      ok: this.errors.length === 0,
      score: Math.round(this.score * 10) / 10,
      issues: this.errors.concat(this.notes),
      bedSides: this.bedSides, bedFoot: this.bedFoot,
      sideDepths: this.sideDepths, frontDepth: this.frontDepth,
      freeM2: this.circ.areaM2,
      reach: { W: this.circ.W, H: this.circ.H, cell: CELL, cells: this.circ.cells },
    };
  }
}

// =====================================================================
// Recherche
// =====================================================================
/** Deux meubles se gênent : emprises qui se chevauchent ou meuble dans l'espace minimum devant l'autre. */
export function makeClash(geo: RoomGeo, minFront: (it: PlacedItem) => number) {
  return (a: PlacedItem, b: PlacedItem) => {
    const fa = footprint(a), fb = footprint(b);
    if (overlap(fa, fb)) return true;
    const ma = minFront(a), mb = minFront(b);
    if (ma && overlap(geo.frontOf(a, ma), fb)) return true;
    if (mb && overlap(geo.frontOf(b, mb), fa)) return true;
    return false;
  };
}

/**
 * Parcourt toutes les combinaisons (un candidat par groupe, `null` = meuble absent si autorisé),
 * en coupant dès que deux meubles se gênent.
 */
export function backtrack(groups: (PlacedItem | null)[][], clash: (a: PlacedItem, b: PlacedItem) => boolean, onLeaf: (layout: PlacedItem[]) => void) {
  const chosen: PlacedItem[] = [];
  const rec = (i: number) => {
    if (i === groups.length) { onLeaf(chosen.slice()); return; }
    for (const c of groups[i]) {
      if (c === null) { rec(i + 1); continue; }
      if (chosen.some((o) => clash(o, c))) continue;
      chosen.push(c); rec(i + 1); chosen.pop();
    }
  };
  rec(0);
}

/** Garde la meilleure disposition de chaque famille (même mur pour chaque meuble). */
export function families(results: { layout: Layout; ev: Evaluation }[], signature: (l: Layout) => string, describe: (l: Layout) => string, limit: number): SolveFamily[] {
  const seen = new Map<string, { layout: Layout; ev: Evaluation }>();
  for (const r of [...results].sort((a, b) => b.ev.score - a.ev.score)) {
    const s = signature(r.layout);
    if (!seen.has(s)) seen.set(s, r);
  }
  return [...seen.values()].slice(0, limit).map((r) => ({
    layout: r.layout, score: r.ev.score, freeM2: r.ev.freeM2, bedSides: r.ev.bedSides, bedFoot: r.ev.bedFoot, summary: describe(r.layout),
  }));
}

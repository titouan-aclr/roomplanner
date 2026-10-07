// Stratégie de recherche du séjour. Le canapé et le fauteuil peuvent aller contre un mur ou au milieu de la pièce,
// la table ronde n'importe où : on procède par étapes (canapé, table, fauteuil, piano) en ne gardant à chaque
// étape que les meilleures dispositions de chaque « concept », pour présenter des idées variées.
// Le lampadaire et la table d'appoint ne sont pas cherchés : ils se placent à la main.
import { families, makeClash, type RoomGeo } from '../../shared/core';
import { footprint } from '../../shared/geometry';
import type { Evaluation, Layout, PlacedItem, SolveOptions, SolveResult } from '../../shared/types';
import { catalog } from './catalog';
import { allowedInFront, evaluateSejour } from './rules';

type Scored = { layout: Layout; ev: Evaluation };
const BEAM = 120;
/** Pas de la grille pour les positions au milieu de la pièce. La pièce est petite : peu de positions sont possibles. */
const FREE_STEP = 10;
const uniq = (xs: number[]) => [...new Set(xs)];
const LAT: Record<string, [number, number]> = { S: [1, 0], N: [1, 0], E: [0, 1], W: [0, 1] };
const ARROW: Record<string, string> = { S: '↓', N: '↑', E: '→', W: '←' };

export function solveSejour(geo: RoomGeo, base: Layout, opts: SolveOptions = {}): SolveResult {
  const t0 = Date.now();
  const step = opts.step ?? 10;
  const visible = (type: string) => base.find((it) => it.type === type && !it.hidden);
  const tpl = (type: string): PlacedItem => {
    const cur = visible(type), spec = catalog[type];
    return cur ? { ...cur, notch: undefined } : { id: type, type, label: spec.label, face: 'S', x: 0, y: 0, w: spec.w, d: spec.d };
  };
  const sizes = (type: string, cur: PlacedItem) => {
    const r = catalog[type].width;
    const ws = uniq(opts.sizes?.[type]?.widths?.length ? opts.sizes[type].widths! : [cur.w]).filter((w) => (!r?.min || w >= r.min) && (!r?.max || w <= r.max));
    const ds = uniq(opts.sizes?.[type]?.depths?.length ? opts.sizes[type].depths! : [cur.d]);
    return ws.flatMap((w) => ds.map((d) => ({ w, d })));
  };
  const minFront = (it: PlacedItem) => (it.min ?? catalog[it.type]?.front?.min ?? 0);
  const usable = (c: PlacedItem) => {
    const f = footprint(c);
    if (!geo.fitsFixed(f) || !geo.freeOfZones(f)) return false;
    const m = minFront(c);
    return !m || geo.fitsFixed(geo.frontOf(c, m));
  };
  const clash = makeClash(geo, minFront, allowedInFront);
  let evaluated = 0;
  const score = (layout: Layout): Scored | null => {
    evaluated++;
    const ev = evaluateSejour(geo, layout);
    return ev.ok ? { layout, ev } : null;
  };

  /** Contre un mur, ou au milieu de la pièce (éventuellement un côté contre un mur), dans les 4 orientations. */
  const anywhere = (t: PlacedItem, sz: { w: number; d: number }[], freeStep: number) => {
    const out = new Map<string, PlacedItem>();
    const add = (m: PlacedItem) => { if (usable(m)) out.set(`${m.face}|${m.x}|${m.y}|${m.w}|${m.d}`, m); };
    for (const m of geo.wallCandidates(t, sz, { step })) add(m);
    for (const { w, d } of sz) for (const face of ['S', 'N', 'E', 'W'] as const)
      for (let x = 0; x <= geo.maxX; x += freeStep) for (let y = 0; y <= geo.maxY; y += freeStep) {
        const p: PlacedItem = { ...t, face, x, y, w, d, notch: undefined };
        if (!geo.fitsFixed(footprint(p))) continue;
        add(p);
        const [dx, dy] = LAT[face];
        for (const dir of [[dx, dy], [-dx, -dy]] as [number, number][]) { const r = geo.push(p, dir); if (r.hit) add(r.pos); }
      }
    return [...out.values()];
  };

  /** Où est un meuble : contre quel mur ou au milieu, son orientation et le tiers de la pièce où il se trouve. */
  const third = (it: PlacedItem) => {
    const f = footprint(it);
    return `${Math.min(2, Math.floor(((f.x + f.w / 2) / geo.maxX) * 3))}${Math.min(2, Math.floor(((f.y + f.h / 2) / geo.maxY) * 3))}`;
  };
  const place = (it: PlacedItem | undefined, withFace = true) => (it ? `${geo.backOnWall(it) ? geo.wallName(it) : 'milieu'}${withFace ? it.face : ''}${third(it)}` : '-');
  const get = (l: Layout, t: string) => l.find((i) => i.type === t);
  const concept = (l: Layout) => {
    const t = get(l, 'table');
    return [place(get(l, 'sofa')), t ? third(t) : '-', place(get(l, 'armchair'), false), place(get(l, 'piano'))].join('/');
  };
  /** Garde les meilleures dispositions, au plus `perKey` par concept. */
  const prune = (list: Scored[], key = concept, limit = BEAM, perKey = 2) => {
    const per = new Map<string, number>(), out: Scored[] = [];
    for (const r of list.sort((a, b) => b.ev.score - a.ev.score)) {
      const s = key(r.layout), n = per.get(s) ?? 0;
      if (n >= perKey) continue;
      per.set(s, n + 1);
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  };
  /** Ajoute un meuble à chaque disposition retenue ; s'il est optionnel, on garde aussi la version sans. */
  const expand = (beam: Scored[], candidates: (l: Layout) => PlacedItem[], optional: boolean) => {
    const next: Scored[] = optional ? [...beam] : [];
    for (const b of beam) for (const c of candidates(b.layout)) {
      if (b.layout.some((o) => clash(o, c))) continue;
      const r = score([...b.layout, c]);
      if (r) next.push(r);
    }
    return prune(next);
  };

  // 1. Canapé : partout, une seule position par orientation, largeur et case de 30 cm
  let beam: Scored[] = [{ layout: [], ev: evaluateSejour(geo, []) }];
  if (visible('sofa')) {
    const st = tpl('sofa');
    const sofas = anywhere(st, sizes('sofa', st), FREE_STEP).map((s) => score([s])).filter((r): r is Scored => !!r);
    beam = prune(sofas, (l) => `${l[0].face}${l[0].w}|${Math.round(l[0].x / 30)}|${Math.round(l[0].y / 30)}`, 200, 1);
  }

  // 2. Table ronde, puis affinée à 5 cm près
  const tableT = tpl('table');
  const tables: PlacedItem[] = [];
  for (let x = 0; x <= geo.maxX; x += FREE_STEP) for (let y = 0; y <= geo.maxY; y += FREE_STEP) {
    const p: PlacedItem = { ...tableT, face: 'S', x, y };
    if (usable(p)) tables.push(p);
  }
  beam = expand(beam, () => tables, false);
  const refined: Scored[] = [...beam];
  for (const b of beam) {
    const t = get(b.layout, 'table')!, rest = b.layout.filter((i) => i !== t);
    for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) {
      const p = { ...t, x: t.x + dx, y: t.y + dy };
      if (!usable(p) || rest.some((o) => clash(o, p))) continue;
      const r = score([...rest, p]);
      if (r) refined.push(r);
    }
  }
  beam = prune(refined, concept, BEAM, 1);

  // 3. Fauteuil : contre un mur ou au milieu, dans n'importe quelle orientation
  if (visible('armchair')) {
    const a = tpl('armchair');
    const cands = anywhere(a, sizes('armchair', a), 20);
    beam = expand(beam, () => cands, true);
  }
  // 4. Piano (optionnel), contre un mur ou adossé à un meuble
  if (visible('piano')) {
    const pt = tpl('piano');
    const wall = geo.wallCandidates(pt, sizes('piano', pt), { step }).filter(usable);
    beam = expand(beam, (l) => wall.concat(geo.backToCandidates(pt, l, step).filter(usable)), true);
  }

  const where = (it: PlacedItem) => (geo.backOnWall(it) ? `mur ${geo.wallName(it)}` : `au milieu ${ARROW[it.face]}`);
  const describe = (l: Layout) => {
    const sofa = get(l, 'sofa'), arm = get(l, 'armchair'), piano = get(l, 'piano');
    const chairs = (evaluateSejour(geo, l).seats?.table ?? []).length;
    return [
      sofa ? `canapé ${sofa.w} ${where(sofa)}` : 'sans canapé',
      arm ? `fauteuil ${where(arm)}` : '',
      piano ? `piano ${where(piano)}` : '',
      `${chairs} chaises`,
    ].filter(Boolean).join(' · ');
  };
  return { families: families(beam, concept, describe, opts.limit ?? 20), evaluated, valid: beam.length, ms: Date.now() - t0 };
}

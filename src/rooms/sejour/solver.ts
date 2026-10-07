// Stratégie de recherche du séjour. La table ronde peut aller n'importe où, ce qui multiplie les combinaisons :
// on procède par étapes dans l'ordre de priorité (table, canapé, table basse, fauteuil, lampadaire, piano)
// en ne gardant à chaque étape que les meilleures dispositions, variées, avant d'ajouter le meuble suivant.
import { families, makeClash, type RoomGeo } from '../../shared/core';
import { footprint, frontRect } from '../../shared/geometry';
import type { Evaluation, Layout, PlacedItem, SolveOptions, SolveResult } from '../../shared/types';
import { catalog } from './catalog';
import { evaluateSejour } from './rules';

type Scored = { layout: Layout; ev: Evaluation };
const BEAM = 120;
const uniq = (xs: number[]) => [...new Set(xs)];

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
  const clash = makeClash(geo, minFront);
  let evaluated = 0;
  const score = (layout: Layout): Scored | null => {
    evaluated++;
    const ev = evaluateSejour(geo, layout);
    return ev.ok ? { layout, ev } : null;
  };

  const sig = (l: Layout) => {
    const t = l.find((i) => i.type === 'table');
    const cell = t ? `${Math.round(t.x / 60)}-${Math.round(t.y / 60)}` : '-';
    return [cell, ...['sofa', 'coffee', 'armchair', 'lamp', 'piano'].map((k) => geo.wallName(l.find((i) => i.type === k)))].join('/');
  };
  /** Garde les meilleures dispositions, au plus `perKey` par famille. */
  const prune = (list: Scored[], key = sig, limit = BEAM, perKey = 3) => {
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

  // 1. Table ronde et canapé, les deux meubles indispensables : toutes les paires possibles.
  //    (Placer la table seule d'abord gardait des positions qui empêchaient le reste.)
  const tableT = tpl('table');
  const tables: PlacedItem[] = [];
  for (let x = 0; x <= geo.maxX; x += step) for (let y = 0; y <= geo.maxY; y += step) {
    const p: PlacedItem = { ...tableT, face: 'S', x, y };
    if (usable(p)) tables.push(p);
  }
  const pairs: Scored[] = [];
  const sofaT = visible('sofa') ? tpl('sofa') : null;
  const sofas = sofaT ? geo.wallCandidates(sofaT, sizes('sofa', sofaT), { step }).filter(usable) : [null];
  for (const s of sofas) for (const t of tables) {
    if (s && clash(s, t)) continue;
    const r = score(s ? [t, s] : [t]);
    if (r) pairs.push(r);
  }
  let beam = prune(pairs);

  /** Positions collées à un côté du canapé ou du fauteuil (pour le lampadaire ou une petite table d'appoint). */
  const besideSeats = (l: Layout, it: PlacedItem, w: number, d: number): PlacedItem[] => {
    const out: PlacedItem[] = [];
    for (const s of l.filter((i) => i.type === 'sofa' || i.type === 'armchair')) {
      const f = footprint(s);
      for (const [x, y] of [[f.x - w - 2, f.y], [f.x + f.w + 2, f.y], [f.x - w - 2, f.y + f.h - d], [f.x + f.w + 2, f.y + f.h - d], [f.x, f.y - d - 2], [f.x + f.w - w, f.y - d - 2], [f.x, f.y + f.h + 2], [f.x + f.w - w, f.y + f.h + 2]]) {
        const p: PlacedItem = { ...it, face: 'S', x, y, w, d };
        if (usable(p)) out.push(p);
      }
    }
    return out;
  };

  // 2. Lampadaire : contre un côté du canapé ou du fauteuil, ou dans un coin
  if (visible('lamp')) {
    const lt = tpl('lamp');
    const corners = geo.wallCandidates(lt, [{ w: lt.w, d: lt.d }], { step: 30 }).filter(usable);
    beam = expand(beam, (l) => { const b = besideSeats(l, lt, lt.w, lt.d); return b.length ? b : corners; }, true);
  }
  // 3. Fauteuil
  if (visible('armchair')) {
    const a = tpl('armchair');
    const cands = geo.wallCandidates(a, sizes('armchair', a), { step }).filter(usable);
    beam = expand(beam, () => cands, true);
  }
  // 4. Table basse ou d'appoint : centrée devant le canapé, ou à côté d'une assise si elle est petite
  if (visible('coffee')) {
    const ct = tpl('coffee');
    const coffeeSizes = sizes('coffee', ct);
    beam = expand(beam, (l) => {
      const sofa = l.find((i) => i.type === 'sofa');
      const out: PlacedItem[] = [];
      for (const { w, d } of coffeeSizes) {
        if (w <= 50 && d <= 50) out.push(...besideSeats(l, ct, w, d));
        if (!sofa) continue;
        const fr = frontRect(sofa, 45 + d);
        const horiz = sofa.face === 'S' || sofa.face === 'N';
        const face = sofa.face === 'S' ? 'N' : sofa.face === 'N' ? 'S' : sofa.face === 'E' ? 'W' : 'E';
        const fw = horiz ? w : d, fh = horiz ? d : w;
        const x = horiz ? Math.round(fr.x + (fr.w - fw) / 2) : sofa.face === 'E' ? fr.x + 45 : fr.x;
        const y = horiz ? (sofa.face === 'S' ? fr.y + 45 : fr.y) : Math.round(fr.y + (fr.h - fh) / 2);
        const p: PlacedItem = { ...ct, face, x, y, w, d };
        if (usable(p)) out.push(p);
      }
      return out;
    }, true);
  }
  // 5. Piano (optionnel), contre un mur ou adossé à un meuble
  if (visible('piano')) {
    const pt = tpl('piano');
    const wall = geo.wallCandidates(pt, sizes('piano', pt), { step }).filter(usable);
    beam = expand(beam, (l) => wall.concat(geo.backToCandidates(pt, l, step).filter(usable)), true);
  }

  const describe = (l: Layout) => {
    const get = (t: string) => l.find((i) => i.type === t);
    const sofa = get('sofa'), arm = get('armchair');
    return [
      `Table ${get('table') ? '' : 'absente'}`.trim(),
      sofa ? `canapé ${sofa.w} ${geo.wallName(sofa)}` : '',
      get('coffee') ? `table d'appoint ${get('coffee')!.w}×${get('coffee')!.d}` : '',
      arm ? `fauteuil ${geo.wallName(arm)}` : '',
      get('lamp') ? 'lampadaire' : '',
      get('piano') ? `piano ${geo.wallName(get('piano'))}` : '',
    ].filter(Boolean).join(' · ');
  };
  return { families: families(beam, sig, describe, opts.limit ?? 8), evaluated, valid: beam.length, ms: Date.now() - t0 };
}

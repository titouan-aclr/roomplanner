// Stratégie de recherche de la chambre : lit, armoire et bureau obligatoires, commode si possible,
// puis piano essayé sur les meilleures dispositions de chaque famille (sinon la recherche est trop longue).
import { backtrack, families, makeClash, type RoomGeo } from '../../shared/core';
import { footprint } from '../../shared/geometry';
import type { Evaluation, Layout, PlacedItem, SolveOptions, SolveResult } from '../../shared/types';
import { catalog } from './catalog';
import { evaluateChambre } from './rules';

const uniq = (xs: number[]) => [...new Set(xs)];

export function solveChambre(geo: RoomGeo, base: Layout, opts: SolveOptions = {}): SolveResult {
  const t0 = Date.now();
  const step = opts.step ?? 10;
  const visible = (type: string) => base.find((it) => it.type === type && !it.hidden);
  const tpl = (type: string): PlacedItem => {
    const cur = visible(type), spec = catalog[type];
    return cur ? { ...cur, notch: undefined } : { id: type, type, label: spec.label, face: 'S', x: 0, y: 0, w: spec.w, d: spec.d };
  };
  const minFront = (it: PlacedItem) => (it.min ?? catalog[it.type]?.front?.min ?? 0);
  const inWidth = (type: string) => (w: number) => {
    const r = catalog[type].width;
    return (!r?.min || w >= r.min) && (!r?.max || w <= r.max);
  };
  /** Filtre commun : hors zones à garder libres, et espace minimum devant possible. */
  const usable = (c: PlacedItem) => {
    if (!geo.freeOfZones(footprint(c))) return false;
    const m = minFront(c);
    return !m || geo.fitsFixed(geo.frontOf(c, m), geo.ignoredFor(c));
  };

  const bedT = tpl('bed'), wardT = tpl('wardrobe'), deskT = tpl('desk');
  const beds = geo.wallCandidates(bedT, [{ w: bedT.w, d: bedT.d }], { step }).filter(usable);
  const wardrobes = geo.wallCandidates(wardT, uniq([140, 160, wardT.w]).filter(inWidth('wardrobe')).map((w) => ({ w, d: wardT.d })), { step })
    .filter((c) => geo.backOnWall(c) && usable(c));
  const deskSizes = uniq([140, 160, deskT.w]).filter(inWidth('desk')).flatMap((w) => uniq([60, 70, deskT.d]).map((d) => ({ w, d })));
  const desks = geo.wallCandidates(deskT, deskSizes, { step, sidePush: true })
    .concat(opts.allowNotch ? geo.notchCandidates(deskT, deskSizes, 'chimney', step) : [])
    .filter(usable);
  const groups: (PlacedItem | null)[][] = [beds, wardrobes, desks];
  if (visible('dresser')) {
    const drT = tpl('dresser');
    groups.push([...geo.wallCandidates(drT, [{ w: drT.w, d: drT.d }], { step, sidePush: true }).filter(usable), null]);
  }

  const clash = makeClash(geo, minFront);
  const results: { layout: Layout; ev: Evaluation }[] = [];
  let evaluated = 0;
  backtrack(groups, clash, (layout) => {
    evaluated++;
    const ev = evaluateChambre(geo, layout);
    if (ev.ok) results.push({ layout, ev });
  });

  // Piano : essayé sur les 20 meilleures dispositions de chaque famille, contre un mur ou adossé à un meuble.
  const sig = (l: Layout) => ['bed', 'wardrobe', 'desk', 'dresser', 'piano'].map((t) => geo.wallName(l.find((i) => i.type === t))).join('/');
  if (visible('piano')) {
    const piT = tpl('piano');
    const pianoWall = geo.wallCandidates(piT, [{ w: piT.w, d: piT.d }], { step }).filter(usable);
    const perSig = new Map<string, number>();
    const pool = [...results].sort((a, b) => b.ev.score - a.ev.score).filter((r) => {
      const s = sig(r.layout), n = perSig.get(s) ?? 0;
      perSig.set(s, n + 1);
      return n < 20;
    });
    for (const r of pool) {
      for (const p of pianoWall.concat(geo.backToCandidates(piT, r.layout, step))) {
        if (r.layout.some((o) => clash(o, p))) continue;
        const layout = [...r.layout, p];
        evaluated++;
        const ev = evaluateChambre(geo, layout);
        if (ev.ok) results.push({ layout, ev });
      }
    }
  }

  const describe = (l: Layout) => {
    const get = (t: string) => l.find((i) => i.type === t);
    const desk = get('desk')!, w = get('wardrobe')!;
    const dr = get('dresser'), pi = get('piano');
    return [`Lit ${geo.wallName(get('bed'))}`, `armoire ${w.w} ${geo.wallName(w)}`, `bureau ${desk.w}×${desk.d} ${geo.wallName(desk)}`,
      dr ? `commode ${geo.wallName(dr)}` : 'sans commode', pi ? `piano ${geo.wallName(pi)}` : '']
      .filter(Boolean).join(' · ');
  };
  return { families: families(results, sig, describe, opts.limit ?? 8), evaluated, valid: results.length, ms: Date.now() - t0 };
}

// Plan SVG : pièce (données JSON), meubles, espaces devant, circulation, glisser-déposer.
import { RoomGeo } from '../shared/core';
import { footprint, frontRect, localRect, sideRects } from '../shared/geometry';
import type { Evaluation, Layout, PlacedItem, Rect, RoomModule } from '../shared/types';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent?.appendChild(e);
  return e;
}
function txt(parent: Element, x: number, y: number, s: string, cls: string, extra: Attrs = {}) {
  el('text', { x, y, class: cls, ...extra }, parent).textContent = s;
}
const rect = (g: Element, r: Rect, cls: string, extra: Attrs = {}) =>
  el('rect', { x: r.x, y: r.y, width: Math.max(r.w, 0.1), height: Math.max(r.h, 0.1), class: cls, ...extra }, g);
const line = (g: Element, r: Rect, cls: string, extra: Attrs = {}) =>
  el('line', { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, class: cls, ...extra }, g);

export interface PlanHost {
  room: RoomModule;
  items(): Layout;
  evaluation(): Evaluation;
  selected(): string | null;
  editable(): boolean;
  showClearances(): boolean;
  showWalk(): boolean;
  select(id: string | null): void;
  /** Déplace un meuble ; `done` à la fin du glisser. */
  move(id: string, x: number, y: number, done: boolean): void;
}

export class PlanView {
  private readonly geo: RoomGeo;
  private readonly gStatic: SVGGElement;
  private readonly gWalk: SVGGElement;
  private readonly gDyn: SVGGElement;
  private drag: { id: string; dx: number; dy: number; x: number; y: number } | null = null;

  constructor(private readonly svg: SVGSVGElement, private readonly host: PlanHost) {
    this.geo = new RoomGeo(host.room.data);
    svg.innerHTML = '';
    svg.setAttribute('viewBox', host.room.data.viewBox.join(' '));
    this.gStatic = el('g', {}, svg);
    this.gWalk = el('g', {}, svg);
    this.gDyn = el('g', {}, svg);
    this.drawStatic();
    this.bindPointer();
  }

  // ---------- Pièce ----------
  private drawStatic() {
    const d = this.host.room.data, g = this.gStatic;
    el('polygon', { points: d.outline.map((p) => p.join(',')).join(' '), class: 's-wall' }, g);
    el('polygon', { points: d.polygon.map((p) => p.join(',')).join(' '), class: 's-floor' }, g);
    for (const z of d.zones) rect(g, z.rect, 's-zone');
    for (const o of [...d.openings.flatMap((x) => x.draw ?? []), ...d.fixed.flatMap((x) => x.draw ?? [])]) {
      switch (o.kind) {
        case 'gap': rect(g, o, 's-gap'); break;
        case 'rect': rect(g, o, o.class ?? 's-thin'); break;
        case 'line': el('line', { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, class: o.class ?? 's-thin' }, g); break;
        case 'path': el('path', { d: o.d, class: o.class ?? 's-swing' }, g); break;
        case 'text': txt(g, o.x, o.y, o.text, o.class ?? 's-note', { 'text-anchor': o.anchor ?? 'start' }); break;
        case 'fins': for (let y = o.y; y < o.y + o.h; y += o.step) el('line', { x1: o.x, y1: y, x2: o.x + o.w, y2: y, class: 's-dim' }, g); break;
      }
    }
    for (const dim of d.dimensions) {
      if (dim.axis === 'text') { txt(g, dim.x, dim.y, dim.label, 's-dimt', { 'text-anchor': dim.anchor ?? 'middle' }); continue; }
      const { from: a, to: b, at } = dim;
      if (dim.axis === 'h') {
        el('path', { d: `M${a} ${at} H${b} M${a} ${at - 3} V${at + 3} M${b} ${at - 3} V${at + 3}`, class: 's-dim' }, g);
        txt(g, (a + b) / 2, at - 2.5, dim.label, 's-dimt', { 'text-anchor': 'middle' });
      } else {
        el('path', { d: `M${at} ${a} V${b} M${at - 3} ${a} H${at + 3} M${at - 3} ${b} H${at + 3}`, class: 's-dim' }, g);
        txt(g, at - 2.5, (a + b) / 2, dim.label, 's-dimt', { 'text-anchor': 'middle', transform: `rotate(-90 ${at - 2.5} ${(a + b) / 2})` });
      }
    }
  }

  // ---------- Meubles ----------
  draw() {
    const { host, geo } = this;
    const ev = host.evaluation(), g = this.gDyn;
    g.innerHTML = '';
    const items = host.items().filter((it) => !it.hidden);
    const color = (it: PlacedItem) => `var(--c-${host.room.catalog[it.type]?.color ?? 'extra'})`;
    const hasError = (id: string) => ev.issues.some((i) => i.item === id && i.sev === 'error');

    if (host.showClearances()) {
      for (const it of items) {
        const spec = host.room.catalog[it.type], c = color(it);
        const comfort = it.clear ?? spec?.front?.comfort ?? 0;
        if (comfort) {
          const min = Math.min(it.min ?? spec?.front?.min ?? comfort, comfort);
          const free = ev.frontDepth[it.id] ?? comfort;
          const state = free < min ? ' bad' : free < comfort ? ' warn' : '';
          rect(g, geo.frontOf(it, comfort), 'clr' + state, { style: `--c:${c}` });
          if (min < comfort) line(g, localRect(it, 0, it.d + min, it.w, 0.01), 'clr-min' + state, { style: `--c:${c}` });
          if (spec?.render === 'desk') {
            const ch = localRect(it, it.w / 2 - 30, it.d + 12, 60, 60);
            el('circle', { cx: ch.x + ch.w / 2, cy: ch.y + ch.h / 2, r: 28, class: 'chair', style: `--c:${c}` }, g);
          }
        }
        // Table ronde : dégagement derrière chaque chaise (50 cm de large, 75 cm conseillés)
        const seatSides = ev.seats?.[it.id];
        if (seatSides && spec?.render === 'roundTable') {
          const ft = footprint(it), depths = ev.sideDepths[it.id] ?? [];
          const order = ['top', 'bottom', 'left', 'right'];
          for (const side of seatSides) {
            const d = Math.min(depths[order.indexOf(side)]?.depth ?? 75, 75);
            const cx = ft.x + ft.w / 2, cy = ft.y + ft.h / 2;
            const r = side === 'top' ? { x: cx - 25, y: ft.y - d, w: 50, h: d }
              : side === 'bottom' ? { x: cx - 25, y: ft.y + ft.h, w: 50, h: d }
              : side === 'left' ? { x: ft.x - d, y: cy - 25, w: d, h: 50 }
              : { x: ft.x + ft.w, y: cy - 25, w: d, h: 50 };
            rect(g, r, 'clr' + (d < 75 ? ' warn' : ''), { style: `--c:${c}` });
          }
        }
        const sides = ev.sideDepths[it.id];
        if (sides && spec?.sides) {
          const comfy = it.sides ?? spec.sides.comfort;
          sides.forEach((s, k) => { if (s.ok) rect(g, sideRects(it, Math.min(s.depth, comfy), 120)[k], 'clr' + (s.depth < comfy ? ' warn' : ''), { style: `--c:${c}` }); });
          if (ev.bedFoot && ev.bedSides === 0) rect(g, frontRect(it, it.sidesMin ?? spec.sides.min), 'clr warn', { style: `--c:${c}` });
        }
      }
    }

    const sel = host.selected();
    for (const it of items) {
      const f = footprint(it), spec = host.room.catalog[it.type];
      const gi = el('g', {
        class: `item${sel === it.id ? ' sel' : ''}${hasError(it.id) ? ' bad' : ''}${host.editable() ? '' : ' locked'}`,
        'data-id': it.id, style: `--c:${color(it)}`, tabindex: 0, role: 'button', 'aria-label': `${it.label} ${it.w} par ${it.d}`,
      }, g);
      const round = spec?.render === 'roundTable' || spec?.render === 'lamp';
      if (round) el('circle', { cx: f.x + f.w / 2, cy: f.y + f.h / 2, r: Math.min(f.w, f.h) / 2, class: 'fp' }, gi);
      else rect(gi, f, 'fp');
      const L = (u: number, v: number, du: number, dv: number) => localRect(it, u, v, du, dv);
      switch (spec?.render) {
        case 'bed':
          rect(gi, L(0, 0, it.w, 7), 'det');
          rect(gi, L(10, 12, it.w / 2 - 15, 28), 'det', { rx: 4 });
          rect(gi, L(it.w / 2 + 5, 12, it.w / 2 - 15, 28), 'det', { rx: 4 });
          rect(gi, L(4, it.d * 0.36, it.w - 8, it.d * 0.64 - 4), 'det');
          break;
        case 'wardrobe': {
          const n = Math.max(2, Math.round(it.w / 50));
          for (let i = 1; i < n; i++) line(gi, L((it.w / n) * i, it.d - 6, 0.01, 6), 'detl');
          line(gi, L(4, it.d / 2, it.w - 8, 0.01), 'detl', { 'stroke-dasharray': '4 3' });
          break;
        }
        case 'desk': {
          const n = geo.notch(it);
          if (n) {
            const r = n.fixed.rect!;
            rect(gi, r, 'notch');
            txt(gi, r.x + r.w / 2, r.y + 11, n.fixed.label.toLowerCase(), 'notch-t', { 'text-anchor': 'middle' });
            txt(gi, r.x + r.w / 2, r.y + 20, `étagère h ${n.fixed.height ?? ''}`, 'notch-t', { 'text-anchor': 'middle' });
          } else rect(gi, L(it.w / 2 - 28, 8, 56, 5), 'det');
          break;
        }
        case 'dresser': rect(gi, L(it.w / 2 - 19, it.d / 2 - 19, 38, 36), 'det'); break;
        case 'roundTable': {
          // chaises sur les côtés où il reste de la place
          const cx = f.x + f.w / 2, cy = f.y + f.h / 2, cw = 42, cd = 40, off = 8;
          for (const side of ev.seats?.[it.id] ?? []) {
            const r = side === 'top' ? { x: cx - cw / 2, y: f.y - cd + off, w: cw, h: cd }
              : side === 'bottom' ? { x: cx - cw / 2, y: f.y + f.h - off, w: cw, h: cd }
              : side === 'left' ? { x: f.x - cd + off, y: cy - cw / 2, w: cd, h: cw }
              : { x: f.x + f.w - off, y: cy - cw / 2, w: cd, h: cw };
            rect(gi, r, 'chairseat', { rx: 6 });
          }
          gi.appendChild(gi.firstChild!); // le plateau passe au-dessus des chaises
          break;
        }
        case 'sofa':
          rect(gi, L(0, 0, it.w, 20), 'det', { rx: 4 });
          rect(gi, L(0, 20, 20, it.d - 20), 'det', { rx: 4 });
          rect(gi, L(it.w - 20, 20, 20, it.d - 20), 'det', { rx: 4 });
          for (let i = 1; i < 3; i++) line(gi, L(20 + ((it.w - 40) / 3) * i, 22, 0.01, it.d - 26), 'detl');
          break;
        case 'armchair':
          rect(gi, L(4, 0, it.w - 8, 18), 'det', { rx: 8 });
          rect(gi, L(8, 18, it.w - 16, it.d - 24), 'det', { rx: 10 });
          break;
        case 'lamp':
          el('circle', { cx: f.x + f.w / 2, cy: f.y + f.h / 2, r: Math.min(f.w, f.h) / 2 - 7, class: 'lampglow' }, gi);
          break;
        case 'coffee': rect(gi, L(3, 3, it.w - 6, it.d - 6), 'det', { rx: 3 }); break;
        case 'piano': {
          rect(gi, L(4, it.d - 15, it.w - 8, 11), 'keys');
          const keys = 21;
          for (let i = 1; i < keys; i++) if (i % 7 !== 3 && i % 7 !== 0) rect(gi, L(4 + ((it.w - 8) / keys) * i - 1.2, it.d - 15, 2.4, 6.5), 'blackkey');
          break;
        }
      }
      if (!round) line(gi, L(0, it.d, it.w, 0.01), 'front');
      if (f.w < 45 && f.h < 45) continue; // trop petit pour une étiquette lisible
      // étiquette : sur la partie utile (hors clavier, hors encoche)
      const lb = spec?.render === 'piano' ? L(0, 0, it.w, it.d - 16) : f;
      let cx = lb.x + lb.w / 2, cy = lb.y + lb.h / 2;
      if (spec?.render === 'bed') { if (it.face === 'S') cy += 18; else if (it.face === 'N') cy -= 18; else cx += it.face === 'E' ? 22 : -22; }
      if (geo.notch(it)?.mode === 'back') cy = f.y + 26 + (f.h - 26) / 2;
      const a: Attrs = { 'text-anchor': 'middle' };
      if (f.w < 80 && f.h > f.w) a.transform = `rotate(-90 ${cx} ${cy})`;
      txt(gi, cx, cy - 1, it.label, 'lbl', a);
      txt(gi, cx, cy + 9, `${it.w} × ${it.d}`, 'lbld', a);
    }

    // circulation
    this.gWalk.innerHTML = '';
    if (host.showWalk()) {
      const { W, H, cell, cells } = ev.reach;
      let d = '';
      for (let j = 0; j < H; j++) {
        let i = 0;
        while (i < W) {
          if (!cells[j * W + i]) { i++; continue; }
          const s = i; while (i < W && cells[j * W + i]) i++;
          d += `M${s * cell} ${j * cell}h${(i - s) * cell}v${cell}h${-(i - s) * cell}z`;
        }
      }
      el('path', { d, class: 's-walk' }, this.gWalk);
    }
  }

  // ---------- Interaction ----------
  private toSvg(e: PointerEvent) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(this.svg.getScreenCTM()!.inverse());
  }

  /** Aimante les bords du meuble sur les murs et les autres meubles (à 5 cm près). */
  private snap(id: string, nx: number, ny: number): [number, number] {
    const items = this.host.items(), it = items.find((i) => i.id === id)!;
    const f = footprint({ ...it, x: nx, y: ny }), s = this.host.room.data.snap;
    const xs = [...s.x], ys = [...s.y];
    if (s.slantRight) xs.push(Math.floor(s.slantRight.x0 + (s.slantRight.dx * (f.y + f.h - s.slantRight.y0)) / s.slantRight.dy));
    else xs.push(this.geo.maxX);
    if (s.slantBottom) ys.push(Math.floor(s.slantBottom.y0 + (s.slantBottom.dy * (f.x + f.w - s.slantBottom.x0)) / s.slantBottom.dx));
    else ys.push(this.geo.maxY);
    for (const o of items) if (o.id !== id && !o.hidden) { const g = footprint(o); xs.push(g.x, g.x + g.w); ys.push(g.y, g.y + g.h); }
    const best = (lines: number[], a: number, b: number) => {
      let m: number | null = null;
      for (const l of lines) for (const e of [a, b]) { const dd = l - e; if (Math.abs(dd) <= 5 && (m === null || Math.abs(dd) < Math.abs(m))) m = dd; }
      return m ?? 0;
    };
    return [nx + best(xs, f.x, f.x + f.w), ny + best(ys, f.y, f.y + f.h)];
  }

  private bindPointer() {
    const { svg, host } = this;
    // Sur écran tactile : glisser sur le plan fait défiler la page, sauf si l'on attrape un meuble modifiable.
    svg.addEventListener('touchstart', (e) => {
      if (host.editable() && (e.target as Element).closest('[data-id]')) e.preventDefault();
    }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      const g = (e.target as Element).closest('[data-id]');
      if (!g) { host.select(null); return; }
      const id = g.getAttribute('data-id')!;
      host.select(id);
      if (!host.editable()) return;
      const it = host.items().find((i) => i.id === id)!, p = this.toSvg(e);
      this.drag = { id, dx: p.x - it.x, dy: p.y - it.y, x: it.x, y: it.y };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const p = this.toSvg(e);
      let nx = Math.round(p.x - this.drag.dx), ny = Math.round(p.y - this.drag.dy);
      if (!e.altKey) [nx, ny] = this.snap(this.drag.id, nx, ny);
      if (nx === this.drag.x && ny === this.drag.y) return;
      this.drag.x = nx; this.drag.y = ny;
      host.move(this.drag.id, nx, ny, false);
    });
    const end = () => {
      if (!this.drag) return;
      const d = this.drag; this.drag = null;
      host.move(d.id, d.x, d.y, true);
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }
}

/** Miniature d'une disposition (classement, résultats du solveur). */
export function thumbnail(room: RoomModule, layout: Layout): string {
  const d = room.data;
  const parts = [`<svg viewBox="${d.viewBox.join(' ')}" aria-hidden="true"><polygon points="${d.polygon.map((p) => p.join(',')).join(' ')}" style="fill:var(--floor);stroke:var(--wall)" stroke-width="6"/>`];
  for (const f of d.fixed) if (f.rect) parts.push(`<rect x="${f.rect.x}" y="${f.rect.y}" width="${f.rect.w}" height="${f.rect.h}" style="fill:var(--line)"/>`);
  for (const it of layout) {
    if (it.hidden) continue;
    const f = footprint(it);
    parts.push(`<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" style="fill:var(--c-${room.catalog[it.type]?.color ?? 'extra'})"/>`);
  }
  return parts.join('') + '</svg>';
}

// Page Explorer : le solveur cherche les dispositions possibles d'une pièce à partir d'une liste de meubles
// et de dimensions, indépendamment de toute disposition existante.
import { roomList, rooms } from '../rooms';
import type { Layout, PlacedItem, RoomModule, SolveFamily, SolveOptions } from '../shared/types';
import { api, type LayoutDto, type Me } from './api';
import { $, esc, fmtM2, toast } from './dom';
import { PlanView, thumbnail } from './plan';
import { navigate } from './router';

const MAX_VALUES = 4;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const store = {
  get: (k: string) => { try { return localStorage.getItem(`rp:${k}`); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`rp:${k}`, v); } catch { /* stockage indisponible */ } },
};
/** « 140, 160 » → [140, 160] */
const parseList = (s: string) => [...new Set(s.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0))].slice(0, MAX_VALUES);

export class ExplorerPage {
  private room!: RoomModule;
  private layouts: LayoutDto[] = [];
  private results: SolveFamily[] = [];
  private chosen: number | null = null;
  /** Meubles libres de la disposition de départ, remis (masqués) dans les dispositions créées. */
  private extras: PlacedItem[] = [];
  private fromId: number | null = null;
  private worker: Worker | null = null;
  private tick = 0;
  private preview: PlanView | null = null;

  constructor(private readonly root: HTMLElement, private readonly me: Me) {}

  async start() {
    const saved = store.get('room');
    await this.openRoom(saved && rooms[saved] ? saved : roomList[0].id);
  }

  stop() {
    this.worker?.terminate();
    clearInterval(this.tick);
  }

  private async openRoom(roomId: string) {
    this.stop();
    this.room = rooms[roomId];
    store.set('room', roomId);
    this.results = []; this.chosen = null; this.extras = []; this.fromId = null;
    this.render();
    try { this.layouts = (await api.layouts(roomId)).layouts; } catch { this.layouts = []; }
    this.renderFromSelect();
  }

  private render() {
    const r = this.room, ex = r.explore;
    const types = [...ex.required, ...ex.optional];
    this.root.innerHTML = `
      <div class="shell">
        <header class="appbar">
          <a class="back" href="/" data-nav>← Plans</a>
          <select class="room-select" id="roomSelect" aria-label="Pièce">${roomList.map((x) => `<option value="${x.id}"${x.id === r.data.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          <span class="spacer"></span>
          <a class="account" href="/compte" data-nav title="Compte">${esc(this.me.pseudo)}</a>
        </header>
        <main class="page wide">
          <div>
            <h1>Explorer</h1>
            <p class="muted">Le solveur essaie toutes les positions contre les murs (pas de 10 cm, 4 orientations) pour les meubles choisis, avec chaque largeur et profondeur indiquée, et garde la meilleure disposition de chaque famille. Plus il y a de tailles à essayer, plus la recherche est longue.</p>
          </div>
          ${types.length ? '' : `<div class="sheet card"><p class="muted">Le solveur de cette pièce n'est pas encore configuré : ses meubles et ses règles d'aménagement restent à définir.</p></div>`}
          <div class="explore-grid"${types.length ? '' : ' hidden'}>
            <form class="sheet card params" id="params">
              <h2>Paramètres</h2>
              <label class="field">Partir des meubles de<select id="fromLayout"><option value="">Valeurs par défaut</option></select></label>
              ${types.map((t) => {
                const spec = r.catalog[t], req = ex.required.includes(t), s = ex.sizes[t];
                return `<fieldset class="furn" data-type="${t}">
                  <legend><label class="check"><input type="checkbox" data-include="${t}" checked${req ? ' disabled' : ''}> ${esc(spec.label)}${req ? ' <span class="muted">(toujours placé)</span>' : ''}</label></legend>
                  <label class="field">Largeurs (cm)${spec.width ? ` · ${spec.width.min ?? ''}–${spec.width.max ?? ''}` : ''}<input type="text" inputmode="numeric" data-w="${t}" value="${s.widths.join(', ')}"></label>
                  <label class="field">Profondeurs (cm)<input type="text" inputmode="numeric" data-d="${t}" value="${s.depths.join(', ')}"></label>
                </fieldset>`;
              }).join('')}
              ${ex.notch ? `<label class="check"><input type="checkbox" id="allowNotch" checked> ${esc(ex.notch.label)}</label>` : ''}
              <p class="muted">Jusqu'à ${MAX_VALUES} valeurs par champ, séparées par des virgules.</p>
              <button class="btn primary" type="submit" id="run">Lancer la recherche</button>
            </form>
            <section class="results-col">
              <p class="muted" id="status" role="status">Choisis les meubles et leurs tailles, puis lance la recherche.</p>
              <div class="sheet card preview" id="preview" hidden></div>
              <div class="result-grid" id="results"></div>
            </section>
          </div>
        </main>
      </div>`;
    $('#roomSelect', this.root).addEventListener('change', (e) => void this.openRoom((e.target as HTMLSelectElement).value));
    $('#params', this.root).addEventListener('submit', (e) => { e.preventDefault(); this.run(); });
    $('#fromLayout', this.root).addEventListener('change', (e) => this.prefill(Number((e.target as HTMLSelectElement).value) || null));
  }

  private renderFromSelect() {
    const sel = $<HTMLSelectElement>('#fromLayout', this.root);
    if (!sel) return;
    sel.innerHTML = '<option value="">Valeurs par défaut</option>' + this.layouts.map((l) => `<option value="${l.id}">${esc(l.name)}${l.owner.id === this.me.id ? '' : ` (${esc(l.owner.pseudo)})`}</option>`).join('');
  }

  /** Reprend les meubles (présence et dimensions) d'une disposition existante. */
  private prefill(id: number | null) {
    const ex = this.room.explore, layout = this.layouts.find((l) => l.id === id);
    this.fromId = layout?.id ?? null;
    this.extras = layout ? layout.items.filter((i) => !ex.required.includes(i.type) && !ex.optional.includes(i.type)).map((i) => ({ ...i, hidden: true })) : [];
    for (const t of [...ex.required, ...ex.optional]) {
      const it = layout?.items.find((i) => i.type === t && !i.hidden);
      const inc = $<HTMLInputElement>(`[data-include="${t}"]`, this.root);
      if (!ex.required.includes(t)) inc.checked = layout ? !!it : true;
      $<HTMLInputElement>(`[data-w="${t}"]`, this.root).value = (it ? [it.w] : ex.sizes[t].widths).join(', ');
      $<HTMLInputElement>(`[data-d="${t}"]`, this.root).value = (it ? [it.d] : ex.sizes[t].depths).join(', ');
    }
  }

  private run() {
    const ex = this.room.explore, base: Layout = [], sizes: NonNullable<SolveOptions['sizes']> = {};
    for (const t of [...ex.required, ...ex.optional]) {
      if (!$<HTMLInputElement>(`[data-include="${t}"]`, this.root).checked) continue;
      const widths = parseList($<HTMLInputElement>(`[data-w="${t}"]`, this.root).value);
      const depths = parseList($<HTMLInputElement>(`[data-d="${t}"]`, this.root).value);
      if (!widths.length || !depths.length) { toast(`Indique au moins une largeur et une profondeur pour : ${this.room.catalog[t].label}.`); return; }
      sizes[t] = { widths, depths };
      const spec = this.room.catalog[t];
      base.push({ id: t, type: t, label: spec.label, face: 'S', x: 0, y: 0, w: widths[0], d: depths[0] });
    }
    const allowNotch = $<HTMLInputElement>('#allowNotch', this.root)?.checked ?? false;
    const status = $('#status', this.root), btn = $<HTMLButtonElement>('#run', this.root);
    this.stop();
    this.results = []; this.chosen = null;
    $('#results', this.root).innerHTML = '';
    $('#preview', this.root).hidden = true;
    this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    const t0 = Date.now();
    status.textContent = 'Recherche en cours…';
    this.tick = window.setInterval(() => { status.textContent = `Recherche en cours… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
    btn.disabled = true;
    const done = () => { clearInterval(this.tick); btn.disabled = false; };
    this.worker.onerror = (e) => { done(); status.textContent = `Le solveur n'a pas pu démarrer : ${e.message}`; };
    this.worker.onmessage = (e) => {
      done();
      if (!e.data.ok) { status.textContent = `La recherche a échoué : ${e.data.error}`; return; }
      const r = e.data.result as { families: SolveFamily[]; evaluated: number; valid: number; ms: number };
      this.results = r.families;
      status.textContent = r.families.length
        ? `${r.evaluated.toLocaleString('fr-FR')} combinaisons testées en ${Math.round(r.ms / 1000)} s, ${r.valid.toLocaleString('fr-FR')} valides, ${r.families.length} familles. Touche un résultat pour l'aperçu.`
        : 'Aucune disposition ne passe avec ces meubles et ces tailles. Retire un meuble ou essaie d’autres dimensions.';
      this.renderResults();
    };
    this.worker.postMessage({ roomId: this.room.data.id, base, allowNotch, sizes });
  }

  private renderResults() {
    const box = $('#results', this.root);
    box.innerHTML = this.results.map((f, i) => `
      <button class="result" type="button" data-i="${i}" aria-pressed="${this.chosen === i}">
        ${thumbnail(this.room, f.layout)}
        <span class="t"><b>${esc(f.summary)}</b><span class="muted">circulation ${fmtM2(f.freeM2)} · lit ${f.bedSides ? `${f.bedSides} côté(s)` : 'par le pied'} · note ${f.score}</span></span>
      </button>`).join('');
    box.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => b.addEventListener('click', () => this.choose(Number(b.dataset.i))));
  }

  private choose(i: number) {
    this.chosen = i;
    this.renderResults();
    const f = this.results[i], ev = this.room.evaluate(f.layout);
    const card = $('#preview', this.root);
    card.hidden = false;
    card.innerHTML = `
      <div class="card-head"><h2>Aperçu</h2><button class="link" type="button" id="closePreview">Fermer</button></div>
      <svg id="previewSvg" aria-label="Plan de la disposition proposée"></svg>
      <dl class="stats">
        <div><dt>Circulation libre</dt><dd>${fmtM2(ev.freeM2)}</dd></div>
        <div><dt>Accès au lit</dt><dd>${ev.bedSides === 2 ? '2 côtés' : ev.bedSides === 1 ? '1 côté' : ev.bedFoot ? 'par le pied' : '–'}</dd></div>
      </dl>
      ${ev.issues.length ? `<ul class="issues">${ev.issues.map((x) => `<li class="${x.sev}">${esc(x.msg)}</li>`).join('')}</ul>` : ''}
      <form class="form" id="createForm">
        <label class="field">Nom<input id="newName" type="text" maxlength="80" value="${esc(`Solveur : ${f.summary}`.slice(0, 80))}"></label>
        <button class="btn primary" type="submit">Créer cette disposition</button>
      </form>`;
    this.preview = new PlanView($('#previewSvg', card) as unknown as SVGSVGElement, {
      room: this.room, items: () => f.layout, evaluation: () => ev, selected: () => null, editable: () => false,
      showClearances: () => true, showWalk: () => false, select: () => {}, move: () => {},
    });
    this.preview.draw();
    $('#closePreview', card).addEventListener('click', () => { card.hidden = true; this.chosen = null; this.renderResults(); });
    $('#createForm', card).addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $<HTMLInputElement>('#newName', card).value.trim() || `Solveur : ${f.summary}`.slice(0, 80);
      try {
        const { layout } = await api.createLayout(this.room.data.id, name, [...clone(f.layout), ...clone(this.extras)], this.fromId ?? undefined);
        store.set(`active:${this.room.data.id}`, String(layout.id));
        toast('Disposition créée.');
        navigate('/');
      } catch (err) { toast((err as Error).message); }
    });
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

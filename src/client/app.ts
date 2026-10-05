import { roomList, rooms } from '../rooms';
import { footprint, polygonArea, ROTATE_CW } from '../shared/geometry';
import type { Evaluation, Face, Layout, PlacedItem, RoomModule, SolveFamily } from '../shared/types';
import { api, ApiError, type Invite, type LayoutDto, type Me } from './api';
import { $, esc, fmtM2, THUMB_DOWN, THUMB_UP, toast } from './dom';
import { PlanView, thumbnail } from './plan';

const WALL: Record<Face, string> = { S: 'mur du haut', N: 'mur du bas', E: 'mur gauche', W: 'mur droit' };
const store = {
  get: (k: string) => { try { return localStorage.getItem(`rp:${k}`); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`rp:${k}`, v); } catch { /* stockage indisponible */ } },
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const samePlace = (a: Layout, b: Layout) => a.length === b.length && a.every((it) => {
  const o = b.find((x) => x.id === it.id);
  return o && (['face', 'x', 'y', 'w', 'd', 'hidden', 'notch'] as const).every((k) => (it[k] ?? null) === (o[k] ?? null));
});

export class App {
  private room!: RoomModule;
  private plan!: PlanView;
  private layouts: LayoutDto[] = [];
  private activeId: number | null = null;
  private selected: string | null = null;
  private filter: 'all' | 'mine' = 'all';
  private showClr = true;
  private showWalk = false;
  private renaming = false;
  private confirmDelete: number | null = null;
  private ev!: Evaluation;
  private saveTimer = 0;
  private saving: 'idle' | 'pending' | 'saving' | 'saved' | 'error' = 'idle';
  private solved: SolveFamily[] = [];
  private worker: Worker | null = null;
  private invites: Invite[] | null = null;
  private raf = 0;

  constructor(private readonly root: HTMLElement, private readonly me: Me, private readonly onLogout: () => void) {}

  async start() {
    const saved = store.get('room');
    await this.openRoom(saved && rooms[saved] ? saved : roomList[0].id);
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', (e) => { if (this.saving === 'pending' || this.saving === 'saving') e.preventDefault(); });
  }

  // =====================================================================
  // Données
  // =====================================================================
  private get current(): LayoutDto | undefined { return this.layouts.find((l) => l.id === this.activeId); }
  private get editable(): boolean { return !!this.current && this.current.owner.id === this.me.id; }
  private items(): Layout { return this.current?.items ?? []; }

  private async openRoom(roomId: string) {
    await this.flushSave();
    this.room = rooms[roomId];
    store.set('room', roomId);
    this.solved = [];
    this.selected = null;
    this.layoutShell();
    this.plan = new PlanView($<HTMLElement>('#svg', this.root) as unknown as SVGSVGElement, {
      room: this.room,
      items: () => this.items(),
      evaluation: () => this.ev,
      selected: () => this.selected,
      editable: () => this.editable,
      showClearances: () => this.showClr,
      showWalk: () => this.showWalk,
      select: (id) => { if (this.selected !== id) { this.selected = id; this.render(); } },
      move: (id, x, y, done) => this.moveItem(id, x, y, done),
    });
    await this.reload();
  }

  private async reload(keepActive = true) {
    const { layouts } = await api.layouts(this.room.data.id);
    this.layouts = layouts;
    const savedActive = Number(store.get(`active:${this.room.data.id}`));
    if (!keepActive || !this.current) this.activeId = layouts.find((l) => l.id === savedActive)?.id ?? layouts[0]?.id ?? null;
    this.render();
  }

  private setActive(id: number) {
    void this.flushSave();
    this.activeId = id;
    this.selected = null;
    this.renaming = false;
    store.set(`active:${this.room.data.id}`, String(id));
    this.render();
  }

  /** Modification locale de la disposition active, puis enregistrement différé. */
  private mutate(fn: (items: Layout) => void, fast = false) {
    const cur = this.current;
    if (!cur || !this.editable) return;
    fn(cur.items);
    this.scheduleSave();
    if (fast) { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.renderLight(); }); }
    else this.render();
  }

  private scheduleSave() {
    this.saving = 'pending';
    this.updateSaving();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(), 700);
  }

  private async save() {
    const cur = this.current;
    if (!cur || this.saving !== 'pending') return;
    this.saving = 'saving';
    this.updateSaving();
    const sent = JSON.stringify(cur.items);
    try {
      const { layout } = await api.updateLayout(cur.id, cur.version, { items: cur.items });
      cur.version = layout.version;
      cur.ok = layout.ok; cur.score = layout.score;
      // si l'utilisateur a encore bougé un meuble pendant l'envoi, on renverra la nouvelle version
      this.saving = JSON.stringify(cur.items) === sent ? 'saved' : 'pending';
      if (this.saving === 'pending') this.scheduleSave();
    } catch (err) {
      this.saving = 'error';
      if (err instanceof ApiError && err.status === 409) {
        const fresh = (err.body as { layout?: LayoutDto }).layout;
        if (fresh) Object.assign(cur, fresh);
        toast('Cette disposition a été modifiée ailleurs : la dernière version a été rechargée.');
        this.saving = 'idle';
        this.render();
      } else toast(`Enregistrement impossible : ${(err as Error).message}`);
    }
    this.updateSaving();
    this.renderTabs();
  }

  private async flushSave() {
    if (this.saving !== 'pending') return;
    clearTimeout(this.saveTimer);
    await this.save();
  }

  private async createLayout(name: string, items: Layout, parentId?: number) {
    await this.flushSave();
    try {
      const { layout } = await api.createLayout(this.room.data.id, name, items, parentId);
      this.layouts.push(layout);
      this.setActive(layout.id);
      toast('Disposition créée.');
    } catch (err) { toast((err as Error).message); }
  }

  private async rename(name: string) {
    const cur = this.current;
    if (!cur || !name.trim() || name === cur.name) return;
    await this.flushSave();
    try { const { layout } = await api.updateLayout(cur.id, cur.version, { name }); Object.assign(cur, layout); }
    catch (err) { toast((err as Error).message); }
    this.render();
  }

  private async remove(id: number) {
    try {
      await api.deleteLayout(id);
      this.layouts = this.layouts.filter((l) => l.id !== id);
      if (this.activeId === id) this.activeId = this.layouts[0]?.id ?? null;
      toast('Disposition supprimée.');
    } catch (err) { toast((err as Error).message); }
    this.confirmDelete = null;
    this.render();
  }

  private async vote(value: -1 | 1) {
    const cur = this.current;
    if (!cur) return;
    const next = cur.votes.mine === value ? 0 : value;
    try { const { layout } = await api.vote(cur.id, next); cur.votes = layout.votes; }
    catch (err) { toast((err as Error).message); }
    this.renderTabs(); this.renderVerdict(); this.renderRanking();
  }

  // =====================================================================
  // Meubles
  // =====================================================================
  private item(id: string | null) { return id ? this.items().find((i) => i.id === id) : undefined; }

  private moveItem(id: string, x: number, y: number, done: boolean) {
    this.mutate((items) => { const it = items.find((i) => i.id === id)!; it.x = x; it.y = y; }, !done);
    if (done) this.render();
  }

  private setFace(it: PlacedItem, face: Face) {
    const f0 = footprint(it), cx = f0.x + f0.w / 2, cy = f0.y + f0.h / 2;
    it.face = face;
    const f1 = footprint(it);
    it.x = Math.round(cx - f1.w / 2); it.y = Math.round(cy - f1.h / 2);
  }

  private addItem(type: string) {
    const spec = this.room.catalog[type];
    const id = spec.multiple ? `${type}-${Date.now().toString(36)}` : type;
    this.mutate((items) => items.push({ id, type, label: spec.label, face: 'S', x: 150, y: 180, w: spec.w, d: spec.d }));
    this.selected = id;
    this.render();
  }

  // =====================================================================
  // Rendu
  // =====================================================================
  private layoutShell() {
    const area = polygonArea(this.room.data.polygon) / 10000;
    this.root.innerHTML = `
      <div class="wrap">
        <header class="topbar">
          <h1>${esc(this.room.data.home ?? 'roomplanner')}</h1>
          <select class="room-select" id="roomSelect" aria-label="Pièce">${roomList.map((r) => `<option value="${r.id}"${r.id === this.room.data.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
          <span class="meta">Surface ${area.toFixed(1).replace('.', ',')} m² · Hauteur ${(this.room.data.height / 100).toFixed(2).replace('.', ',')} m · Repère : coin haut-gauche, x → droite, y → bas</span>
          <span class="spacer"></span>
          <span class="who">Connecté : <b>${esc(this.me.pseudo)}</b> <button class="link" id="logout" type="button">Se déconnecter</button></span>
        </header>
        <div class="topbar">
          <div class="seg" role="group" aria-label="Filtre">
            <button type="button" data-filter="all">Toutes</button><button type="button" data-filter="mine">Les miennes</button>
          </div>
          <span class="saving" id="saving" aria-live="polite"></span>
          <span class="spacer"></span>
          <div class="tools">
            <button class="btn" id="new" type="button">Nouvelle</button>
            <button class="btn" id="dup" type="button">Dupliquer</button>
            <button class="btn" id="rename" type="button">Renommer</button>
            <button class="btn" id="reset" type="button">Réinitialiser</button>
            <button class="btn primary" id="copy" type="button">Copier pour Claude</button>
          </div>
        </div>
        <nav class="tabs" id="tabs" role="tablist" aria-label="Dispositions"></nav>
        <div class="banner" id="banner" hidden></div>
        <div class="main">
          <section class="sheet plan">
            <svg id="svg" aria-label="Plan à l'échelle"></svg>
            <div class="plan-foot">
              ${Object.entries(this.room.catalog).filter(([k]) => k !== 'custom').map(([, s]) => `<span class="legend"><i style="background:var(--c-${s.color})"></i>${esc(s.label)}</span>`).join('')}
              <span class="legend"><i style="background:var(--warn);opacity:.5"></i>Espace sous le confort</span>
              <label><input type="checkbox" id="showClr" checked> Dégagements</label>
              <label><input type="checkbox" id="showWalk"> Circulation</label>
              <span class="hint">Glisser pour déplacer · R pour pivoter · flèches = 1 cm (Maj = 10) · Alt = sans aimant</span>
            </div>
          </section>
          <aside>
            <div class="sheet card" id="verdictCard"></div>
            <div class="sheet card" id="editCard"></div>
            <div class="sheet card" id="rankCard"></div>
            <div class="sheet card" id="exploreCard"></div>
            <div class="sheet card" id="copyCard" hidden><h2>Texte à me renvoyer</h2><p class="muted" id="copyMsg"></p><textarea class="copy" id="copyText" readonly></textarea></div>
            <div class="sheet card" id="accountCard"></div>
          </aside>
        </div>
      </div>`;
    const r = this.root;
    $('#roomSelect', r).addEventListener('change', (e) => void this.openRoom((e.target as HTMLSelectElement).value));
    $('#logout', r).addEventListener('click', async () => { await this.flushSave(); await api.logout(); this.onLogout(); });
    r.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.addEventListener('click', () => { this.filter = b.dataset.filter as 'all' | 'mine'; this.renderTabs(); }));
    $('#showClr', r).addEventListener('change', (e) => { this.showClr = (e.target as HTMLInputElement).checked; this.plan.draw(); });
    $('#showWalk', r).addEventListener('change', (e) => { this.showWalk = (e.target as HTMLInputElement).checked; this.plan.draw(); });
    $('#new', r).addEventListener('click', () => void this.createLayout(`Nouvelle disposition`, clone(this.room.starter)));
    $('#dup', r).addEventListener('click', () => { const c = this.current; if (c) void this.createLayout(`Copie de ${c.name}`.slice(0, 80), clone(c.items), c.id); });
    $('#rename', r).addEventListener('click', () => { if (this.editable) { this.renaming = true; this.renderTabs(); } });
    $('#reset', r).addEventListener('click', () => this.mutate((items) => { items.splice(0, items.length, ...clone(this.current!.initial)); }));
    $('#copy', r).addEventListener('click', () => this.copyForClaude());
    this.renderExplore();
    this.renderAccount();
  }

  /** Rendu complet. */
  private render() {
    this.ev = this.room.evaluate(this.items());
    const has = !!this.current;
    for (const id of ['#dup', '#copy']) ($(id, this.root) as HTMLButtonElement).disabled = !has;
    for (const id of ['#rename', '#reset']) ($(id, this.root) as HTMLButtonElement).disabled = !this.editable;
    this.root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === this.filter)));
    this.renderTabs();
    this.renderBanner();
    this.plan.draw();
    this.renderVerdict();
    this.renderEditor();
    this.renderRanking();
    this.updateSaving();
  }

  /** Rendu léger pendant un glisser. */
  private renderLight() {
    this.ev = this.room.evaluate(this.items());
    this.plan.draw();
    this.renderVerdict();
    this.syncEditorPos();
  }

  private updateSaving() {
    const el = $('#saving', this.root);
    if (!el) return;
    el.textContent = { idle: '', pending: 'Modifications non enregistrées…', saving: 'Enregistrement…', saved: 'Enregistré', error: 'Échec de l’enregistrement' }[this.saving];
  }

  private renderTabs() {
    const nav = $('#tabs', this.root);
    nav.innerHTML = '';
    const list = this.layouts.filter((l) => this.filter === 'all' || l.owner.id === this.me.id);
    if (!list.length) nav.innerHTML = '<p class="muted">Aucune disposition. Crée la première avec « Nouvelle ».</p>';
    for (const l of list) {
      const active = l.id === this.activeId;
      if (active && this.renaming) {
        const wrap = document.createElement('span');
        wrap.className = 'tab editing';
        wrap.innerHTML = `<span class="dot${l.ok ? '' : ' bad'}"></span><input type="text" maxlength="80" aria-label="Nouveau nom">`;
        const inp = wrap.querySelector('input')!;
        inp.value = l.name;
        let done = false;
        const finish = (keep: boolean) => { if (done) return; done = true; this.renaming = false; if (keep) void this.rename(inp.value.trim()); else this.renderTabs(); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
        inp.addEventListener('blur', () => finish(true));
        nav.appendChild(wrap);
        requestAnimationFrame(() => { inp.focus(); inp.select(); });
        continue;
      }
      const mine = l.owner.id === this.me.id, canDelete = mine || this.me.role === 'admin';
      const net = l.votes.up - l.votes.down;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(active));
      b.title = mine ? 'Double-clic pour renommer' : `Disposition de ${l.owner.pseudo}`;
      b.innerHTML = `<span class="dot${l.ok ? '' : ' bad'}"></span>${esc(l.name)}${mine ? '' : ` <span class="owner">· ${esc(l.owner.pseudo)}</span>`}`
        + (l.votes.up || l.votes.down ? ` <span class="score">${net > 0 ? '+' : ''}${net}</span>` : '')
        + (canDelete ? (this.confirmDelete === l.id ? ' <span class="x confirm" data-del>Supprimer ?</span>' : ' <span class="x" data-del title="Supprimer">×</span>') : '');
      b.addEventListener('click', (e) => {
        if ((e.target as Element).closest('[data-del]')) {
          if (this.confirmDelete === l.id) void this.remove(l.id);
          else { this.confirmDelete = l.id; this.renderTabs(); }
          return;
        }
        this.confirmDelete = null;
        if (!active) this.setActive(l.id);
      });
      b.addEventListener('dblclick', (e) => { if (!(e.target as Element).closest('[data-del]') && mine) { this.renaming = true; this.renderTabs(); } });
      nav.appendChild(b);
    }
  }

  private renderBanner() {
    const el = $('#banner', this.root), cur = this.current;
    el.hidden = !cur || this.editable;
    if (!cur || this.editable) return;
    el.innerHTML = `<span>Disposition de <b>${esc(cur.owner.pseudo)}</b> : tu peux la consulter et voter. Pour la modifier, duplique-la.</span><button class="btn primary" type="button" id="dupBanner">Dupliquer pour modifier</button>`;
    $('#dupBanner', el).addEventListener('click', () => void this.createLayout(`Copie de ${cur.name}`.slice(0, 80), clone(cur.items), cur.id));
  }

  private renderVerdict() {
    const card = $('#verdictCard', this.root), cur = this.current, ev = this.ev;
    if (!cur) { card.innerHTML = '<h2>Disposition</h2><p class="muted">Aucune disposition sélectionnée.</p>'; return; }
    const errs = ev.issues.filter((i) => i.sev === 'error'), list = errs.concat(ev.issues.filter((i) => i.sev !== 'error'));
    const get = (t: string) => this.items().find((i) => i.type === t && !i.hidden);
    const wardrobe = get('wardrobe'), desk = get('desk'), bed = get('bed');
    const parent = cur.parentId ? this.layouts.find((l) => l.id === cur.parentId) : null;
    const unchanged = samePlace(cur.items, cur.initial);
    card.innerHTML = `
      <div class="verdict"><span class="chip ${errs.length ? 'bad' : ''}">${errs.length ? `${errs.length} problème${errs.length > 1 ? 's' : ''}` : 'Tout passe'}</span><span class="name">${esc(cur.name)}</span></div>
      <p class="muted">par ${esc(cur.owner.pseudo)}${parent ? ` · copiée de « ${esc(parent.name)} »` : ''}</p>
      <div class="votes">
        <button class="vote up" type="button" data-vote="1" aria-pressed="${cur.votes.mine === 1}" aria-label="J'aime">${THUMB_UP}${cur.votes.up}</button>
        <button class="vote down" type="button" data-vote="-1" aria-pressed="${cur.votes.mine === -1}" aria-label="Je n'aime pas">${THUMB_DOWN}${cur.votes.down}</button>
      </div>
      <dl class="stats">
        <div><dt>Circulation libre</dt><dd>${fmtM2(ev.freeM2)}</dd></div>
        <div><dt>Accès au lit</dt><dd>${bed ? (ev.bedSides === 2 ? '2 côtés' : ev.bedSides === 1 ? '1 côté' : ev.bedFoot ? 'par le pied' : 'aucun') : '–'}</dd></div>
        <div><dt>Armoire</dt><dd>${wardrobe ? `${wardrobe.w} cm` : '–'}</dd></div>
        <div><dt>Bureau</dt><dd>${desk ? `${desk.w} × ${desk.d}` : '–'}</dd></div>
      </dl>
      ${list.length ? `<ul class="issues">${list.map((i) => `<li class="${i.sev}">${esc(i.msg)}</li>`).join('')}</ul>` : '<p class="muted">Aucun point de vigilance.</p>'}
      ${cur.notes && unchanged ? `<div class="procon"><div class="pro"><h3>Points forts</h3><ul>${cur.notes.pros.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div><div class="con"><h3>Limites</h3><ul>${cur.notes.cons.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div></div>` : ''}
      ${cur.notes && !unchanged ? '<p class="muted">Disposition modifiée : les points forts et limites d’origine ne s’appliquent plus.</p>' : ''}`;
    card.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((b) => b.addEventListener('click', () => void this.vote(Number(b.dataset.vote) as 1 | -1)));
  }

  private renderEditor() {
    const card = $('#editCard', this.root), it = this.item(this.selected);
    const items = this.items(), dis = this.editable ? '' : ' disabled';
    const hidden = items.filter((i) => i.hidden);
    const missing = Object.entries(this.room.catalog).filter(([k, s]) => !s.multiple && !items.some((i) => i.type === k));
    const addRow = this.editable ? `<div class="row">
        <button class="btn" type="button" data-act="add" data-type="custom">Ajouter un meuble</button>
        ${missing.map(([k, s]) => `<button class="btn" type="button" data-act="add" data-type="${k}">Ajouter : ${esc(s.label)}</button>`).join('')}
        ${hidden.map((h) => `<button class="btn" type="button" data-act="show" data-id="${esc(h.id)}">Remettre : ${esc(h.label)}</button>`).join('')}
      </div>` : '';
    if (!it || it.hidden) {
      card.innerHTML = `<h2>Meuble</h2><p class="muted">Clique sur un meuble du plan pour voir ses dimensions${this.editable ? ' et le modifier' : ''}.</p>${addRow}`;
    } else {
      const spec = this.room.catalog[it.type] ?? this.room.catalog.custom;
      const isBed = !!spec.sides;
      const comfort = isBed ? (it.sides ?? spec.sides!.comfort) : (it.clear ?? spec.front?.comfort ?? 0);
      const min = isBed ? (it.sidesMin ?? spec.sides!.min) : Math.min(it.min ?? spec.front?.min ?? comfort, comfort);
      const clrName = isBed ? 'Passage côté lit' : spec.render === 'desk' ? 'Recul chaise' : 'Espace devant';
      const w = spec.width;
      card.innerHTML = `<h2>Meuble sélectionné</h2>
        <div class="editor">
          <label class="full">Nom<input id="f-label" type="text" value="${esc(it.label)}"${dis}></label>
          <label>Largeur (cm)${w ? ` · ${w.min ?? ''}–${w.max ?? ''}${w.soft ? `, idéal ${w.soft}+` : ''}` : ''}<input id="f-w" type="number" min="10" max="400" value="${it.w}"${dis}></label>
          <label>Profondeur (cm)<input id="f-d" type="number" min="10" max="400" value="${it.d}"${dis}></label>
          <label>${clrName}, confort<input id="f-clear" type="number" min="0" max="200" value="${comfort}"${dis}></label>
          <label>${clrName}, minimum<input id="f-min" type="number" min="0" max="200" value="${min}"${dis}></label>
          ${spec.notchable ? `<label class="check full"><input id="f-notch" type="checkbox"${it.notch ? ' checked' : ''}${dis}> Découpé autour de ${esc(this.room.data.fixed.find((f) => f.id === spec.notchable)?.labelDef ?? spec.notchable)}</label>` : ''}
          <label>Dos contre<select id="f-face"${dis}>${(Object.keys(WALL) as Face[]).map((f) => `<option value="${f}"${f === it.face ? ' selected' : ''}>${WALL[f]}</option>`).join('')}</select></label>
          <label>x (cm)<input id="f-x" type="number" value="${it.x}"${dis}></label>
          <label>y (cm)<input id="f-y" type="number" value="${it.y}"${dis}></label>
        </div>
        ${this.editable ? '<div class="row"><button class="btn" type="button" data-act="rot">Pivoter de 90°</button><button class="btn" type="button" data-act="hide">Retirer du plan</button></div>' : ''}
        ${addRow}`;
      if (this.editable) {
        const bind = (id: string, fn: (v: string) => void, ev = 'input') => $(id, card)?.addEventListener(ev, (e) => this.mutate(() => fn((e.target as HTMLInputElement).value), true));
        const pos = (v: string) => Math.max(0, Number(v) || 0);
        bind('#f-label', (v) => { it.label = v; });
        bind('#f-w', (v) => { if (+v > 0) it.w = +v; });
        bind('#f-d', (v) => { if (+v > 0) it.d = +v; });
        bind('#f-clear', (v) => { if (isBed) it.sides = pos(v); else it.clear = pos(v); });
        bind('#f-min', (v) => { if (isBed) it.sidesMin = pos(v); else it.min = pos(v); });
        bind('#f-face', (v) => this.setFace(it, v as Face), 'change');
        bind('#f-x', (v) => { it.x = Number(v) || 0; });
        bind('#f-y', (v) => { it.y = Number(v) || 0; });
        $('#f-notch', card)?.addEventListener('change', (e) => this.mutate(() => {
          it.notch = (e.target as HTMLInputElement).checked ? spec.notchable : undefined;
          const fx = this.room.data.fixed.find((f) => f.id === spec.notchable);
          if (it.notch && fx?.rect && fx.attachedTo === 'top' && Math.abs(it.y - fx.rect.y) < 30) it.y = fx.rect.y;
        }));
      }
    }
    card.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'add') this.addItem(b.dataset.type!);
      else if (act === 'show') this.mutate((items) => { items.find((i) => i.id === b.dataset.id)!.hidden = false; });
      else if (act === 'rot' && it) this.mutate(() => this.setFace(it, ROTATE_CW[it.face]));
      else if (act === 'hide' && it) { this.mutate(() => { it.hidden = true; }); this.selected = null; this.render(); }
    }));
  }

  private syncEditorPos() {
    const it = this.item(this.selected);
    if (!it) return;
    for (const [id, v] of [['#f-x', it.x], ['#f-y', it.y], ['#f-face', it.face], ['#f-w', it.w], ['#f-d', it.d]] as const) {
      const e = $<HTMLInputElement>(id, this.root);
      if (e && document.activeElement !== e) e.value = String(v);
    }
  }

  private renderRanking() {
    const card = $('#rankCard', this.root);
    const ranked = [...this.layouts].sort((a, b) => (b.votes.up - b.votes.down) - (a.votes.up - a.votes.down) || b.votes.up - a.votes.up || Number(b.ok) - Number(a.ok));
    const voted = ranked.filter((l) => l.votes.up || l.votes.down);
    card.innerHTML = `<h2>Classement</h2>${voted.length ? `<div class="ranking">${voted.slice(0, 8).map((l, i) => `
      <div class="rank" data-id="${l.id}" role="button" tabindex="0">
        <span class="pos">${i + 1}</span>${thumbnail(this.room, l.items)}
        <span class="t"><b>${esc(l.name)}</b><span class="muted">${esc(l.owner.pseudo)} · ${l.ok ? 'tout passe' : 'à corriger'}</span></span>
        <span class="net">👍 ${l.votes.up} · 👎 ${l.votes.down}</span>
      </div>`).join('')}</div>` : '<p class="muted">Pas encore de vote. Utilise les pouces sous le nom de la disposition.</p>'}`;
    card.querySelectorAll<HTMLElement>('[data-id]').forEach((r) => r.addEventListener('click', () => this.setActive(Number(r.dataset.id))));
  }

  // =====================================================================
  // Solveur
  // =====================================================================
  private renderExplore() {
    const card = $('#exploreCard', this.root);
    card.innerHTML = `<h2>Explorer</h2>
      <p class="muted">Le solveur teste toutes les positions contre les murs (pas de 10 cm, 4 orientations) avec les meubles de la disposition active, et garde la meilleure version de chaque famille.</p>
      <label class="check"><input type="checkbox" id="solveNotch" checked> Autoriser le bureau découpé autour de la cheminée</label>
      <div class="row"><button class="btn primary" id="solve" type="button">Lancer la recherche</button></div>
      <p class="muted" id="solveStatus" role="status"></p>
      <div class="results" id="results"></div>`;
    $('#solve', card).addEventListener('click', () => this.runSolver());
  }

  private runSolver() {
    const cur = this.current;
    if (!cur) return;
    const status = $('#solveStatus', this.root), btn = $<HTMLButtonElement>('#solve', this.root);
    this.worker?.terminate();
    this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    const t0 = Date.now();
    const tick = window.setInterval(() => { status.textContent = `Recherche en cours… ${Math.round((Date.now() - t0) / 1000)} s (souvent 1 à 4 minutes)`; }, 1000);
    status.textContent = 'Recherche en cours…';
    btn.disabled = true;
    $('#results', this.root).innerHTML = '';
    this.worker.onerror = (e) => { clearInterval(tick); btn.disabled = false; status.textContent = `Le solveur n'a pas pu démarrer : ${e.message}`; };
    this.worker.onmessage = (e) => {
      clearInterval(tick);
      btn.disabled = false;
      if (!e.data.ok) { status.textContent = `La recherche a échoué : ${e.data.error}`; return; }
      const r = e.data.result as { families: SolveFamily[]; evaluated: number; valid: number };
      this.solved = r.families;
      status.textContent = `${r.evaluated.toLocaleString('fr-FR')} combinaisons testées, ${r.valid.toLocaleString('fr-FR')} valides, ${r.families.length} familles.`;
      $('#results', this.root).innerHTML = r.families.map((f, i) => `
        <div class="res">${thumbnail(this.room, f.layout)}<div class="t"><b>${esc(f.summary)}</b>
          <span>circulation ${fmtM2(f.freeM2)} · lit ${f.bedSides ? `${f.bedSides} côté(s)` : 'par le pied'}</span>
          <div class="row"><button class="btn" type="button" data-open="${i}">Créer cette disposition</button></div></div></div>`).join('')
        || '<p class="muted">Aucune disposition ne passe avec ces dimensions.</p>';
      $('#results', this.root).querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) => b.addEventListener('click', () => {
        const fam = this.solved[Number(b.dataset.open)];
        // garde les meubles libres de la disposition active, cachés
        const extra = cur.items.filter((i) => !fam.layout.some((p) => p.id === i.id)).map((i) => ({ ...i, hidden: true }));
        void this.createLayout(`Solveur : ${fam.summary}`.slice(0, 80), [...clone(fam.layout), ...extra], cur.id);
      }));
    };
    this.worker.postMessage({ roomId: this.room.data.id, base: clone(cur.items), allowNotch: $<HTMLInputElement>('#solveNotch', this.root).checked });
  }

  // =====================================================================
  // Compte et invitations
  // =====================================================================
  private renderAccount() {
    const card = $('#accountCard', this.root);
    const admin = this.me.role === 'admin';
    card.innerHTML = `<h2>Compte</h2>
      <form id="pwForm" class="editor" autocomplete="on">
        <label>Mot de passe actuel<input id="pwCur" type="password" autocomplete="current-password"></label>
        <label>Nouveau mot de passe<input id="pwNext" type="password" autocomplete="new-password" minlength="8"></label>
        <div class="row full"><button class="btn" type="submit">Changer le mot de passe</button></div>
      </form>
      ${admin ? `<h2>Invitations</h2><p class="muted">Chaque lien permet de créer un compte, une seule fois, pendant 14 jours.</p>
        <div class="row"><button class="btn primary" type="button" id="newInvite">Créer un lien d'invitation</button></div>
        <div class="invite-list" id="inviteList"></div>
        <h2>Importer l'ancienne version</h2>
        <p class="muted">Dans l'ancienne page, clique sur « Exporter tous les onglets », puis colle le texte ici. Les onglets seront ajoutés à ${esc(this.room.data.name.toLowerCase())}, à ton nom.</p>
        <textarea class="copy" id="legacyJson" placeholder='{"tabs": [...]}'></textarea>
        <label class="check"><input type="checkbox" id="legacyReplace"> Remplacer les dispositions actuelles de la pièce</label>
        <div class="row"><button class="btn" type="button" id="legacyImport">Importer</button></div>` : ''}`;
    $('#pwForm', card).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.changePassword($<HTMLInputElement>('#pwCur', card).value, $<HTMLInputElement>('#pwNext', card).value);
        toast('Mot de passe changé.');
        ($('#pwForm', card) as HTMLFormElement).reset();
      } catch (err) { toast((err as Error).message); }
    });
    if (admin) {
      $('#newInvite', card).addEventListener('click', async () => {
        try { await api.createInvite(); await this.loadInvites(); } catch (err) { toast((err as Error).message); }
      });
      void this.loadInvites();
      $('#legacyImport', card).addEventListener('click', async () => {
        let state: unknown;
        try { state = JSON.parse($<HTMLTextAreaElement>('#legacyJson', card).value); } catch { toast('Le texte collé n’est pas un export valide.'); return; }
        try {
          const { imported } = await api.importLegacy(this.room.data.id, state, $<HTMLInputElement>('#legacyReplace', card).checked);
          toast(`${imported} dispositions importées.`);
          $<HTMLTextAreaElement>('#legacyJson', card).value = '';
          await this.reload(false);
        } catch (err) { toast((err as Error).message); }
      });
    }
  }

  private async loadInvites() {
    this.invites = (await api.invites()).invites;
    const box = $('#inviteList', this.root);
    if (!box) return;
    const link = (code: string) => `${location.origin}/?invite=${code}`;
    box.innerHTML = this.invites.length ? this.invites.map((i) => i.usedBy
      ? `<div>✓ utilisée par <b>${esc(i.usedBy)}</b></div>`
      : `<div>${i.expiresAt < Date.now() ? 'expirée' : `<code>${esc(link(i.code))}</code>`} <button class="link" type="button" data-copy="${esc(i.code)}">Copier</button> <button class="link" type="button" data-revoke="${esc(i.code)}">Annuler</button></div>`).join('')
      : '<p class="muted">Aucune invitation.</p>';
    box.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => b.addEventListener('click', () => {
      navigator.clipboard.writeText(link(b.dataset.copy!)).then(() => toast('Lien copié.'), () => toast('Copie impossible : sélectionne le lien.'));
    }));
    box.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach((b) => b.addEventListener('click', async () => { await api.deleteInvite(b.dataset.revoke!); await this.loadInvites(); }));
  }

  // =====================================================================
  // Divers
  // =====================================================================
  private copyForClaude() {
    const cur = this.current;
    if (!cur) return;
    const ev = this.ev;
    const lines = [
      `${this.room.data.name} — disposition « ${cur.name} » (par ${cur.owner.pseudo})`,
      'Repère : origine au coin haut-gauche du plan, x vers la droite, y vers le bas, en cm. (x, y) = coin haut-gauche du meuble.',
    ];
    for (const it of cur.items) {
      if (it.hidden) { lines.push(`- ${it.label} : retiré du plan`); continue; }
      const spec = this.room.catalog[it.type];
      const extra = spec?.sides ? `passage latéral ${it.sides ?? spec.sides.comfort} (min ${it.sidesMin ?? spec.sides.min}) cm`
        : `espace devant ${it.clear ?? spec?.front?.comfort ?? 0} (min ${it.min ?? spec?.front?.min ?? 0}) cm`;
      lines.push(`- ${it.label} : ${it.w} × ${it.d}, dos contre ${WALL[it.face]}, x=${it.x} y=${it.y}, ${extra}${it.notch ? `, découpé autour de ${it.notch}` : ''}`);
    }
    lines.push(`Bilan : ${ev.ok ? 'tout passe' : 'à corriger'} · circulation ${ev.freeM2.toFixed(2)} m² · lit accessible ${ev.bedSides} côté(s)`);
    for (const i of ev.issues) lines.push(`  · ${i.msg}`);
    lines.push(`JSON: ${JSON.stringify(cur.items)}`);
    const text = lines.join('\n');
    $('#copyCard', this.root).hidden = false;
    $<HTMLTextAreaElement>('#copyText', this.root).value = text;
    const msg = $('#copyMsg', this.root);
    navigator.clipboard.writeText(text).then(
      () => { msg.textContent = 'Copié. Colle-le dans la conversation avec tes remarques.'; },
      () => { msg.textContent = 'Copie automatique bloquée : sélectionne le texte ci-dessous.'; $<HTMLTextAreaElement>('#copyText', this.root).select(); },
    );
  }

  private onKey(e: KeyboardEvent) {
    if (/INPUT|SELECT|TEXTAREA/.test((document.activeElement as HTMLElement)?.tagName ?? '')) return;
    const it = this.item(this.selected);
    if (!it) return;
    if (e.key === 'Escape') { this.selected = null; this.render(); return; }
    if (!this.editable) return;
    const st = e.shiftKey ? 10 : 1;
    const mv = ({ ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] } as Record<string, number[]>)[e.key];
    if (mv) { e.preventDefault(); this.mutate(() => { it.x += mv[0]; it.y += mv[1]; }, true); }
    else if (e.key === 'r' || e.key === 'R') this.mutate(() => this.setFace(it, ROTATE_CW[it.face]));
  }
}

import { roomList, rooms } from '../rooms';
import { footprint, polygonArea, ROTATE_CW } from '../shared/geometry';
import type { Evaluation, Face, Layout, PlacedItem, RoomModule } from '../shared/types';
import { api, ApiError, type LayoutDto, type Me } from './api';
import { $, esc, fmtM2, THUMB_DOWN, THUMB_UP, toast } from './dom';
import { PlanView, thumbnail } from './plan';

const WALL: Record<Face, string> = { S: 'mur du haut', N: 'mur du bas', E: 'mur gauche', W: 'mur droit' };
const MOBILE = window.matchMedia('(max-width: 899px)');
const store = {
  get: (k: string) => { try { return localStorage.getItem(`rp:${k}`); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`rp:${k}`, v); } catch { /* stockage indisponible */ } },
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const samePlace = (a: Layout, b: Layout) => a.length === b.length && a.every((it) => {
  const o = b.find((x) => x.id === it.id);
  return o && (['face', 'x', 'y', 'w', 'd', 'hidden', 'notch'] as const).every((k) => (it[k] ?? null) === (o[k] ?? null));
});

/** Page principale : liste des dispositions (barre latérale), plan et panneaux de la disposition active. */
export class App {
  private room!: RoomModule;
  private plan!: PlanView;
  private layouts: LayoutDto[] = [];
  private activeId: number | null = null;
  private selected: string | null = null;
  private filter: 'all' | 'mine' = (store.get('filter') as 'all' | 'mine') ?? 'all';
  private showClr = true;
  private showWalk = false;
  private renaming = false;
  private confirmDelete = false;
  private ev!: Evaluation;
  private saveTimer = 0;
  private saving: 'idle' | 'pending' | 'saving' | 'saved' | 'error' = 'idle';
  private raf = 0;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private readonly unloadHandler = (e: BeforeUnloadEvent) => { if (this.saving === 'pending' || this.saving === 'saving') e.preventDefault(); };

  constructor(private readonly root: HTMLElement, private readonly me: Me) {}

  async start() {
    const saved = store.get('room');
    document.addEventListener('keydown', this.keyHandler);
    window.addEventListener('beforeunload', this.unloadHandler);
    await this.openRoom(saved && rooms[saved] ? saved : roomList[0].id);
  }

  stop() {
    void this.flushSave();
    document.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('beforeunload', this.unloadHandler);
    document.body.classList.remove('drawer-open', 'sheet-open');
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
    this.selected = null;
    this.shell();
    this.plan = new PlanView($<HTMLElement>('#svg', this.root) as unknown as SVGSVGElement, {
      room: this.room,
      items: () => this.items(),
      evaluation: () => this.ev,
      selected: () => this.selected,
      editable: () => this.editable,
      showClearances: () => this.showClr,
      showWalk: () => this.showWalk,
      select: (id) => {
        if (this.selected === id) return;
        this.selected = id;
        this.render();
        // sur téléphone, la fiche du meuble s'ouvre en bas : on garde le plan visible au-dessus
        if (id && MOBILE.matches) {
          const plan = $('.plan', this.root);
          window.scrollTo({ top: plan.getBoundingClientRect().top + window.scrollY - 64, behavior: 'smooth' });
        }
      },
      move: (id, x, y, done) => this.moveItem(id, x, y, done),
    });
    await this.reload();
  }

  private async reload() {
    const { layouts } = await api.layouts(this.room.data.id);
    this.layouts = layouts;
    if (!this.current) {
      const saved = Number(store.get(`active:${this.room.data.id}`));
      this.activeId = layouts.find((l) => l.id === saved)?.id ?? layouts[0]?.id ?? null;
    }
    this.render();
  }

  private setActive(id: number) {
    void this.flushSave();
    this.activeId = id;
    this.selected = null;
    this.renaming = false;
    this.confirmDelete = false;
    store.set(`active:${this.room.data.id}`, String(id));
    this.closeDrawer();
    this.render();
    if (MOBILE.matches) window.scrollTo({ top: 0 });
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
    this.renderList();
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
    this.renaming = false;
    if (!cur || !name || name === cur.name) { this.render(); return; }
    await this.flushSave();
    try { const { layout } = await api.updateLayout(cur.id, cur.version, { name }); Object.assign(cur, layout); }
    catch (err) { toast((err as Error).message); }
    this.render();
  }

  private async remove() {
    const cur = this.current;
    if (!cur) return;
    try {
      await api.deleteLayout(cur.id);
      this.layouts = this.layouts.filter((l) => l.id !== cur.id);
      this.activeId = this.layouts[0]?.id ?? null;
      toast('Disposition supprimée.');
    } catch (err) { toast((err as Error).message); }
    this.confirmDelete = false;
    this.render();
  }

  private async vote(value: -1 | 1) {
    const cur = this.current;
    if (!cur) return;
    const next = cur.votes.mine === value ? 0 : value;
    try { const { layout } = await api.vote(cur.id, next); cur.votes = layout.votes; }
    catch (err) { toast((err as Error).message); }
    this.renderList(); this.renderVerdict(); this.renderRanking();
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
  // Structure de la page
  // =====================================================================
  private shell() {
    const area = polygonArea(this.room.data.polygon) / 10000;
    this.root.innerHTML = `
      <div class="shell">
        <header class="appbar">
          <button class="burger" id="burger" type="button" aria-label="Dispositions" aria-controls="sidebar" aria-expanded="false"><span></span><span></span><span></span></button>
          <span class="brand">${esc(this.room.data.home ?? 'roomplanner')}</span>
          <select class="room-select" id="roomSelect" aria-label="Pièce">${roomList.map((r) => `<option value="${r.id}"${r.id === this.room.data.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
          <span class="meta hide-mobile">${area.toFixed(1).replace('.', ',')} m² · h ${(this.room.data.height / 100).toFixed(2).replace('.', ',')} m</span>
          <span class="spacer"></span>
          <a class="account" href="/compte" data-nav title="Compte">${esc(this.me.pseudo)}</a>
        </header>
        <div class="body">
          <nav class="sidebar" id="sidebar" aria-label="Dispositions">
            <a class="btn explore-link" href="/explorer" data-nav>Explorer avec le solveur</a>
            <hr class="divider">
            <div class="sidebar-head">
              <div class="seg" role="group" aria-label="Filtre">
                <button type="button" data-filter="all">Toutes</button><button type="button" data-filter="mine">Les miennes</button>
              </div>
              <button class="btn primary" id="new" type="button">+ Nouvelle</button>
            </div>
            <div class="layout-list" id="layoutList" role="list"></div>
          </nav>
          <div class="scrim" id="scrim" hidden></div>
          <main class="content" id="content">
            <div class="layout-head" id="layoutHead"></div>
            <div class="banner" id="banner" hidden></div>
            <div class="main">
              <section class="sheet plan">
                <svg id="svg" aria-label="Plan à l'échelle"></svg>
                <div class="plan-foot">
                  <label><input type="checkbox" id="showClr" checked> Dégagements</label>
                  <label><input type="checkbox" id="showWalk"> Circulation</label>
                  <details class="legend-box"><summary>Légende</summary>
                    ${Object.entries(this.room.catalog).filter(([k]) => k !== 'custom').map(([, s]) => `<span class="legend"><i style="background:var(--c-${s.color})"></i>${esc(s.label)}</span>`).join('')}
                    <span class="legend"><i style="background:var(--warn);opacity:.5"></i>Espace sous le confort</span>
                  </details>
                  <span class="hint hide-mobile">Glisser pour déplacer · R pour pivoter · flèches = 1 cm (Maj = 10) · Alt = sans aimant</span>
                </div>
              </section>
              <aside class="panels">
                <div class="sheet card" id="editCard"></div>
                <div class="sheet card" id="verdictCard"></div>
                <div class="sheet card" id="rankCard"></div>
                <div class="sheet card" id="copyCard" hidden><h2>Texte à me renvoyer</h2><p class="muted" id="copyMsg"></p><textarea class="copy" id="copyText" readonly></textarea></div>
              </aside>
            </div>
          </main>
        </div>
      </div>`;
    const r = this.root;
    $('#roomSelect', r).addEventListener('change', (e) => void this.openRoom((e.target as HTMLSelectElement).value));
    $('#burger', r).addEventListener('click', () => this.toggleDrawer());
    $('#scrim', r).addEventListener('click', () => this.closeDrawer());
    r.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      this.filter = b.dataset.filter as 'all' | 'mine';
      store.set('filter', this.filter);
      this.renderList();
    }));
    $('#showClr', r).addEventListener('change', (e) => { this.showClr = (e.target as HTMLInputElement).checked; this.plan.draw(); });
    $('#showWalk', r).addEventListener('change', (e) => { this.showWalk = (e.target as HTMLInputElement).checked; this.plan.draw(); });
    $('#new', r).addEventListener('click', () => void this.createLayout('Nouvelle disposition', clone(this.room.starter)));
  }

  private toggleDrawer() {
    const open = !document.body.classList.contains('drawer-open');
    document.body.classList.toggle('drawer-open', open);
    $('#scrim', this.root).hidden = !open;
    $('#burger', this.root).setAttribute('aria-expanded', String(open));
  }
  private closeDrawer() {
    document.body.classList.remove('drawer-open');
    const s = $('#scrim', this.root), b = $('#burger', this.root);
    if (s) s.hidden = true;
    b?.setAttribute('aria-expanded', 'false');
  }

  // =====================================================================
  // Rendu
  // =====================================================================
  private render() {
    this.ev = this.room.evaluate(this.items());
    this.renderList();
    this.renderHead();
    this.renderBanner();
    this.plan.draw();
    this.renderEditor();
    this.renderVerdict();
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
    el.textContent = { idle: '', pending: 'Non enregistré…', saving: 'Enregistrement…', saved: 'Enregistré', error: 'Échec de l’enregistrement' }[this.saving];
  }

  private renderList() {
    const box = $('#layoutList', this.root);
    if (!box) return;
    this.root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === this.filter)));
    const list = this.layouts.filter((l) => this.filter === 'all' || l.owner.id === this.me.id);
    box.innerHTML = list.length ? list.map((l) => {
      const mine = l.owner.id === this.me.id, net = l.votes.up - l.votes.down;
      return `<button class="layout-item" type="button" role="listitem" data-id="${l.id}" aria-current="${l.id === this.activeId}">
        <span class="dot${l.ok ? '' : ' bad'}" title="${l.ok ? 'Tout passe' : 'À corriger'}"></span>
        <span class="li-text"><span class="li-name">${esc(l.name)}</span><span class="li-meta">${mine ? 'moi' : esc(l.owner.pseudo)}${l.votes.up || l.votes.down ? ` · 👍 ${l.votes.up} 👎 ${l.votes.down}` : ''}</span></span>
        ${net ? `<span class="li-score">${net > 0 ? '+' : ''}${net}</span>` : ''}
      </button>`;
    }).join('') : `<p class="muted">${this.filter === 'mine' ? 'Tu n’as pas encore de disposition. Duplique-en une ou crée-en une nouvelle.' : 'Aucune disposition.'}</p>`;
    box.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((b) => b.addEventListener('click', () => this.setActive(Number(b.dataset.id))));
  }

  private renderHead() {
    const head = $('#layoutHead', this.root), cur = this.current;
    if (!cur) { head.innerHTML = '<p class="muted">Choisis une disposition dans la liste ou crées-en une.</p>'; return; }
    const parent = cur.parentId ? this.layouts.find((l) => l.id === cur.parentId) : null;
    const canDelete = this.editable || this.me.role === 'admin';
    head.innerHTML = `
      <div class="lh-title">
        ${this.renaming ? `<input id="renameInput" class="rename" type="text" maxlength="80" value="${esc(cur.name)}" aria-label="Nom de la disposition">` : `<h1>${esc(cur.name)}</h1>`}
        <p class="muted">par ${esc(cur.owner.pseudo)}${parent ? ` · copiée de « ${esc(parent.name)} »` : ''} <span class="saving" id="saving" aria-live="polite"></span></p>
      </div>
      <div class="lh-actions">
        <button class="btn" type="button" data-head="dup">Dupliquer</button>
        ${this.editable ? `<button class="btn" type="button" data-head="rename">${this.renaming ? 'Valider' : 'Renommer'}</button>
        <button class="btn" type="button" data-head="reset">Réinitialiser</button>` : ''}
        <button class="btn" type="button" data-head="copy">Copier pour Claude</button>
        ${canDelete ? `<button class="btn${this.confirmDelete ? ' danger' : ''}" type="button" data-head="delete">${this.confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}</button>` : ''}
      </div>`;
    const input = $<HTMLInputElement>('#renameInput', head);
    if (input) {
      let done = false;
      const finish = (keep: boolean) => { if (done) return; done = true; if (keep) void this.rename(input.value.trim()); else { this.renaming = false; this.renderHead(); this.updateSaving(); } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
      input.addEventListener('blur', () => finish(true));
      requestAnimationFrame(() => { input.focus(); input.select(); });
    }
    head.querySelectorAll<HTMLButtonElement>('[data-head]').forEach((b) => b.addEventListener('click', () => {
      switch (b.dataset.head) {
        case 'dup': void this.createLayout(`Copie de ${cur.name}`.slice(0, 80), clone(cur.items), cur.id); break;
        case 'rename': if (!this.renaming) { this.renaming = true; this.renderHead(); this.updateSaving(); } break;
        case 'reset': this.mutate((items) => { items.splice(0, items.length, ...clone(cur.initial)); }); break;
        case 'copy': this.copyForClaude(); break;
        case 'delete': if (this.confirmDelete) void this.remove(); else { this.confirmDelete = true; this.renderHead(); this.updateSaving(); } break;
      }
    }));
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
    if (!cur) { card.innerHTML = '<h2>Bilan</h2><p class="muted">Aucune disposition sélectionnée.</p>'; return; }
    const errs = ev.issues.filter((i) => i.sev === 'error'), list = errs.concat(ev.issues.filter((i) => i.sev !== 'error'));
    const get = (t: string) => this.items().find((i) => i.type === t && !i.hidden);
    const wardrobe = get('wardrobe'), desk = get('desk'), bed = get('bed');
    const has = (t: string) => !!this.room.catalog[t];
    const unchanged = samePlace(cur.items, cur.initial);
    // Administrateur : qui a voté, en infobulle sur chaque pouce.
    const voters = cur.votes.voters;
    const tip = (names: string[] | undefined, title: string) => {
      if (!voters) return '';
      const text = names?.length ? `${title} :\n${names.join('\n')}` : 'Aucun vote';
      return ` data-tip="${esc(text)}"`;
    };
    card.innerHTML = `
      <div class="verdict">
        <span class="chip ${errs.length ? 'bad' : ''}">${errs.length ? `${errs.length} problème${errs.length > 1 ? 's' : ''}` : 'Tout passe'}</span>
        <span class="votes">
          <button class="vote up" type="button" data-vote="1" aria-pressed="${cur.votes.mine === 1}" aria-label="J'aime"${tip(voters?.up, 'J’aiment')}>${THUMB_UP}${cur.votes.up}</button>
          <button class="vote down" type="button" data-vote="-1" aria-pressed="${cur.votes.mine === -1}" aria-label="Je n'aime pas"${tip(voters?.down, 'N’aiment pas')}>${THUMB_DOWN}${cur.votes.down}</button>
        </span>
      </div>
      ${voters && (voters.up.length || voters.down.length) ? `<p class="voters muted">${voters.up.length ? `👍 ${esc(voters.up.join(', '))}` : ''}${voters.up.length && voters.down.length ? ' · ' : ''}${voters.down.length ? `👎 ${esc(voters.down.join(', '))}` : ''}</p>` : ''}
      <dl class="stats">
        <div><dt>Circulation libre</dt><dd>${fmtM2(ev.freeM2)}</dd></div>
        ${has('bed') ? `<div><dt>Accès au lit</dt><dd>${bed ? (ev.bedSides === 2 ? '2 côtés' : ev.bedSides === 1 ? '1 côté' : ev.bedFoot ? 'par le pied' : 'aucun') : '–'}</dd></div>` : ''}
        ${has('wardrobe') ? `<div><dt>Armoire</dt><dd>${wardrobe ? `${wardrobe.w} cm` : '–'}</dd></div>` : ''}
        ${has('desk') ? `<div><dt>Bureau</dt><dd>${desk ? `${desk.w} × ${desk.d}` : '–'}</dd></div>` : ''}
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
    const addRow = this.editable ? `<details class="add-box"><summary>Ajouter ou remettre un meuble</summary><div class="row">
        <button class="btn" type="button" data-act="add" data-type="custom">Meuble libre</button>
        ${missing.map(([k, s]) => `<button class="btn" type="button" data-act="add" data-type="${k}">${esc(s.label)}</button>`).join('')}
        ${hidden.map((h) => `<button class="btn" type="button" data-act="show" data-id="${esc(h.id)}">Remettre : ${esc(h.label)}</button>`).join('')}
      </div></details>` : '';
    card.classList.toggle('has-item', !!it && !it.hidden);
    document.body.classList.toggle('sheet-open', !!it && !it.hidden);
    if (!it || it.hidden) {
      card.innerHTML = `<h2>Meuble</h2><p class="muted">Touche un meuble du plan pour voir ses dimensions${this.editable ? ' et le modifier' : ''}.</p>${addRow}`;
    } else {
      const spec = this.room.catalog[it.type] ?? this.room.catalog.custom;
      const isBed = !!spec.sides;
      const comfort = isBed ? (it.sides ?? spec.sides!.comfort) : (it.clear ?? spec.front?.comfort ?? 0);
      const min = isBed ? (it.sidesMin ?? spec.sides!.min) : Math.min(it.min ?? spec.front?.min ?? comfort, comfort);
      const clrName = isBed ? 'Passage côté lit' : spec.render === 'desk' ? 'Recul chaise' : 'Espace devant';
      const w = spec.width;
      card.innerHTML = `<div class="card-head"><h2>${esc(it.label)}</h2><button class="link" type="button" data-act="close">Fermer</button></div>
        ${this.editable ? `<div class="pad" role="group" aria-label="Déplacer">
          <button class="btn" type="button" data-move="-10,0" aria-label="Vers la gauche">←</button>
          <button class="btn" type="button" data-move="0,-10" aria-label="Vers le haut">↑</button>
          <button class="btn" type="button" data-move="0,10" aria-label="Vers le bas">↓</button>
          <button class="btn" type="button" data-move="10,0" aria-label="Vers la droite">→</button>
          <button class="btn" type="button" data-act="rot" aria-label="Pivoter de 90°">⟳</button>
          <label class="check step"><input type="checkbox" id="fineStep"> pas de 1 cm</label>
        </div>` : ''}
        <div class="editor">
          <label class="full">Nom<input id="f-label" type="text" value="${esc(it.label)}"${dis}></label>
          <label>Largeur${w ? ` · ${w.min ?? ''}–${w.max ?? ''}${w.soft ? `, idéal ${w.soft}+` : ''}` : ''}<input id="f-w" type="number" inputmode="numeric" min="10" max="400" value="${it.w}"${dis}></label>
          <label>Profondeur<input id="f-d" type="number" inputmode="numeric" min="10" max="400" value="${it.d}"${dis}></label>
          <label>${clrName}, confort<input id="f-clear" type="number" inputmode="numeric" min="0" max="200" value="${comfort}"${dis}></label>
          <label>${clrName}, minimum<input id="f-min" type="number" inputmode="numeric" min="0" max="200" value="${min}"${dis}></label>
          ${spec.render === 'roundTable' ? `<label class="full">Chaises souhaitées (2 à 4)<input id="f-count" type="number" inputmode="numeric" min="2" max="4" value="${it.count ?? 4}"${dis}></label>` : ''}
          ${spec.notchable ? `<label class="check full"><input id="f-notch" type="checkbox"${it.notch ? ' checked' : ''}${dis}> Découpé autour de ${esc(this.room.data.fixed.find((f) => f.id === spec.notchable)?.labelDef ?? spec.notchable)}</label>` : ''}
          <label class="full">Dos contre<select id="f-face"${dis}>${(Object.keys(WALL) as Face[]).map((f) => `<option value="${f}"${f === it.face ? ' selected' : ''}>${WALL[f]}</option>`).join('')}</select></label>
          <label>x (cm)<input id="f-x" type="number" inputmode="numeric" value="${it.x}"${dis}></label>
          <label>y (cm)<input id="f-y" type="number" inputmode="numeric" value="${it.y}"${dis}></label>
        </div>
        ${this.editable ? '<div class="row"><button class="btn" type="button" data-act="hide">Retirer du plan</button></div>' : ''}
        ${addRow}`;
      if (this.editable) {
        const bind = (id: string, fn: (v: string) => void, ev = 'input') => $(id, card)?.addEventListener(ev, (e) => this.mutate(() => fn((e.target as HTMLInputElement).value), true));
        const pos = (v: string) => Math.max(0, Number(v) || 0);
        bind('#f-label', (v) => { it.label = v; });
        bind('#f-w', (v) => { if (+v > 0) it.w = +v; });
        bind('#f-d', (v) => { if (+v > 0) it.d = +v; });
        bind('#f-clear', (v) => { if (isBed) it.sides = pos(v); else it.clear = pos(v); });
        bind('#f-min', (v) => { if (isBed) it.sidesMin = pos(v); else it.min = pos(v); });
        bind('#f-count', (v) => { const n = Math.round(Number(v)); if (n >= 2 && n <= 4) it.count = n; });
        bind('#f-face', (v) => this.setFace(it, v as Face), 'change');
        bind('#f-x', (v) => { it.x = Number(v) || 0; });
        bind('#f-y', (v) => { it.y = Number(v) || 0; });
        $('#f-notch', card)?.addEventListener('change', (e) => this.mutate(() => {
          it.notch = (e.target as HTMLInputElement).checked ? spec.notchable : undefined;
          const fx = this.room.data.fixed.find((f) => f.id === spec.notchable);
          if (it.notch && fx?.rect && fx.attachedTo === 'top' && Math.abs(it.y - fx.rect.y) < 30) it.y = fx.rect.y;
        }));
        card.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((b) => b.addEventListener('click', () => {
          const fine = $<HTMLInputElement>('#fineStep', card)?.checked;
          const [dx, dy] = b.dataset.move!.split(',').map(Number).map((v) => (fine ? Math.sign(v) : v));
          this.mutate(() => { it.x += dx; it.y += dy; }, true);
        }));
      }
    }
    card.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'add') this.addItem(b.dataset.type!);
      else if (act === 'show') this.mutate((items) => { items.find((i) => i.id === b.dataset.id)!.hidden = false; });
      else if (act === 'rot' && it) this.mutate(() => this.setFace(it, ROTATE_CW[it.face]));
      else if (act === 'hide' && it) { this.mutate(() => { it.hidden = true; }); this.selected = null; this.render(); }
      else if (act === 'close') { this.selected = null; this.render(); }
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
    const wasOpen = card.querySelector('details')?.open;
    const ranked = [...this.layouts].sort((a, b) => (b.votes.up - b.votes.down) - (a.votes.up - a.votes.down) || b.votes.up - a.votes.up || Number(b.ok) - Number(a.ok));
    const voted = ranked.filter((l) => l.votes.up || l.votes.down);
    card.innerHTML = `<details${wasOpen ?? voted.length > 0 ? ' open' : ''}><summary><h2>Classement</h2></summary>${voted.length ? `<div class="ranking">${voted.slice(0, 8).map((l, i) => `
      <button class="rank" type="button" data-id="${l.id}">
        <span class="pos">${i + 1}</span>${thumbnail(this.room, l.items)}
        <span class="t"><b>${esc(l.name)}</b><span class="muted">${esc(l.owner.pseudo)} · 👍 ${l.votes.up} · 👎 ${l.votes.down}</span></span>
      </button>`).join('')}</div>` : '<p class="muted">Pas encore de vote. Utilise les pouces dans le bilan de chaque disposition.</p>'}</details>`;
    card.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((r) => r.addEventListener('click', () => this.setActive(Number(r.dataset.id))));
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
    const card = $('#copyCard', this.root);
    card.hidden = false;
    $<HTMLTextAreaElement>('#copyText', this.root).value = text;
    const msg = $('#copyMsg', this.root);
    navigator.clipboard.writeText(text).then(
      () => { msg.textContent = 'Copié. Colle-le dans la conversation avec tes remarques.'; toast('Copié pour Claude.'); },
      () => { msg.textContent = 'Copie automatique bloquée : sélectionne le texte ci-dessous.'; $<HTMLTextAreaElement>('#copyText', this.root).select(); card.scrollIntoView({ block: 'center' }); },
    );
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) { this.closeDrawer(); return; }
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

import { roomList } from '../rooms';
import { api, type Invite, type Me } from './api';
import { $, esc, toast } from './dom';
import { navigate } from './router';

/** Page « Compte » : mot de passe, invitations et import (administrateur), déconnexion. */
export function showAccount(root: HTMLElement, me: Me, onLogout: () => void) {
  const admin = me.role === 'admin';
  root.innerHTML = `
    <div class="shell">
      <header class="appbar">
        <a class="back" href="/" data-nav>← Retour aux plans</a>
        <span class="spacer"></span>
        <span class="who"><b>${esc(me.pseudo)}</b>${admin ? ' · administrateur' : ''}</span>
      </header>
      <main class="page">
        <h1>Compte</h1>
        <section class="sheet card">
          <h2>Mot de passe</h2>
          <form id="pwForm" class="form">
            <label class="field">Mot de passe actuel<input id="pwCur" type="password" autocomplete="current-password" required></label>
            <label class="field">Nouveau mot de passe (8 caractères minimum)<input id="pwNext" type="password" autocomplete="new-password" minlength="8" required></label>
            <button class="btn primary" type="submit">Changer le mot de passe</button>
          </form>
        </section>
        ${admin ? `        <section class="sheet card">
          <h2>Exporter</h2>
          <p class="muted">Télécharge toutes les dispositions d'une pièce (auteurs, meubles, état d'origine, votes) dans un fichier JSON : pour garder une sauvegarde ou les transférer vers une autre installation.</p>
          <div class="form">
            <label class="field">Pièce<select id="exportRoom">${roomList.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>
            <a class="btn primary" id="exportLink" href="#" download>Télécharger l'export</a>
          </div>
        </section>
        <section class="sheet card">
          <h2>Invitations</h2>
          <p class="muted">Chaque lien permet de créer un compte, une seule fois, pendant 14 jours. Envoie-le à la personne invitée.</p>
          <div class="row"><button class="btn primary" type="button" id="newInvite">Créer un lien d'invitation</button></div>
          <div class="invite-list" id="inviteList"><p class="muted">Chargement…</p></div>
        </section>
        <section class="sheet card">
          <h2>Importer</h2>
          <p class="muted">Accepte un fichier exporté depuis roomplanner (les dispositions gardent leur auteur s'il a un compte ici) ou le texte copié avec « Exporter tous les onglets » dans l'ancienne page (les dispositions sont mises à ton nom).</p>
          <form id="importForm" class="form">
            <label class="field">Pièce<select id="importRoom">${roomList.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>
            <label class="field">Fichier<input id="importFile" type="file" accept="application/json,.json"></label>
            <label class="field">Ou texte collé<textarea class="copy" id="importJson" placeholder='{"format": "roomplanner-layouts-v1", …}'></textarea></label>
            <label class="check"><input type="checkbox" id="importReplace"> Remplacer les dispositions actuelles de la pièce</label>
            <button class="btn" type="submit">Importer</button>
          </form>
        </section>` : ''}
        <section class="sheet card">
          <h2>Session</h2>
          <div class="row"><button class="btn" type="button" id="logout">Se déconnecter</button></div>
        </section>
      </main>
    </div>`;

  $('#pwForm', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.changePassword($<HTMLInputElement>('#pwCur', root).value, $<HTMLInputElement>('#pwNext', root).value);
      toast('Mot de passe changé.');
      ($('#pwForm', root) as HTMLFormElement).reset();
    } catch (err) { toast((err as Error).message); }
  });
  $('#logout', root).addEventListener('click', async () => { await api.logout(); onLogout(); });

  if (!admin) return;
  const exportRoom = $<HTMLSelectElement>('#exportRoom', root), exportLink = $<HTMLAnchorElement>('#exportLink', root);
  const syncExport = () => { exportLink.href = api.exportUrl(exportRoom.value); };
  exportRoom.addEventListener('change', syncExport);
  syncExport();
  const link = (code: string) => `${location.origin}/?invite=${code}`;
  const loadInvites = async () => {
    const { invites } = await api.invites();
    const box = $('#inviteList', root);
    box.innerHTML = invites.length ? invites.map((i: Invite) => i.usedBy
      ? `<div class="invite used">✓ utilisée par <b>${esc(i.usedBy)}</b></div>`
      : i.expiresAt < Date.now()
        ? `<div class="invite used">Expirée <button class="link" type="button" data-revoke="${esc(i.code)}">Supprimer</button></div>`
        : `<div class="invite"><code>${esc(link(i.code))}</code><span class="row"><button class="btn" type="button" data-copy="${esc(i.code)}">Copier le lien</button><button class="btn" type="button" data-revoke="${esc(i.code)}">Annuler</button></span></div>`).join('')
      : '<p class="muted">Aucune invitation pour l’instant.</p>';
    box.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => b.addEventListener('click', () => {
      navigator.clipboard.writeText(link(b.dataset.copy!)).then(() => toast('Lien copié.'), () => toast('Copie impossible : sélectionne le lien.'));
    }));
    box.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach((b) => b.addEventListener('click', async () => { await api.deleteInvite(b.dataset.revoke!); await loadInvites(); }));
  };
  $('#newInvite', root).addEventListener('click', async () => {
    try { await api.createInvite(); await loadInvites(); toast('Lien créé.'); } catch (err) { toast((err as Error).message); }
  });
  void loadInvites();

  $<HTMLInputElement>('#importFile', root).addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) $<HTMLTextAreaElement>('#importJson', root).value = await file.text();
  });
  $('#importForm', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    let data: unknown;
    try { data = JSON.parse($<HTMLTextAreaElement>('#importJson', root).value); } catch { toast('Choisis un fichier ou colle un export valide.'); return; }
    const roomId = $<HTMLSelectElement>('#importRoom', root).value;
    try {
      const { imported } = await api.importLayouts(roomId, data, $<HTMLInputElement>('#importReplace', root).checked);
      toast(`${imported} dispositions importées.`);
      navigate('/');
    } catch (err) { toast((err as Error).message); }
  });
}

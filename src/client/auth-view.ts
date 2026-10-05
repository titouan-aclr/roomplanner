import { api, type Me } from './api';
import { $, esc } from './dom';

/** Écran de connexion, ou d'inscription quand l'adresse contient ?invite=CODE. */
export function showAuth(root: HTMLElement, onDone: (me: Me) => void) {
  const invite = new URLSearchParams(location.search).get('invite');
  root.innerHTML = `
    <div class="auth">
      <form class="sheet" id="authForm" novalidate>
        <h1>roomplanner</h1>
        <p class="muted">${invite ? 'Tu as été invité : choisis un pseudo et un mot de passe.' : 'Connecte-toi pour voir et proposer des dispositions.'}</p>
        <label class="field">Pseudo<input id="pseudo" name="pseudo" autocomplete="username" required></label>
        <label class="field">Mot de passe<input id="password" name="password" type="password" autocomplete="${invite ? 'new-password' : 'current-password'}" required></label>
        <p class="error" id="authError" hidden></p>
        <button class="btn primary" type="submit">${invite ? 'Créer mon compte' : 'Se connecter'}</button>
      </form>
    </div>`;
  const form = $<HTMLFormElement>('#authForm', root), error = $('#authError', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pseudo = $<HTMLInputElement>('#pseudo', root).value.trim(), password = $<HTMLInputElement>('#password', root).value;
    error.hidden = true;
    try {
      const { user } = invite ? await api.register(invite, pseudo, password) : await api.login(pseudo, password);
      if (invite) history.replaceState(null, '', location.pathname);
      onDone(user);
    } catch (err) {
      error.innerHTML = esc((err as Error).message);
      error.hidden = false;
    }
  });
  $<HTMLInputElement>('#pseudo', root).focus();
}

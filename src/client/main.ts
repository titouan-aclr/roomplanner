// Point d'entrée public : il ne contient que l'écran de connexion. Le reste de l'application (pièces,
// plans, propositions) est chargé dynamiquement après connexion, et le serveur ne sert ces fichiers
// qu'aux personnes connectées.
import './styles.css';
import { api, type Me } from './api';
import { showAuth } from './auth-view';
import { startRouter } from './router';

interface Page { stop(): void }

const root = document.getElementById('app')!;
let me: Me | null = null;
let page: Page | null = null;

function logout() {
  me = null;
  page?.stop();
  page = null;
  history.replaceState(null, '', '/');
  showAuth(root, login);
}

function login(user: Me) {
  me = user;
  startRouter((path) => void route(path));
}

async function route(path: string) {
  if (!me) return;
  page?.stop();
  page = null;
  window.scrollTo(0, 0);
  if (path === '/compte') {
    const { showAccount } = await import('./account-page');
    showAccount(root, me, logout);
  } else if (path === '/explorer') {
    const { ExplorerPage } = await import('./explorer-page');
    const explorer = new ExplorerPage(root, me);
    page = explorer;
    void explorer.start();
  } else {
    const { App } = await import('./app');
    const app = new App(root, me);
    page = app;
    void app.start();
  }
}

api.me().then(({ user }) => login(user), () => showAuth(root, login));

import './styles.css';
import { showAccount } from './account-page';
import { api, type Me } from './api';
import { App } from './app';
import { showAuth } from './auth-view';
import { startRouter } from './router';

const root = document.getElementById('app')!;
let me: Me | null = null;
let app: App | null = null;

function logout() {
  me = null;
  app?.stop();
  app = null;
  history.replaceState(null, '', '/');
  showAuth(root, login);
}

function login(user: Me) {
  me = user;
  startRouter(route);
}

function route(path: string) {
  if (!me) return;
  app?.stop();
  app = null;
  window.scrollTo(0, 0);
  if (path === '/compte') showAccount(root, me, logout);
  else { app = new App(root, me); void app.start(); }
}

api.me().then(({ user }) => login(user), () => showAuth(root, login));

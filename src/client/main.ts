import './styles.css';
import { api, type Me } from './api';
import { App } from './app';
import { showAuth } from './auth-view';

const root = document.getElementById('app')!;

function launch(me: Me) {
  void new App(root, me, () => showAuth(root, launch)).start();
}

api.me().then(({ user }) => launch(user), () => showAuth(root, launch));

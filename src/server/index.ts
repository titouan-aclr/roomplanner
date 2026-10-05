import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { roomList } from '../rooms';
import { initDb } from './db';
import { authRoutes, inviteRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { layoutRoutes } from './routes/layouts';
import { seed } from './seed';

const app = new Hono();
app.use('/api/*', logger());

const api = new Hono()
  .get('/health', (c) => c.json({ ok: true }))
  .get('/rooms', (c) => c.json({ rooms: roomList }))
  .route('/auth', authRoutes)
  .route('/invites', inviteRoutes)
  .route('/admin', adminRoutes)
  .route('/', layoutRoutes);
app.route('/api', api);
app.all('/api/*', (c) => c.json({ error: 'Route inconnue.' }, 404));

// En production, le serveur sert aussi l'interface compilée (dist/client), avec repli sur index.html.
const clientDir = process.env.CLIENT_DIR ?? 'dist/client';
app.use('/*', serveStatic({ root: clientDir }));
app.get('/*', serveStatic({ path: `${clientDir}/index.html` }));

await initDb();
await seed();
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`roomplanner sur http://localhost:${port}`));

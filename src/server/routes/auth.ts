import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  type AuthEnv, endSession, hashPassword, MIN_PASSWORD, PSEUDO_RE, publicUser, requireAdmin, requireUser, startSession, verifyPassword,
} from '../auth';
import { db, schema } from '../db';

const INVITE_DAYS = 14;

export const authRoutes = new Hono<AuthEnv>()
  .post('/login', async (c) => {
    const { pseudo, password } = await c.req.json<{ pseudo?: string; password?: string }>().catch(() => ({}) as { pseudo?: string; password?: string });
    const user = pseudo ? await db.select().from(schema.users).where(eq(schema.users.pseudo, pseudo.trim())).get() : undefined;
    if (!user || !password || !(await verifyPassword(password, user.passwordHash))) return c.json({ error: 'Pseudo ou mot de passe incorrect.' }, 401);
    await startSession(c, user.id);
    return c.json({ user: publicUser(user) });
  })
  .post('/logout', async (c) => {
    await endSession(c);
    return c.json({ ok: true });
  })
  .post('/register', async (c) => {
    const body = await c.req.json<{ code?: string; pseudo?: string; password?: string }>().catch(() => ({}) as Record<string, string>);
    const pseudo = body.pseudo?.trim() ?? '';
    if (!PSEUDO_RE.test(pseudo)) return c.json({ error: 'Pseudo : 2 à 24 caractères, lettres, chiffres, point, tiret ou souligné.' }, 400);
    if (!body.password || body.password.length < MIN_PASSWORD) return c.json({ error: `Mot de passe : ${MIN_PASSWORD} caractères minimum.` }, 400);
    const invite = body.code ? await db.select().from(schema.invites).where(and(eq(schema.invites.code, body.code), isNull(schema.invites.usedBy))).get() : undefined;
    if (!invite || invite.expiresAt < Date.now()) return c.json({ error: 'Invitation invalide, déjà utilisée ou expirée.' }, 400);
    if (await db.select().from(schema.users).where(eq(schema.users.pseudo, pseudo)).get()) return c.json({ error: 'Ce pseudo est déjà pris.' }, 409);
    const [user] = await db.insert(schema.users).values({ pseudo, passwordHash: await hashPassword(body.password) }).returning();
    await db.update(schema.invites).set({ usedBy: user.id, usedAt: Date.now() }).where(eq(schema.invites.code, invite.code));
    await startSession(c, user.id);
    return c.json({ user: publicUser(user) });
  })
  .get('/me', requireUser, (c) => c.json({ user: publicUser(c.get('user')) }))
  .post('/password', requireUser, async (c) => {
    const { current, next } = await c.req.json<{ current?: string; next?: string }>().catch(() => ({}) as Record<string, string>);
    const user = c.get('user');
    if (!current || !(await verifyPassword(current, user.passwordHash))) return c.json({ error: 'Mot de passe actuel incorrect.' }, 400);
    if (!next || next.length < MIN_PASSWORD) return c.json({ error: `Nouveau mot de passe : ${MIN_PASSWORD} caractères minimum.` }, 400);
    await db.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, user.id));
    return c.json({ ok: true });
  });

export const inviteRoutes = new Hono<AuthEnv>()
  .use(requireUser, requireAdmin)
  .get('/', async (c) => {
    const rows = await db.select({
      code: schema.invites.code, createdAt: schema.invites.createdAt, expiresAt: schema.invites.expiresAt,
      usedAt: schema.invites.usedAt, usedBy: schema.users.pseudo,
    }).from(schema.invites).leftJoin(schema.users, eq(schema.invites.usedBy, schema.users.id)).orderBy(desc(schema.invites.createdAt));
    return c.json({ invites: rows });
  })
  .post('/', async (c) => {
    const code = randomBytes(9).toString('base64url');
    const expiresAt = Date.now() + INVITE_DAYS * 86400_000;
    await db.insert(schema.invites).values({ code, createdBy: c.get('user').id, expiresAt });
    return c.json({ code, expiresAt });
  })
  .delete('/:code', async (c) => {
    await db.delete(schema.invites).where(and(eq(schema.invites.code, c.req.param('code')), isNull(schema.invites.usedBy)));
    return c.json({ ok: true });
  });

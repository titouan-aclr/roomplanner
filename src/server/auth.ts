import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db, schema } from './db';
import type { User } from './db/schema';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = 'rp_session';
const SESSION_DAYS = 90;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export async function startSession(c: Context, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_DAYS * 86400_000;
  await db.insert(schema.sessions).values({ id: digest(token), userId, expiresAt });
  setCookie(c, COOKIE, token, {
    httpOnly: true, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function endSession(c: Context) {
  const token = getCookie(c, COOKIE);
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, digest(token)));
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Utilisateur de la session en cours, ou null. */
export async function currentUser(c: Context): Promise<User | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await db.select().from(schema.sessions).innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, digest(token))).get();
  if (!row || row.sessions.expiresAt < Date.now()) return null;
  return row.users;
}

export type AuthEnv = { Variables: { user: User } };

/** Exige une session valide ; l'utilisateur est disponible via c.get('user'). */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Connecte-toi pour continuer.' }, 401);
  c.set('user', user);
  await next();
};

export const requireAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'Réservé à l’administrateur.' }, 403);
  await next();
};

export const publicUser = (u: User) => ({ id: u.id, pseudo: u.pseudo, role: u.role });

export const PSEUDO_RE = /^[\p{L}\p{N}_.-]{2,24}$/u;
export const MIN_PASSWORD = 8;

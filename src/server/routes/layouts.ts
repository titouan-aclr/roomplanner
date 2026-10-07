import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { rooms } from '../../rooms';
import type { Layout, PlacedItem } from '../../shared/types';
import { type AuthEnv, requireUser } from '../auth';
import { db, schema } from '../db';
import type { LayoutRow, User } from '../db/schema';

const FACES = new Set(['S', 'N', 'E', 'W']);
const MAX_ITEMS = 40;

/** Vérifie la forme des meubles envoyés par le navigateur et ne garde que les champs connus. */
export function parseItems(raw: unknown): Layout | null {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return null;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 5000;
  const out: PlacedItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.id !== 'string' || typeof r.type !== 'string' || typeof r.label !== 'string') return null;
    if (!FACES.has(r.face as string) || ![r.x, r.y, r.w, r.d].every(num)) return null;
    const it: PlacedItem = { id: r.id.slice(0, 40), type: r.type.slice(0, 40), label: r.label.slice(0, 60), face: r.face as PlacedItem['face'], x: r.x as number, y: r.y as number, w: r.w as number, d: r.d as number };
    for (const k of ['h', 'clear', 'min', 'sides', 'sidesMin', 'count'] as const) if (num(r[k])) it[k] = r[k] as number;
    if (r.hidden === true) it.hidden = true;
    if (typeof r.notch === 'string') it.notch = r.notch.slice(0, 40);
    out.push(it);
  }
  return out;
}

const parseName = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null);

type Voters = { up: string[]; down: string[] };

/** Qui a voté quoi, pour chaque disposition (réservé à l'administrateur). */
async function votersFor(ids: number[]): Promise<Map<number, Voters>> {
  const out = new Map<number, Voters>();
  if (!ids.length) return out;
  const rows = await db.select({ layoutId: schema.votes.layoutId, value: schema.votes.value, pseudo: schema.users.pseudo })
    .from(schema.votes).innerJoin(schema.users, eq(schema.votes.userId, schema.users.id))
    .where(inArray(schema.votes.layoutId, ids)).orderBy(asc(schema.users.pseudo));
  for (const r of rows) {
    const v = out.get(r.layoutId) ?? { up: [], down: [] };
    (r.value > 0 ? v.up : v.down).push(r.pseudo);
    out.set(r.layoutId, v);
  }
  return out;
}

function toDto(row: LayoutRow, owner: Pick<User, 'id' | 'pseudo'>, up: number, down: number, mine: number, voters?: Voters) {
  const items = JSON.parse(row.items) as Layout;
  const ev = rooms[row.roomId]?.evaluate(items);
  return {
    id: row.id, roomId: row.roomId, name: row.name, items, initial: JSON.parse(row.initial) as Layout,
    notes: row.notes ? JSON.parse(row.notes) : null, parentId: row.parentId, position: row.position, version: row.version,
    owner, createdAt: row.createdAt, updatedAt: row.updatedAt,
    votes: voters ? { up, down, mine, voters } : { up, down, mine },
    ok: ev?.ok ?? false, score: ev?.score ?? 0,
  };
}

async function loadOne(id: number, user: User) {
  const userId = user.id;
  const row = await db.select({
    l: schema.layouts, ownerPseudo: schema.users.pseudo,
    up: sql<number>`coalesce((select count(*) from votes v where v.layout_id = ${schema.layouts.id} and v.value = 1), 0)`,
    down: sql<number>`coalesce((select count(*) from votes v where v.layout_id = ${schema.layouts.id} and v.value = -1), 0)`,
    mine: sql<number>`coalesce((select value from votes v where v.layout_id = ${schema.layouts.id} and v.user_id = ${userId}), 0)`,
  }).from(schema.layouts).innerJoin(schema.users, eq(schema.layouts.ownerId, schema.users.id))
    .where(and(eq(schema.layouts.id, id), isNull(schema.layouts.deletedAt))).get();
  if (!row) return null;
  const voters = user.role === 'admin' ? (await votersFor([id])).get(id) ?? { up: [], down: [] } : undefined;
  return toDto(row.l, { id: row.l.ownerId, pseudo: row.ownerPseudo }, row.up, row.down, row.mine, voters);
}

export const layoutRoutes = new Hono<AuthEnv>()
  .use(requireUser)
  // Toutes les dispositions d'une pièce, avec leur auteur et leurs votes.
  .get('/rooms/:roomId/layouts', async (c) => {
    const roomId = c.req.param('roomId');
    if (!rooms[roomId]) return c.json({ error: 'Pièce inconnue.' }, 404);
    const me = c.get('user').id;
    const rows = await db.select({
      l: schema.layouts, ownerPseudo: schema.users.pseudo,
      up: sql<number>`coalesce((select count(*) from votes v where v.layout_id = ${schema.layouts.id} and v.value = 1), 0)`,
      down: sql<number>`coalesce((select count(*) from votes v where v.layout_id = ${schema.layouts.id} and v.value = -1), 0)`,
      mine: sql<number>`coalesce((select value from votes v where v.layout_id = ${schema.layouts.id} and v.user_id = ${me}), 0)`,
    }).from(schema.layouts).innerJoin(schema.users, eq(schema.layouts.ownerId, schema.users.id))
      .where(and(eq(schema.layouts.roomId, roomId), isNull(schema.layouts.deletedAt)))
      .orderBy(asc(schema.layouts.position), asc(schema.layouts.id));
    const voters = c.get('user').role === 'admin' ? await votersFor(rows.map((r) => r.l.id)) : null;
    return c.json({ layouts: rows.map((r) => toDto(r.l, { id: r.l.ownerId, pseudo: r.ownerPseudo }, r.up, r.down, r.mine, voters ? voters.get(r.l.id) ?? { up: [], down: [] } : undefined)) });
  })
  // Nouvelle disposition (vide, depuis le solveur ou copie d'une autre).
  .post('/rooms/:roomId/layouts', async (c) => {
    const roomId = c.req.param('roomId');
    if (!rooms[roomId]) return c.json({ error: 'Pièce inconnue.' }, 404);
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const name = parseName(body.name), items = parseItems(body.items);
    if (!name || !items) return c.json({ error: 'Nom ou meubles invalides.' }, 400);
    const parentId = typeof body.parentId === 'number' ? body.parentId : null;
    const max = await db.select({ p: sql<number>`coalesce(max(position), 0)` }).from(schema.layouts).where(eq(schema.layouts.roomId, roomId)).get();
    const json = JSON.stringify(items);
    const [row] = await db.insert(schema.layouts).values({
      roomId, ownerId: c.get('user').id, name, items: json, initial: json, parentId, position: (max?.p ?? 0) + 1,
    }).returning();
    return c.json({ layout: await loadOne(row.id, c.get('user')) }, 201);
  })
  // Modification : seulement par l'auteur, et seulement si personne n'a enregistré entre-temps.
  .patch('/layouts/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const row = await db.select().from(schema.layouts).where(and(eq(schema.layouts.id, id), isNull(schema.layouts.deletedAt))).get();
    if (!row) return c.json({ error: 'Disposition introuvable.' }, 404);
    if (row.ownerId !== c.get('user').id) return c.json({ error: 'Tu ne peux modifier que tes propres dispositions. Duplique-la pour la modifier.' }, 403);
    if (body.version !== row.version) return c.json({ error: 'Cette disposition a été modifiée ailleurs entre-temps.', layout: await loadOne(id, c.get('user')) }, 409);
    const patch: Partial<LayoutRow> = { version: row.version + 1, updatedAt: Date.now() };
    if (body.name !== undefined) { const n = parseName(body.name); if (!n) return c.json({ error: 'Nom invalide.' }, 400); patch.name = n; }
    if (body.items !== undefined) { const it = parseItems(body.items); if (!it) return c.json({ error: 'Meubles invalides.' }, 400); patch.items = JSON.stringify(it); }
    await db.update(schema.layouts).set(patch).where(eq(schema.layouts.id, id));
    return c.json({ layout: await loadOne(id, c.get('user')) });
  })
  .delete('/layouts/:id', async (c) => {
    const id = Number(c.req.param('id')), user = c.get('user');
    const row = await db.select().from(schema.layouts).where(and(eq(schema.layouts.id, id), isNull(schema.layouts.deletedAt))).get();
    if (!row) return c.json({ error: 'Disposition introuvable.' }, 404);
    if (row.ownerId !== user.id && user.role !== 'admin') return c.json({ error: 'Tu ne peux supprimer que tes propres dispositions.' }, 403);
    await db.update(schema.layouts).set({ deletedAt: Date.now() }).where(eq(schema.layouts.id, id));
    return c.json({ ok: true });
  })
  // Vote : 1 = pouce en l'air, -1 = pouce vers le bas, 0 = retirer son vote.
  .put('/layouts/:id/vote', async (c) => {
    const id = Number(c.req.param('id')), userId = c.get('user').id;
    const { value } = await c.req.json<{ value?: number }>().catch(() => ({}) as { value?: number });
    if (value !== 1 && value !== -1 && value !== 0) return c.json({ error: 'Vote invalide.' }, 400);
    const exists = await db.select({ id: schema.layouts.id }).from(schema.layouts).where(and(eq(schema.layouts.id, id), isNull(schema.layouts.deletedAt))).get();
    if (!exists) return c.json({ error: 'Disposition introuvable.' }, 404);
    if (value === 0) await db.delete(schema.votes).where(and(eq(schema.votes.userId, userId), eq(schema.votes.layoutId, id)));
    else await db.insert(schema.votes).values({ userId, layoutId: id, value })
      .onConflictDoUpdate({ target: [schema.votes.userId, schema.votes.layoutId], set: { value, createdAt: Date.now() } });
    return c.json({ layout: await loadOne(id, c.get('user')) });
  });

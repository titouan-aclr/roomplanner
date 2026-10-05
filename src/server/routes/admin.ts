import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { rooms } from '../../rooms';
import type { Face, Layout, PlacedItem } from '../../shared/types';
import { type AuthEnv, requireAdmin, requireUser } from '../auth';
import { db, schema } from '../db';
import { EXPORT_FORMAT, type ExportedLayout } from '../exchange';
import { parseItems } from './layouts';

interface LegacyItem { label: string; face: Face; x: number; y: number; w: number; d: number; h?: number; hidden?: boolean; chimney?: boolean; clear?: number; min?: number }
interface LegacyTab { name: string; pros?: string[]; cons?: string[]; items: Record<string, LegacyItem>; initial?: Record<string, LegacyItem> }

/** Convertit les meubles de l'ancienne page (objet indexé par clé) en disposition. */
function convertLegacy(roomId: string, items: Record<string, LegacyItem>): Layout {
  const room = rooms[roomId];
  return Object.entries(items).map(([key, it]): PlacedItem => {
    const type = room.catalog[key] && key !== 'custom' ? key : 'custom';
    const out: PlacedItem = { id: key, type, label: String(it.label).slice(0, 60), face: it.face, x: Number(it.x), y: Number(it.y), w: Number(it.w), d: Number(it.d) };
    if (it.hidden) out.hidden = true;
    if (it.chimney && room.catalog[type]?.notchable) out.notch = room.catalog[type].notchable;
    if (type === 'custom' && it.clear) { out.clear = it.clear; out.min = it.min ?? it.clear; }
    if (it.h) out.h = it.h;
    return out;
  });
}

interface Incoming { name: string; ownerPseudo?: string; items: Layout; initial: Layout; notes: string | null }

/** Lit un export roomplanner ou un export de l'ancienne page. */
function readImport(roomId: string, data: unknown): Incoming[] | string {
  const d = data as { format?: string; layouts?: ExportedLayout[]; tabs?: LegacyTab[] };
  if (d?.format === EXPORT_FORMAT && Array.isArray(d.layouts)) {
    const out: Incoming[] = [];
    for (const l of d.layouts) {
      const items = parseItems(l.items), initial = parseItems(l.initial ?? l.items);
      if (!items || !initial) return `Meubles illisibles dans « ${String(l.name)} ».`;
      out.push({ name: String(l.name), ownerPseudo: l.owner, items, initial, notes: l.notes ? JSON.stringify(l.notes) : null });
    }
    return out;
  }
  if (Array.isArray(d?.tabs)) {
    try {
      return d.tabs.map((t) => ({
        name: String(t.name), items: convertLegacy(roomId, t.items), initial: convertLegacy(roomId, t.initial ?? t.items),
        notes: t.pros && t.cons ? JSON.stringify({ pros: t.pros, cons: t.cons }) : null,
      }));
    } catch { return 'Meubles illisibles dans l’export de l’ancienne page.'; }
  }
  return 'Format non reconnu : colle un export roomplanner ou celui de l’ancienne page.';
}

export const adminRoutes = new Hono<AuthEnv>()
  .use(requireUser, requireAdmin)
  /**
   * Import d'un export roomplanner (les dispositions gardent leur auteur s'il existe ici, sinon elles sont
   * attribuées à l'administrateur) ou d'un export de l'ancienne page (attribuées à l'administrateur).
   */
  .post('/import/:roomId', async (c) => {
    const roomId = c.req.param('roomId');
    if (!rooms[roomId]) return c.json({ error: 'Pièce inconnue.' }, 404);
    const body = await c.req.json<{ data?: unknown; replace?: boolean }>().catch(() => ({}) as { data?: unknown; replace?: boolean });
    const incoming = readImport(roomId, body.data);
    if (typeof incoming === 'string') return c.json({ error: incoming }, 400);
    if (!incoming.length) return c.json({ error: 'Aucune disposition dans cet export.' }, 400);
    const users = await db.select({ id: schema.users.id, pseudo: schema.users.pseudo }).from(schema.users);
    if (body.replace) await db.update(schema.layouts).set({ deletedAt: Date.now() }).where(and(eq(schema.layouts.roomId, roomId), isNull(schema.layouts.deletedAt)));
    const max = await db.select({ p: sql<number>`coalesce(max(position), 0)` }).from(schema.layouts).where(eq(schema.layouts.roomId, roomId)).get();
    let position = max?.p ?? 0;
    for (const l of incoming) {
      const ownerId = users.find((u) => u.pseudo === l.ownerPseudo)?.id ?? c.get('user').id;
      await db.insert(schema.layouts).values({
        roomId, ownerId, name: l.name.slice(0, 80) || 'Sans nom',
        items: JSON.stringify(l.items), initial: JSON.stringify(l.initial), notes: l.notes, position: ++position,
      });
    }
    return c.json({ imported: incoming.length });
  });

import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { rooms } from '../../rooms';
import type { Face, Layout, PlacedItem } from '../../shared/types';
import { type AuthEnv, requireAdmin, requireUser } from '../auth';
import { db, schema } from '../db';

interface LegacyItem { label: string; face: Face; x: number; y: number; w: number; d: number; h?: number; hidden?: boolean; chimney?: boolean; clear?: number; min?: number }
interface LegacyTab { name: string; pros?: string[]; cons?: string[]; items: Record<string, LegacyItem>; initial?: Record<string, LegacyItem> }

/** Convertit les meubles de l'ancienne version (objet indexé par clé) en disposition. */
function convert(roomId: string, items: Record<string, LegacyItem>): Layout {
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

export const adminRoutes = new Hono<AuthEnv>()
  .use(requireUser, requireAdmin)
  /** Import des onglets de l'ancienne version (export du localStorage), au nom de l'administrateur. */
  .post('/import-legacy/:roomId', async (c) => {
    const roomId = c.req.param('roomId');
    if (!rooms[roomId]) return c.json({ error: 'Pièce inconnue.' }, 404);
    const body = await c.req.json<{ state?: { tabs?: LegacyTab[] }; replace?: boolean }>().catch(() => ({}) as { state?: { tabs?: LegacyTab[] }; replace?: boolean });
    const tabs = body.state?.tabs;
    if (!Array.isArray(tabs) || !tabs.length) return c.json({ error: 'Export invalide : aucun onglet trouvé.' }, 400);
    let converted: { tab: LegacyTab; items: Layout; initial: Layout }[];
    try {
      converted = tabs.map((tab) => ({ tab, items: convert(roomId, tab.items), initial: convert(roomId, tab.initial ?? tab.items) }));
    } catch {
      return c.json({ error: 'Export invalide : meubles illisibles.' }, 400);
    }
    if (body.replace) await db.update(schema.layouts).set({ deletedAt: Date.now() }).where(and(eq(schema.layouts.roomId, roomId), isNull(schema.layouts.deletedAt)));
    const max = await db.select({ p: sql<number>`coalesce(max(position), 0)` }).from(schema.layouts).where(eq(schema.layouts.roomId, roomId)).get();
    let position = max?.p ?? 0;
    for (const { tab, items, initial } of converted) {
      await db.insert(schema.layouts).values({
        roomId, ownerId: c.get('user').id, name: String(tab.name).slice(0, 80) || 'Sans nom',
        items: JSON.stringify(items), initial: JSON.stringify(initial),
        notes: tab.pros && tab.cons ? JSON.stringify({ pros: tab.pros, cons: tab.cons }) : null,
        position: ++position,
      });
    }
    return c.json({ imported: converted.length });
  });

import { count, eq } from 'drizzle-orm';
import { rooms } from '../rooms';
import { hashPassword } from './auth';
import { db, schema } from './db';

/**
 * Premier démarrage : crée le compte administrateur (ADMIN_PSEUDO / ADMIN_PASSWORD) s'il n'y a aucun
 * utilisateur, puis remplit chaque pièce sans disposition avec ses propositions de départ.
 */
export async function seed() {
  const { n } = (await db.select({ n: count() }).from(schema.users).get())!;
  if (n === 0) {
    const pseudo = process.env.ADMIN_PSEUDO, password = process.env.ADMIN_PASSWORD;
    if (!pseudo || !password) {
      console.warn('Aucun utilisateur : définis ADMIN_PSEUDO et ADMIN_PASSWORD pour créer le compte administrateur.');
      return;
    }
    await db.insert(schema.users).values({ pseudo, passwordHash: await hashPassword(password), role: 'admin' });
    console.log(`Compte administrateur « ${pseudo} » créé.`);
  }
  const admin = await db.select().from(schema.users).where(eq(schema.users.role, 'admin')).get();
  if (!admin) return;
  for (const room of Object.values(rooms)) {
    const { n: existing } = (await db.select({ n: count() }).from(schema.layouts).where(eq(schema.layouts.roomId, room.data.id)).get())!;
    if (existing > 0) continue;
    await db.insert(schema.layouts).values(room.proposals.map((p, i) => {
      const json = JSON.stringify(p.layout);
      return { roomId: room.data.id, ownerId: admin.id, name: `${p.key} · ${p.name}`, items: json, initial: json, notes: JSON.stringify({ pros: p.pros, cons: p.cons }), position: i + 1 };
    }));
    console.log(`${room.data.name} : ${room.proposals.length} propositions ajoutées.`);
  }
}

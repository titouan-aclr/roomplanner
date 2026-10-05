import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch() * 1000)`;

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pseudo: text('pseudo').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  createdAt: integer('created_at').notNull().default(now),
});

export const sessions = sqliteTable('sessions', {
  /** Empreinte SHA-256 du jeton stocké dans le cookie. */
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});

export const invites = sqliteTable('invites', {
  code: text('code').primaryKey(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull().default(now),
  expiresAt: integer('expires_at').notNull(),
  usedBy: integer('used_by').references(() => users.id),
  usedAt: integer('used_at'),
});

export const layouts = sqliteTable('layouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: text('room_id').notNull(),
  ownerId: integer('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  /** Meubles (JSON). */
  items: text('items').notNull(),
  /** État de départ, pour « Réinitialiser » (JSON). */
  initial: text('initial').notNull(),
  /** Points forts / limites des propositions (JSON), affichés tant que la disposition n'a pas changé. */
  notes: text('notes'),
  parentId: integer('parent_id'),
  position: integer('position').notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
  deletedAt: integer('deleted_at'),
}, (t) => [index('layouts_room_idx').on(t.roomId)]);

export const votes = sqliteTable('votes', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  layoutId: integer('layout_id').notNull().references(() => layouts.id, { onDelete: 'cascade' }),
  value: integer('value').notNull(),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [primaryKey({ columns: [t.userId, t.layoutId] })]);

export type User = typeof users.$inferSelect;
export type LayoutRow = typeof layouts.$inferSelect;

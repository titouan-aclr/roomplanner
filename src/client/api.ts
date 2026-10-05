import type { Layout } from '../shared/types';

export interface Me { id: number; pseudo: string; role: 'admin' | 'member' }
export interface LayoutDto {
  id: number;
  roomId: string;
  name: string;
  items: Layout;
  initial: Layout;
  notes: { pros: string[]; cons: string[] } | null;
  parentId: number | null;
  position: number;
  version: number;
  owner: { id: number; pseudo: string };
  votes: { up: number; down: number; mine: number };
  ok: boolean;
  score: number;
}
export interface Invite { code: string; createdAt: number; expiresAt: number; usedAt: number | null; usedBy: string | null }

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body: unknown) { super(message); }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Erreur ${res.status}`, data);
  return data as T;
}

export const api = {
  me: () => call<{ user: Me }>('GET', '/auth/me'),
  login: (pseudo: string, password: string) => call<{ user: Me }>('POST', '/auth/login', { pseudo, password }),
  register: (code: string, pseudo: string, password: string) => call<{ user: Me }>('POST', '/auth/register', { code, pseudo, password }),
  logout: () => call<{ ok: true }>('POST', '/auth/logout'),
  changePassword: (current: string, next: string) => call<{ ok: true }>('POST', '/auth/password', { current, next }),

  layouts: (roomId: string) => call<{ layouts: LayoutDto[] }>('GET', `/rooms/${roomId}/layouts`),
  createLayout: (roomId: string, name: string, items: Layout, parentId?: number) =>
    call<{ layout: LayoutDto }>('POST', `/rooms/${roomId}/layouts`, { name, items, parentId }),
  updateLayout: (id: number, version: number, patch: { name?: string; items?: Layout }) =>
    call<{ layout: LayoutDto }>('PATCH', `/layouts/${id}`, { ...patch, version }),
  deleteLayout: (id: number) => call<{ ok: true }>('DELETE', `/layouts/${id}`),
  vote: (id: number, value: -1 | 0 | 1) => call<{ layout: LayoutDto }>('PUT', `/layouts/${id}/vote`, { value }),

  invites: () => call<{ invites: Invite[] }>('GET', '/invites'),
  createInvite: () => call<{ code: string; expiresAt: number }>('POST', '/invites'),
  deleteInvite: (code: string) => call<{ ok: true }>('DELETE', `/invites/${code}`),
  importLayouts: (roomId: string, data: unknown, replace: boolean) => call<{ imported: number }>('POST', `/admin/import/${roomId}`, { data, replace }),
  exportUrl: (roomId: string) => `/api/admin/export/${roomId}`,
};

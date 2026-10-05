import type { Layout } from '../shared/types';

/** Format des fichiers d'export de dispositions (GET /api/rooms/:roomId/export). */
export const EXPORT_FORMAT = 'roomplanner-layouts-v1';

export interface ExportedLayout {
  name: string;
  owner: string;
  items: Layout;
  initial: Layout;
  notes: { pros: string[]; cons: string[] } | null;
  votes?: { up: number; down: number };
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  roomId: string;
  exportedAt: string;
  layouts: ExportedLayout[];
}

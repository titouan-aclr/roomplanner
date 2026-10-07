// Types partagés entre le navigateur et le serveur. Unités : cm.
// Repère : origine au coin haut-gauche du plan, x vers la droite, y vers le bas.

export type Point = [number, number];
export interface Rect { x: number; y: number; w: number; h: number }
/** Direction vers laquelle regarde l'avant du meuble. */
export type Face = 'S' | 'N' | 'E' | 'W';
export type Side = 'top' | 'bottom' | 'left' | 'right';

// ---------- Dessin ----------
export type DrawPrimitive =
  | { kind: 'rect'; class?: string; x: number; y: number; w: number; h: number }
  | { kind: 'gap'; x: number; y: number; w: number; h: number }
  | { kind: 'line'; class?: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'path'; class?: string; d: string }
  | { kind: 'text'; class?: string; x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end' }
  | { kind: 'fins'; x: number; y: number; w: number; h: number; step: number };

export type Dimension =
  | { axis: 'h'; from: number; to: number; at: number; label: string }
  | { axis: 'v'; from: number; to: number; at: number; label: string }
  | { axis: 'text'; x: number; y: number; label: string; anchor?: 'start' | 'middle' | 'end' };

// ---------- Pièce ----------
export interface FixedElement {
  id: string;
  label: string;
  /** Avec article, pour les phrases : « la cheminée ». */
  labelDef?: string;
  kind: 'obstacle' | 'sconce';
  rect?: Rect;
  height?: number;
  /** Mur auquel l'élément est adossé (pour les découpes de plan de travail). */
  attachedTo?: Side;
  notchInfo?: string;
  /** Zone devant l'élément où un meuble bloque la chaleur (radiateur). */
  heatZone?: Rect;
  /** Appliques : mur, position du centre le long du mur, largeur, hauteur du bas. */
  wall?: Side;
  at?: number;
  span?: number;
  bottom?: number;
  draw?: DrawPrimitive[];
}

export interface Opening {
  id: string;
  kind: 'window' | 'door';
  label: string;
  rect: Rect;
  draw?: DrawPrimitive[];
}

export interface Zone {
  id: string;
  /** keepFree : aucun meuble ; entry : passage depuis la porte (point de départ de la circulation). */
  kind: 'keepFree' | 'entry';
  /**
   * Zones d'un même groupe (les battants d'une fenêtre) : un meuble peut en bloquer une partie
   * (avertissement), jamais toutes à la fois.
   */
  group?: string;
  /** Nom du groupe pour les messages (« la fenêtre »). */
  groupLabel?: string;
  label: string;
  rect: Rect;
  message: string;
  frontWarning?: string;
}

// ---------- Meubles ----------
export interface Clearance { comfort: number; min: number }

/** Type de meuble d'une pièce. Les règles propres à chaque pièce vivent dans son module (src/rooms/…). */
export interface FurnitureType {
  label: string;
  /** Jeton de couleur CSS (--c-<color>). */
  color: string;
  /** Dessin détaillé : bed, wardrobe, desk, dresser, piano ou box. */
  render: string;
  /** Peut être tourné de 45° (option « en biais »). */
  tilt?: boolean;
  w: number;
  d: number;
  h: number;
  /** Espace devant (chaise, portes, tiroirs, banc…). */
  front?: Clearance & {
    what: string;
    /** Bords latéraux non concernés (accoudoirs d'un canapé, en cm de chaque côté) : l'espace n'est exigé que devant le reste. */
    inset?: number;
  };
  /** Passage sur les côtés (lit). */
  sides?: Clearance;
  /** Largeurs acceptées : min bloquant, soft avertissement, max bloquant. */
  width?: { min?: number; soft?: number; max?: number };
  /** Élément fixe autour duquel le plateau peut être découpé. */
  notchable?: string;
  /** Ajoutable plusieurs fois depuis l'éditeur (meuble libre). */
  multiple?: boolean;
}

export interface RoomData {
  id: string;
  name: string;
  home?: string;
  height: number;
  polygon: Point[];
  outline: Point[];
  viewBox: [number, number, number, number];
  fixed: FixedElement[];
  openings: Opening[];
  zones: Zone[];
  dimensions: Dimension[];
  snap: {
    x: number[];
    y: number[];
    slantRight?: { x0: number; y0: number; dx: number; dy: number };
    slantBottom?: { y0: number; x0: number; dy: number; dx: number };
  };
}

// ---------- Disposition ----------
export interface PlacedItem {
  /** Identifiant stable dans la disposition (« bed », « piano », « custom-3 »…). */
  id: string;
  /** Clé du type dans le catalogue de la pièce. */
  type: string;
  label: string;
  face: Face;
  x: number;
  y: number;
  w: number;
  d: number;
  h?: number;
  hidden?: boolean;
  /** Id de l'élément fixe autour duquel le plateau est découpé (ex. « chimney »). */
  notch?: string;
  /** Tourné de 45° dans le sens des aiguilles d'une montre par rapport à `face` (fauteuil en biais). */
  tilt?: boolean;
  /** Surcharges des espaces devant / sur les côtés. */
  clear?: number;
  min?: number;
  sides?: number;
  sidesMin?: number;
  /** Nombre souhaité (chaises autour d'une table, etc.). */
  count?: number;
}

export type Layout = PlacedItem[];

export type Severity = 'error' | 'warn' | 'info';
export interface Issue { sev: Severity; item: string | null; msg: string }

export interface Evaluation {
  ok: boolean;
  score: number;
  issues: Issue[];
  bedSides: number;
  bedFoot: boolean;
  sideDepths: Record<string, { depth: number; ok: boolean }[]>;
  frontDepth: Record<string, number>;
  freeM2: number;
  reach: { W: number; H: number; cell: number; cells: Uint8Array };
  /** Côtés d'une table où une chaise trouve sa place (pour le dessin). */
  seats?: Record<string, Side[]>;
}

// ---------- Module de pièce ----------
export interface SolveOptions {
  /** Pas de la grille de positions (cm). */
  step?: number;
  /** Autoriser les plateaux découpés autour d'un élément fixe. */
  allowNotch?: boolean;
  /** Nombre maximum de familles renvoyées. */
  limit?: number;
  /** Largeurs et profondeurs à essayer par type de meuble (sinon celles du meuble de départ). */
  sizes?: Record<string, { widths?: number[]; depths?: number[] }>;
}

/** Paramètres proposés par défaut sur la page Explorer. */
export interface ExploreDefaults {
  /** Types toujours placés par le solveur. */
  required: string[];
  /** Types optionnels que l'on peut cocher. */
  optional: string[];
  sizes: Record<string, { widths: number[]; depths: number[] }>;
  /** Élément fixe autour duquel un plateau peut être découpé (option proposée). */
  notch?: { fixed: string; label: string };
}

export interface SolveFamily { layout: Layout; score: number; freeM2: number; bedSides: number; bedFoot: boolean; summary: string }
export interface SolveResult { families: SolveFamily[]; evaluated: number; valid: number; ms: number }

export interface Proposal { key: string; name: string; pros: string[]; cons: string[]; layout: Layout }

/** Tout ce qu'une pièce apporte : géométrie, meubles, règles, stratégie de recherche et propositions. */
export interface RoomModule {
  data: RoomData;
  catalog: Record<string, FurnitureType>;
  /** Disposition de départ pour une nouvelle disposition vide. */
  starter: Layout;
  evaluate(layout: Layout): Evaluation;
  solve(base: Layout, opts?: SolveOptions): SolveResult;
  proposals: Proposal[];
  explore: ExploreDefaults;
}

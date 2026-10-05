// Moteur de la chambre : géométrie, contraintes et recherche de dispositions.
// Unités : cm. Origine : coin intérieur haut-gauche du plan, x vers la droite, y vers le bas.
(function (root) {
  'use strict';

  // ---------- Pièce (mesures intérieures du plan Leroy Merlin) ----------
  // Mur gauche 327, haut-gauche 147, décrochement 26, haut-droit 14+100+97, mur droit 297, bas 354.
  // Les murs droit et bas sont légèrement de biais (~4 cm), on les garde tels quels.
  const ROOM = {
    poly: [[0, 0], [147, 0], [147, 26], [358, 26], [354, 323], [0, 327]],
    height: 260,
  };

  // Éléments fixes. kind: 'hard' = rien ne peut être posé dessus ; 'opening' et 'decor' = dessin seulement.
  const FIXED = [
    { id: 'chimney', label: 'Cheminée', x: 161, y: 26, w: 100, h: 26, kind: 'hard', note: 'h 100 cm' },
    { id: 'radiator', label: 'Radiateur', x: 344, y: 242, w: 12, h: 50, kind: 'hard', note: '50 × 40 cm' },
    { id: 'window', label: 'Fenêtre', x: 356, y: 84, w: 3, h: 125, kind: 'opening' },
    { id: 'door', label: 'Porte', x: 262, y: 322, w: 75, h: 5, kind: 'opening' },
    { id: 'appl1', label: 'Applique', x: 0, y: 77, w: 6, h: 25, kind: 'decor' },
    { id: 'appl2', label: 'Applique', x: 0, y: 277, w: 6, h: 25, kind: 'decor' },
  ];
  const ZONES = [
    // Battants de la fenêtre (2 vantaux ~62 cm) : rien devant.
    { id: 'windowSwing', label: 'Ouverture fenêtre', x: 294, y: 84, w: 64, h: 125 },
    // Entrée : la porte ouvre vers l'extérieur, mais il faut pouvoir entrer.
    { id: 'doorWay', label: 'Entrée', x: 262, y: 270, w: 75, h: 57 },
  ];
  const RADIATOR_FRONT = { x: 319, y: 242, w: 25, h: 50 };
  const SCONCES = [{ y: 90 }, { y: 290 }];

  // ---------- Meubles ----------
  // w = largeur (face avant), d = profondeur, h = hauteur.
  // clear = espace confortable devant la face avant, min = minimum en dessous duquel ce n'est plus utilisable.
  const DEFAULT_ITEMS = {
    bed: { label: 'Lit coffre', w: 150, d: 212, h: 100, clear: 0, sides: 60, sidesMin: 45, color: 'bed' },
    wardrobe: { label: 'Armoire', w: 160, d: 60, h: 236, clear: 60, min: 50, doors: 'battantes', wallFixed: true, wMin: 120, wSoft: 135, wMax: 160, widths: [135, 140, 150, 160], color: 'wardrobe' },
    desk: { label: 'Bureau', w: 140, d: 70, h: 75, clear: 90, min: 75, wMin: 140, wMax: 160, widths: [140, 150, 160], depths: [60, 70, 80], color: 'desk' },
    dresser: { label: 'Commode 3D', w: 60, d: 40, h: 80, clear: 50, min: 40, optional: true, color: 'dresser' },
    piano: { label: 'Piano', w: 135, d: 32, h: 90, clear: 65, min: 50, optional: true, color: 'piano' },
  };
  // Espaces devant l'armoire selon le type de portes (confort / minimum).
  // Portes battantes de 30 à 45 cm : 50 cm minimum devant, 60 pour être à l'aise.
  const DOORS = { battantes: { clear: 60, min: 50 }, coulissantes: { clear: 50, min: 40 } };
  const minOf = (s) => (s.min == null ? s.clear || 0 : Math.min(s.min, s.clear || 0));

  // ---------- Géométrie ----------
  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const EPS = 0.01;
  function rectInRoom(r) {
    const x0 = r.x + EPS, y0 = r.y + EPS, x1 = r.x + r.w - EPS, y1 = r.y + r.h - EPS;
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1], [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]];
    return pts.every(([x, y]) => pointInPoly(x, y, ROOM.poly));
  }
  function overlap(a, b) {
    return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
  }
  function overlapArea(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  // face = direction vers laquelle regarde l'avant du meuble : 'S','N','E','W'.
  function footprint(p) {
    const vertical = p.face === 'S' || p.face === 'N';
    return { x: p.x, y: p.y, w: vertical ? p.w : p.d, h: vertical ? p.d : p.w };
  }
  function frontRect(p, depth) {
    const f = footprint(p);
    switch (p.face) {
      case 'S': return { x: f.x, y: f.y + f.h, w: f.w, h: depth };
      case 'N': return { x: f.x, y: f.y - depth, w: f.w, h: depth };
      case 'E': return { x: f.x + f.w, y: f.y, w: depth, h: f.h };
      default: return { x: f.x - depth, y: f.y, w: depth, h: f.h };
    }
  }
  // Côtés du lit (gauche/droite vus depuis le pied) : seuls les 120 derniers cm côté pied comptent.
  // Un chevet ou un coin de meuble près de l'oreiller n'empêche pas de se coucher.
  function bedSideRects(p, depth) {
    const f = footprint(p), skip = Math.max(70, p.d - 120);
    switch (p.face) {
      case 'S': return [{ x: f.x - depth, y: f.y + skip, w: depth, h: f.h - skip }, { x: f.x + f.w, y: f.y + skip, w: depth, h: f.h - skip }];
      case 'N': return [{ x: f.x - depth, y: f.y, w: depth, h: f.h - skip }, { x: f.x + f.w, y: f.y, w: depth, h: f.h - skip }];
      case 'E': return [{ x: f.x + skip, y: f.y - depth, w: f.w - skip, h: depth }, { x: f.x + skip, y: f.y + f.h, w: f.w - skip, h: depth }];
      default: return [{ x: f.x, y: f.y - depth, w: f.w - skip, h: depth }, { x: f.x, y: f.y + f.h, w: f.w - skip, h: depth }];
    }
  }
  function headPoint(p) {
    const f = footprint(p);
    switch (p.face) {
      case 'S': return [f.x + f.w / 2, f.y];
      case 'N': return [f.x + f.w / 2, f.y + f.h];
      case 'E': return [f.x, f.y + f.h / 2];
      default: return [f.x + f.w, f.y + f.h / 2];
    }
  }
  const BACK = { S: [0, -1], N: [0, 1], E: [-1, 0], W: [1, 0] };
  const LEFT = { S: [1, 0], N: [-1, 0], E: [0, -1], W: [0, 1] }; // pour les poussées latérales

  const HARD = () => FIXED.filter((f) => f.kind === 'hard');
  const CHIMNEY = FIXED.find((f) => f.id === 'chimney');

  // Bureau découpé autour de la cheminée : un bord du plateau touche le mur du haut (y = 26) et la cheminée
  // devient une encoche. Dos au mur (face S) : encoche au milieu du dos. En épi (face E/W) : encoche dans un coin.
  function chimneyMode(p) {
    return !!(p && p.chimney && p.face !== 'N' && Math.abs(p.y - CHIMNEY.y) <= 2 && overlap(footprint(p), CHIMNEY));
  }
  const hardFor = (p) => (chimneyMode(p) ? HARD().filter((h) => h.id !== 'chimney') : HARD());
  function notchOf(p) {
    const f = footprint(p), c = CHIMNEY;
    const x0 = Math.max(f.x, c.x), x1 = Math.min(f.x + f.w, c.x + c.w), y0 = Math.max(f.y, c.y), y1 = Math.min(f.y + f.h, c.y + c.h);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }
  // Espace devant le meuble. Pour un bureau en épi découpé, la partie devant la cheminée ne compte pas :
  // on s'assoit plus bas, le long du plateau.
  function frontOf(p, depth) {
    const r = frontRect(p, depth);
    if (chimneyMode(p) && (p.face === 'E' || p.face === 'W')) {
      const top = CHIMNEY.y + CHIMNEY.h;
      if (r.y < top) return { x: r.x, y: top, w: r.w, h: Math.max(1, r.y + r.h - top) };
    }
    return r;
  }

  function fitsFixed(r, p) {
    if (!rectInRoom(r)) return false;
    for (const f of p ? hardFor(p) : HARD()) if (overlap(r, f)) return false;
    return true;
  }
  function freeOfFurnitureZones(r) {
    for (const z of ZONES) if (overlap(r, z)) return false;
    return true;
  }
  // Dos réellement contre un mur de la pièce (la cheminée ne compte pas) : indispensable pour fixer l'armoire.
  function backOnWall(p) {
    const f = footprint(p), pts = [];
    for (let t = 0.1; t <= 0.91; t += 0.2) {
      if (p.face === 'S') pts.push([f.x + f.w * t, f.y - 3]);
      else if (p.face === 'N') pts.push([f.x + f.w * t, f.y + f.h + 3]);
      else if (p.face === 'E') pts.push([f.x - 3, f.y + f.h * t]);
      else pts.push([f.x + f.w + 3, f.y + f.h * t]);
    }
    return pts.every(([x, y]) => !pointInPoly(x, y, ROOM.poly));
  }

  // Profondeur libre (cm) d'une bande, testée cm par cm. Renvoie aussi ce qui bloque.
  // La bande est rétrécie de 2 cm sur ses bords latéraux pour tolérer les murs légèrement de biais.
  function freeDepth(stripFn, max, blockers) {
    for (let d = 1; d <= max; d++) {
      const s0 = stripFn(d), lat = stripFn(d + 1);
      const horiz = lat.w === s0.w; // la bande grandit en hauteur : bords latéraux = gauche/droite
      const s = horiz ? { x: s0.x + 2, y: s0.y, w: Math.max(1, s0.w - 4), h: s0.h } : { x: s0.x, y: s0.y + 2, w: s0.w, h: Math.max(1, s0.h - 4) };
      if (!rectInRoom(s)) return { depth: d - 1, by: 'le mur' };
      for (const f of HARD()) if (overlap(s, f)) return { depth: d - 1, by: 'la ' + f.label.toLowerCase() };
      for (const b of blockers) if (overlap(s, b.r)) return { depth: d - 1, by: b.label.toLowerCase() };
    }
    return { depth: max, by: null };
  }

  // ---------- Génération de candidats ----------
  function pushUntilBlocked(p, dir, maxSteps) {
    let cur = { ...p };
    for (let i = 0; i < maxSteps; i++) {
      const nxt = { ...cur, x: cur.x + dir[0], y: cur.y + dir[1] };
      if (!fitsFixed(footprint(nxt))) return { pos: cur, hit: true };
      cur = nxt;
    }
    return { pos: cur, hit: false };
  }

  function candidates(key, spec, opts = {}) {
    const step = opts.step || 10;
    const out = new Map();
    const variants = [];
    const widths = key === 'wardrobe' || key === 'desk' ? spec.widths || [spec.w] : [spec.w];
    const depths = key === 'desk' ? spec.depths || [spec.d] : [spec.d];
    for (const w of widths) for (const d of depths) variants.push({ w, d });
    const add = (m) => { const k = `${m.face}|${m.x}|${m.y}|${m.w}|${m.d}|${m.chimney ? 1 : 0}`; if (!out.has(k)) out.set(k, m); };

    for (const v of variants) {
      for (const face of ['S', 'N', 'E', 'W']) {
        for (let gx = 0; gx <= 360; gx += step) {
          for (let gy = 0; gy <= 330; gy += step) {
            const base = { key, face, x: gx, y: gy, w: v.w, d: v.d };
            if (!fitsFixed(footprint(base))) continue;
            const back = pushUntilBlocked(base, BACK[face], 400);
            if (back.hit) {
              add(back.pos);
              const l = pushUntilBlocked(back.pos, LEFT[face], 400);
              if (l.hit) add(l.pos);
              const r = pushUntilBlocked(back.pos, [-LEFT[face][0], -LEFT[face][1]], 400);
              if (r.hit) add(r.pos);
            }
            // bureau / commode : côté contre un mur (en épi)
            if (key === 'desk' || key === 'dresser') {
              for (const dir of [LEFT[face], [-LEFT[face][0], -LEFT[face][1]]]) {
                const s = pushUntilBlocked(base, dir, 400);
                if (s.hit) add(s.pos);
              }
            }
          }
        }
      }
      // bureau intégré à la cheminée : plan de travail découpé
      if (key === 'desk' && spec.chimney) {
        if (v.d - CHIMNEY.h >= 30) {
          // dos au mur du haut
          const xs = [147];
          for (let x = 150; x + v.w <= 358; x += step) xs.push(x);
          xs.push(Math.floor(358 - (4 * v.d) / 297) - v.w);
          for (const x of xs) {
            const p = { key, face: 'S', x, y: CHIMNEY.y, w: v.w, d: v.d, chimney: true };
            if (x >= 147 && chimneyMode(p) && fitsFixed(footprint(p), p)) add(p);
          }
        }
        // en épi : le bout du plateau touche le mur du haut, encoche dans un coin
        for (const face of ['E', 'W']) {
          for (let x = 147; x <= 300; x += step / 2) {
            const p = { key, face, x, y: CHIMNEY.y, w: v.w, d: v.d, chimney: true };
            const n = notchOf(p);
            if (n.w > 0 && n.w <= v.d - 25 && chimneyMode(p) && fitsFixed(footprint(p), p)) add(p);
          }
        }
      }
    }
    const list = [];
    for (const c of out.values()) {
      const f = footprint(c);
      if (!freeOfFurnitureZones(f)) continue;
      if (spec.wallFixed && !backOnWall(c)) continue;
      const m = minOf(spec);
      if (m && !fitsFixed(frontOf(c, m))) continue;
      list.push(c);
    }
    return list;
  }

  // ---------- Circulation ----------
  const CELL = 5;
  function circulation(rects) {
    const xs = ROOM.poly.map((p) => p[0]), ys = ROOM.poly.map((p) => p[1]);
    const W = Math.ceil(Math.max(...xs) / CELL), H = Math.ceil(Math.max(...ys) / CELL);
    const blocked = new Uint8Array(W * H);
    const all = rects.concat(HARD());
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const cx = i * CELL + CELL / 2, cy = j * CELL + CELL / 2;
      let b = !pointInPoly(cx, cy, ROOM.poly);
      if (!b) for (const r of all) if (cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h) { b = true; break; }
      blocked[j * W + i] = b ? 1 : 0;
    }
    // distance (chamfer) au plus proche obstacle, en cm
    const INF = 1e9, dist = new Float64Array(W * H);
    for (let k = 0; k < W * H; k++) dist[k] = blocked[k] ? 0 : INF;
    const a = CELL, b = CELL * Math.SQRT2;
    const g = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : dist[j * W + i]);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i; if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], g(i - 1, j) + a, g(i, j - 1) + a, g(i - 1, j - 1) + b, g(i + 1, j - 1) + b);
    }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i; if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], g(i + 1, j) + a, g(i, j + 1) + a, g(i + 1, j + 1) + b, g(i - 1, j + 1) + b);
    }
    // un passage de ~45 cm : centre à ≥ 22 cm de tout obstacle
    const R = 22;
    const pass = (k) => dist[k] - CELL / 2 >= R - CELL / 2;
    const reach = new Uint8Array(W * H);
    const q = [];
    const door = ZONES.find((z) => z.id === 'doorWay');
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const cx = i * CELL + CELL / 2, cy = j * CELL + CELL / 2, k = j * W + i;
      if (cx > door.x + 15 && cx < door.x + door.w - 15 && cy > door.y && pass(k)) { reach[k] = 1; q.push(k); }
    }
    while (q.length) {
      const k = q.pop(), i = k % W, j = (k - i) / W;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni; if (!reach[nk] && pass(nk)) { reach[nk] = 1; q.push(nk); }
      }
    }
    let area = 0; for (let k = 0; k < W * H; k++) if (reach[k]) area++;
    return {
      W, H, reach, blocked,
      areaM2: (area * CELL * CELL) / 10000,
      reaches(r) {
        for (let j = Math.max(0, Math.floor(r.y / CELL)); j < Math.min(H, Math.ceil((r.y + r.h) / CELL)); j++)
          for (let i = Math.max(0, Math.floor(r.x / CELL)); i < Math.min(W, Math.ceil((r.x + r.w) / CELL)); i++) if (reach[j * W + i]) return true;
        return false;
      },
    };
  }

  // ---------- Évaluation ----------
  const WHAT = { desk: 'pour la chaise', wardrobe: 'pour ouvrir les portes', dresser: 'pour ouvrir les tiroirs', piano: 'pour le banc' };

  // Analyse complète d'une disposition (utilisée par le solveur et par l'éditeur).
  function evaluate(layout, items) {
    const issues = [], notes = [];
    let score = 0;
    const placed = Object.entries(layout).filter(([, p]) => p);
    const fps = {};
    for (const [k, p] of placed) fps[k] = footprint(p);
    const err = (item, msg) => issues.push({ sev: 'error', item, msg });
    const warn = (item, msg) => notes.push({ sev: 'warn', item, msg });
    const info = (item, msg) => notes.push({ sev: 'info', item, msg });

    // 1. dans la pièce, pas sur un obstacle, pas dans une zone, armoire fixée au mur
    for (const [k, p] of placed) {
      const f = fps[k], spec = items[k], label = spec.label;
      if (!rectInRoom(f)) err(k, `${label} dépasse des murs.`);
      for (const h of hardFor(p)) if (overlap(f, h)) err(k, `${label} chevauche la ${h.label.toLowerCase()}${h.id === 'chimney' && k === 'desk' ? ' (coche « découpé autour de la cheminée » pour l’intégrer)' : ''}.`);
      for (const z of ZONES) if (overlap(f, z)) err(k, z.id === 'windowSwing' ? `${label} empêche d'ouvrir la fenêtre.` : `${label} bloque l'entrée.`);
      if (spec.wallFixed && !backOnWall(p)) err(k, `${label} : doit être fixée contre un vrai mur (${spec.h || 236} cm de haut), pas contre la cheminée ni dans le vide.`);
      if (spec.wMin && p.w < spec.wMin) err(k, `${label} : ${p.w} cm de large, sous ta limite de ${spec.wMin} cm.`);
      if (spec.wSoft && p.w >= (spec.wMin || 0) && p.w < spec.wSoft) { warn(k, `${label} : ${p.w} cm de large, sous les ${spec.wSoft} cm souhaités (accepté jusqu'à ${spec.wMin}).`); score -= (spec.wSoft - p.w) * 0.5; }
      if (spec.wMax && p.w > spec.wMax) err(k, `${label} : ${p.w} cm de large, au-dessus de ta limite de ${spec.wMax} cm.`);
      if (chimneyMode(p)) {
        const n = notchOf(p);
        if (p.face === 'S') {
          const use = p.d - CHIMNEY.h;
          if (use < 30) err(k, `${label} : ${use} cm de plan devant la cheminée, trop peu pour travailler.`);
          else if (use < 45) warn(k, `${label} : ${use} cm de plan utile devant la cheminée (clavier oui, écran plutôt sur bras).`);
          info(k, 'Dessus de cheminée à 100 cm, soit 25 cm au-dessus du plan : bonne étagère, mais un écran posé dessus aurait son haut vers 135 cm, au-dessus des yeux (~120 cm assis).');
        } else {
          const rest = p.d - n.w;
          if (rest < 25) err(k, `${label} : l'encoche autour de la cheminée laisse ${rest} cm de plateau, trop peu.`);
          else info(k, `${label} : encoche de ${n.w} × ${n.h} cm dans le coin, autour de la cheminée. Le dessus de la cheminée (100 cm) sert d'étagère au bout du bureau.`);
        }
      } else if (p.chimney && overlap(f, CHIMNEY)) err(k, `${label} : pour l'intégrer à la cheminée, un bord du plateau doit toucher le mur du haut.`);
    }
    // 2. meubles entre eux
    for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
      const [ka] = placed[a], [kb] = placed[b];
      if (overlap(fps[ka], fps[kb])) err(ka, `${items[ka].label} et ${items[kb].label.toLowerCase()} se chevauchent.`);
    }
    // 3. espace devant : minimum (bloquant) et confort (avertissement)
    const fronts = {}, frontDepth = {};
    for (const [k, p] of placed) {
      const spec = items[k];
      if (!spec.clear) continue;
      const mn = minOf(spec);
      const others = placed.filter(([k2]) => k2 !== k).map(([k2]) => ({ r: fps[k2], label: items[k2].label }));
      const fd = freeDepth((d) => frontOf(p, d), spec.clear, others);
      frontDepth[k] = fd.depth;
      fronts[k] = frontOf(p, Math.max(1, Math.min(fd.depth, spec.clear)));
      const what = WHAT[k] || 'devant';
      if (fd.depth < mn) err(k, `${spec.label} : ${fd.depth} cm ${what}, bloqué par ${fd.by} (minimum ${mn}).`);
      else if (fd.depth < spec.clear) { warn(k, `${spec.label} : ${fd.depth} cm ${what} (confort ${spec.clear}, minimum ${mn}).`); score -= (spec.clear - fd.depth) * 0.4; }
    }
    const doorWay = ZONES.find((z) => z.id === 'doorWay');
    const swing = ZONES.find((z) => z.id === 'windowSwing');
    for (const [k, fr] of Object.entries(fronts)) {
      if (k === 'piano' && overlap(fr, doorWay)) { warn(k, 'Le banc du piano empiète sur l’entrée : à ranger sous le clavier quand on ne joue pas.'); score -= 4; }
      if (k !== 'desk') continue;
      if (overlap(fr, doorWay)) { warn(k, 'La place de la chaise empiète sur l’entrée : on la heurte en ouvrant la porte.'); score -= 8; }
      if (overlapArea(fr, swing) > 400) { warn(k, 'La chaise est dans le débattement de la fenêtre : il faudra la pousser pour ouvrir.'); score -= 4; }
    }
    // 4. circulation depuis la porte
    const circ = circulation(Object.values(fps));
    for (const [k, fr] of Object.entries(fronts)) {
      if (frontDepth[k] >= minOf(items[k]) && !circ.reaches(fr)) err(k, `${items[k].label} : on ne peut pas y accéder depuis la porte (passage < 45 cm).`);
    }
    // 5. lit : accès par les côtés, sinon par le pied
    let bedSides = 0, bedSideDepths = null, bedFoot = false;
    if (layout.bed) {
      const p = layout.bed, spec = items.bed, others = placed.filter(([k]) => k !== 'bed').map(([k]) => ({ r: fps[k], label: items[k].label }));
      const mn = spec.sidesMin ?? 45, comfy = spec.sides ?? 60;
      const depths = [0, 1].map((s) => freeDepth((d) => bedSideRects(p, d)[s], 80, others).depth);
      const usable = depths.map((d, s) => d >= mn && circ.reaches(bedSideRects(p, Math.min(d, 60))[s]));
      bedSides = usable.filter(Boolean).length;
      bedSideDepths = depths.map((d, s) => ({ depth: d, ok: usable[s] }));
      if (bedSides === 0) {
        const fd = freeDepth((d) => frontRect(p, d), 80, others).depth;
        bedFoot = fd >= mn && circ.reaches(frontRect(p, Math.min(fd, 60)));
        if (bedFoot) { warn('bed', `Lit accessible seulement par le pied (${fd} cm) : on y entre à quatre pattes, faire le lit est moins pratique.`); score -= 15; }
        else err('bed', `Lit : aucun accès, ni par les côtés ni par le pied (${mn} cm minimum).`);
      } else if (bedSides === 1) info('bed', 'Lit accessible d’un seul côté.');
      depths.forEach((d, s) => {
        if (usable[s] && d < comfy) { warn('bed', `Lit : passage de ${d} cm sur un côté (confort ${comfy}).`); score -= (comfy - d) * 0.2; }
        if (d > 8 && d < mn) info('bed', `Lit : espace perdu de ${d} cm sur un côté (trop étroit pour passer).`);
      });
    }
    // 6. confort (pénalités douces)
    const radCover = (k) => (layout[k] ? overlapArea(fps[k], RADIATOR_FRONT) : 0);
    if (radCover('wardrobe') > 0) { score -= 25; warn('wardrobe', 'Armoire devant le radiateur : la chaleur sera bloquée.'); }
    if (radCover('bed') > 0) { score -= 10; warn('bed', 'Lit collé au radiateur.'); }
    if (radCover('dresser') > 0) { score -= 6; warn('dresser', 'Commode devant le radiateur (chaleur + imprimante, à éviter).'); }
    if (layout.wardrobe) {
      const f = fps.wardrobe;
      for (const s of SCONCES) if (f.x < 8 && f.y < s.y + 12 && f.y + f.h > s.y - 12) { score -= 3; info('wardrobe', 'Armoire devant une applique : il faudra la déplacer.'); }
    }

    // Bonus
    if (layout.wardrobe) score += Math.max(0, Math.min(layout.wardrobe.w - 135, 25)) * 0.8; // 0..20
    if (layout.desk) {
      const de = layout.desk, depth = chimneyMode(de) ? de.d - CHIMNEY.h / 2 : de.d;
      score += Math.max(-10, Math.min(12, (depth - 60) * 0.6));
      score += de.w >= 140 ? 15 + Math.min((de.w - 140) / 3, 20) : (de.w - 140) / 2;
    }
    if (layout.dresser) score += 30;
    if (layout.piano) score += 12; // le piano passe après tout le reste
    if (radCover('piano') > 0) { score -= 8; warn('piano', 'Piano devant le radiateur : la chaleur abîme les instruments.'); }
    score += bedSides === 2 ? 15 : 0;
    // bureau : lumière naturelle (distance au centre de la fenêtre)
    if (layout.desk) {
      const f = fps.desk, cx = f.x + f.w / 2, cy = f.y + f.h / 2;
      score -= Math.hypot(cx - 356, cy - 146) / 15;
      if (layout.desk.face === 'E') { score -= 6; info('desk', 'Dos à la fenêtre : ton ombre tombera sur le bureau.'); }
    }
    // imprimante loin de la tête de lit (bruit, odeurs)
    if (layout.dresser && layout.bed) {
      const [hx, hy] = headPoint(layout.bed), f = fps.dresser;
      const d = Math.hypot(f.x + f.w / 2 - hx, f.y + f.h / 2 - hy);
      score += Math.min(d, 250) / 25;
      if (d < 120) warn('dresser', 'Imprimante 3D proche de la tête de lit (bruit, odeurs).');
    }
    score += circ.areaM2 * 6;

    return { ok: issues.length === 0, score: Math.round(score * 10) / 10, issues: issues.concat(notes), bedSides, bedFoot, bedSideDepths, frontDepth, freeM2: circ.areaM2, circ };
  }

  // ---------- Recherche ----------
  function solve(items, opts = {}) {
    const t0 = Date.now();
    const C = {};
    for (const k of Object.keys(items)) C[k] = candidates(k, items[k], opts);
    const fr = (k, c) => { const m = minOf(items[k]); return m ? frontOf(c, m) : null; };
    const clash = (ka, a, kb, b) => {
      const fa = footprint(a), fb = footprint(b);
      if (overlap(fa, fb)) return true;
      const ra = fr(ka, a), rb = fr(kb, b);
      if (ra && overlap(ra, fb)) return true;
      if (rb && overlap(rb, fa)) return true;
      return false;
    };
    const results = [];
    let evaluated = 0;
    const dressers = (C.dresser || []).concat([null]);
    for (const bed of C.bed) {
      for (const wa of C.wardrobe) {
        if (clash('bed', bed, 'wardrobe', wa)) continue;
        for (const de of C.desk) {
          if (clash('bed', bed, 'desk', de) || clash('wardrobe', wa, 'desk', de)) continue;
          for (const dr of dressers) {
            if (dr && (clash('bed', bed, 'dresser', dr) || clash('wardrobe', wa, 'dresser', dr) || clash('desk', de, 'dresser', dr))) continue;
            const layout = { bed, wardrobe: wa, desk: de, dresser: dr };
            evaluated++;
            const ev = evaluate(layout, items);
            if (ev.ok) results.push({ layout, score: ev.score, ev });
          }
        }
      }
    }
    results.sort((a, b) => b.score - a.score);
    // Piano (priorité la plus basse) : on l'essaie sur les meilleures dispositions de chaque famille
    // plutôt que dans toutes les combinaisons, sinon la recherche devient beaucoup trop longue.
    if (C.piano) {
      const baseSig = (l) => ['bed', 'wardrobe', 'desk', 'dresser'].map((k) => wallOf(l[k])).join('/');
      const perSig = new Map(), pool = [];
      for (const r of results) {
        const s = baseSig(r.layout), n = perSig.get(s) || 0;
        if (n < (opts.pianoPerFamily || 25)) { perSig.set(s, n + 1); pool.push(r); }
      }
      const keys = ['bed', 'wardrobe', 'desk', 'dresser'];
      // Positions adossées à un autre meuble (pied du lit, dos du bureau…), en plus de celles contre un mur.
      const backTo = (layout) => {
        const out = [], sp = items.piano, st = opts.step || 10;
        for (const k of keys) {
          const p = layout[k]; if (!p) continue;
          const f = footprint(p);
          for (let t = -sp.w + 20; t <= Math.max(f.w, f.h) - 20; t += st) {
            out.push({ key: 'piano', face: 'N', x: f.x + t, y: f.y - sp.d, w: sp.w, d: sp.d }); // dos contre le haut du meuble, face vers le haut
            out.push({ key: 'piano', face: 'S', x: f.x + t, y: f.y + f.h, w: sp.w, d: sp.d });
            out.push({ key: 'piano', face: 'W', x: f.x - sp.d, y: f.y + t, w: sp.w, d: sp.d });
            out.push({ key: 'piano', face: 'E', x: f.x + f.w, y: f.y + t, w: sp.w, d: sp.d });
          }
        }
        return out.filter((c) => fitsFixed(footprint(c)) && freeOfFurnitureZones(footprint(c)));
      };
      for (const r of pool) {
        for (const pi of C.piano.concat(backTo(r.layout))) {
          if (keys.some((k) => r.layout[k] && clash(k, r.layout[k], 'piano', pi))) continue;
          const layout = { ...r.layout, piano: pi };
          evaluated++;
          const ev = evaluate(layout, items);
          if (ev.ok) results.push({ layout, score: ev.score, ev });
        }
      }
      results.sort((a, b) => b.score - a.score);
    }
    // Diversité : on garde le meilleur par famille (mur de chaque meuble).
    const sig = (l) => ['bed', 'wardrobe', 'desk', 'dresser', 'piano'].map((k) => wallOf(l[k])).join('/');
    const seen = new Map();
    for (const r of results) {
      const s = sig(r.layout);
      if (!seen.has(s)) seen.set(s, r);
    }
    const families = [...seen.values()].sort((a, b) => b.score - a.score);
    return { families, total: results.length, evaluated, counts: Object.fromEntries(Object.entries(C).map(([k, v]) => [k, v.length])), ms: Date.now() - t0 };
  }

  function wallOf(p) {
    if (!p) return '-';
    if (chimneyMode(p)) return p.face === 'S' ? 'cheminée' : 'cheminée en épi';
    return { S: 'haut', N: 'bas', E: 'gauche', W: 'droite' }[p.face];
  }

  const api = { ROOM, FIXED, ZONES, RADIATOR_FRONT, DEFAULT_ITEMS, DOORS, CHIMNEY, minOf, footprint, frontRect, bedSideRects, chimneyMode, notchOf, frontOf, backOnWall, evaluate, solve, candidates, wallOf, circulation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RoomSolver = api;
})(typeof window !== 'undefined' ? window : globalThis);

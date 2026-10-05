# roomplanner

Planificateur d'aménagement de pièces à plusieurs : plan à l'échelle, meubles déplaçables, vérification
des dégagements (portes, fenêtres, chaises, armoires…), solveur qui explore les dispositions possibles,
comptes sur invitation et votes pour choisir la meilleure disposition.

Pièce actuelle : la chambre de l'appartement Marcadet. Le salon viendra ensuite.

## Fonctionnement

- Chaque utilisateur voit toutes les dispositions de chaque pièce, avec leur auteur et leurs votes.
- On ne modifie que ses propres dispositions ; pour partir de celle d'un autre, on la duplique.
- Les modifications sont enregistrées automatiquement. Si une même disposition est modifiée ailleurs
  entre-temps, la dernière version est rechargée au lieu d'être écrasée.
- Vote 👍 / 👎 sur chaque disposition, classement par pièce.
- Pas d'inscription libre : l'administrateur crée des liens d'invitation (valables 14 jours, une fois).

## Organisation du code

```
src/shared/        commun à toutes les pièces
  geometry.ts      emprises, espaces devant, côtés, coordonnées locales
  core.ts          RoomGeo (murs, obstacles, découpes, circulation, positions candidates),
                   Checker (vérifications réutilisables), recherche (élagage, familles)
  types.ts
src/rooms/         une pièce = un module
  chambre/
    room.json      murs, ouvertures, éléments fixes, zones, cotes et dessin
    catalog.ts     meubles et dimensions
    rules.ts       règles et note propres à la chambre
    solver.ts      stratégie de recherche
    proposals.ts   dispositions de départ
  index.ts         liste des pièces
src/server/        Hono + SQLite (libsql, Drizzle) : comptes, dispositions, votes, invitations
src/client/        Vite + TypeScript : plan SVG, éditeur, onglets, votes, solveur dans un Web Worker
drizzle/           migrations SQL (appliquées au démarrage)
legacy/            ancienne version autonome (une page HTML)
```

### Ajouter une pièce

1. Créer `src/rooms/<pièce>/` sur le modèle de `chambre/` : `room.json` (géométrie et dessin),
   `catalog.ts`, `rules.ts` (en s'appuyant sur `Checker`), `solver.ts` et `proposals.ts`.
2. L'inscrire dans `src/rooms/index.ts`.

Au démarrage, une pièce sans disposition reçoit automatiquement ses propositions de départ.

## Développement

```bash
pnpm install
cp .env.example .env        # ADMIN_PSEUDO / ADMIN_PASSWORD pour le premier compte
pnpm dev                    # API sur :3000, interface sur http://localhost:5173
```

Autres commandes :

| Commande | Rôle |
|---|---|
| `pnpm build` | Compile l'interface (`dist/client`) et le serveur (`dist/server`) |
| `pnpm start` | Lance la version compilée (sert aussi l'interface) |
| `pnpm typecheck` | Vérifie les types |
| `pnpm db:generate` | Génère une migration après modification de `src/server/db/schema.ts` |
| `npx tsx scripts/check-proposals.ts` | Verdict des propositions de chaque pièce |
| `npx tsx scripts/check-solver.ts chambre D` | Lance le solveur sur une proposition |

## Déploiement (Dokploy)

L'image est multi-architecture (`node:24-slim`) et fonctionne sur un VPS ARM64 (Ampere).

1. Dans Dokploy, créer une application à partir du dépôt GitHub, type de build **Dockerfile**.
2. Variables d'environnement : `ADMIN_PSEUDO` et `ADMIN_PASSWORD` (utilisées uniquement au premier
   démarrage, quand la base ne contient aucun utilisateur).
3. Monter un volume sur `/data` : la base SQLite y est stockée (`/data/roomplanner.db`).
4. Port du conteneur : `3000`. Ajouter le domaine avec HTTPS.
5. Sauvegarder régulièrement le volume `/data` (sauvegardes de volumes Dokploy ou copie du fichier).

Variante sans l'interface Dokploy : `docker compose -f docker-compose.prod.yml up -d --build`.

## Reprendre les dispositions de l'ancienne version

1. Dans l'ancienne page, cliquer sur **Exporter tous les onglets** (le texte est copié).
2. Dans roomplanner, connecté en administrateur : carte **Compte** → **Importer l'ancienne version**,
   coller le texte puis **Importer**. Cocher « Remplacer » pour retirer d'abord les propositions de départ.

# roomplanner

Planificateur d'aménagement de pièces : plan à l'échelle, meubles déplaçables, vérification
des dégagements (portes, fenêtres, chaises, armoires…) et solveur qui explore les dispositions possibles.

Première pièce : la chambre de l'appartement Marcadet (11 m², cheminée, renfoncement de 147 cm).

## État actuel : `legacy/`

Version d'origine, une page HTML autonome publiée comme artifact Claude.

| Fichier | Rôle |
|---|---|
| `legacy/solver.js` | Géométrie de la chambre, règles (dégagements confort/minimum, armoire fixée au mur, bureau découpé autour de la cheminée…), évaluation et solveur |
| `legacy/plan.template.html` | Interface : plan SVG, éditeur de meubles, onglets, solveur dans un Web Worker |
| `legacy/build.js` | Injecte `solver.js` dans le template et vérifie la syntaxe : `node legacy/build.js` |
| `legacy/plan-chambre.html` | Page générée, à ouvrir directement dans un navigateur |

Les dispositions sont enregistrées dans le `localStorage` du navigateur (clé `chambre-marcadet-v1`).

## Feuille de route

1. ~~Dépôt avec le code actuel~~
2. Pièces décrites en JSON (`rooms/chambre.json`) et moteur de règles générique, avec tests de non-régression (Vitest)
3. Front Vite + TypeScript avec sélecteur de pièce
4. Serveur Hono : comptes (pseudo + mot de passe, invitations), dispositions persistées, duplication, droits
5. Votes 👍 / 👎 et classement par pièce
6. Docker + Dokploy, SQLite (Drizzle) dans un volume, import des dispositions existantes
7. Ajout du salon

## Stack prévue

pnpm · TypeScript · Vite · Hono · SQLite (better-sqlite3 + Drizzle) · Vitest · Docker / Dokploy

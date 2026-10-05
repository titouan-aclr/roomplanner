// Lance le solveur d'une pièce sur une proposition : npx tsx scripts/check-solver.ts chambre D
import { rooms } from '../src/rooms';

const [roomId = 'chambre', key = 'D'] = process.argv.slice(2);
const room = rooms[roomId];
const base = room.proposals.find((p) => p.key === key)!.layout;
const r = room.solve(base, { allowNotch: true });
console.log(`${r.evaluated} combinaisons, ${r.valid} valides, ${r.ms} ms`);
for (const f of r.families) console.log(f.score, f.freeM2.toFixed(2), f.summary);

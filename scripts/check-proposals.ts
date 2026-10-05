// Vérification rapide : évalue les propositions de chaque pièce et affiche le verdict.
import { rooms } from '../src/rooms';

for (const room of Object.values(rooms)) {
  for (const p of room.proposals) {
    const ev = room.evaluate(p.layout);
    console.log(`${room.data.id} ${p.key} ${ev.ok ? 'OK' : 'KO'} ${ev.freeM2.toFixed(2)} m² ${ev.score}`);
    for (const i of ev.issues) if (i.sev === 'error') console.log('   ', i.msg);
  }
}

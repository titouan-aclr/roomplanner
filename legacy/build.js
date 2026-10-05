const fs = require('fs');
const t = fs.readFileSync(__dirname + '/plan.template.html', 'utf8');
const s = fs.readFileSync(__dirname + '/solver.js', 'utf8');
fs.writeFileSync(__dirname + '/plan-chambre.html', t.replace('/*SOLVER*/', () => s));
// contrôles : syntaxe des scripts + évaluation des propositions
const scripts = [...fs.readFileSync(__dirname + '/plan-chambre.html', 'utf8').matchAll(/<script(?: id="solver")?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((c, i) => { new Function(c); console.log('script', i, 'OK', c.length); });
const S = require('./solver.js');
const P = (face,x,y,w,d,clear,extra) => ({label:'x',face,x,y,w,d,clear,...extra});
const props = {
  A: {bed:P('S',140,52,150,212,0,{sides:50,label:'Lit'}), wardrobe:P('E',0,165,160,60,60,{label:'Armoire'}), desk:P('S',0,0,140,70,90,{label:'Bureau'}), dresser:P('S',294,26,60,40,45,{label:'Commode'})},
  B: {bed:P('E',0,174,150,212,0,{sides:50,label:'Lit'}), wardrobe:P('S',150,52,140,60,60,{label:'Armoire'}), desk:P('S',4,0,140,80,90,{label:'Bureau'}), dresser:P('S',294,26,60,40,45,{label:'Commode'})},
};
for (const [n,l] of Object.entries(props)) { const ev = S.evaluate(l,l); console.log(n, ev.ok, ev.freeM2, ev.bedSides, ev.issues.map(i=>i.sev+': '+i.msg)); }

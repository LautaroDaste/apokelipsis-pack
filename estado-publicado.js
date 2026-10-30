// Recuerda cómo estaban los archivos del pack la última vez que se corrió PUBLICAR MODS.bat,
// para que GitHub Desktop no deje hacer Commit si después se cambió algo sin volver a publicar
// (si no, la lista queda con los sha1 viejos y a los jugadores les sale "archivo corrupto").
//
// - generate-manifest.js llama a guardar() al terminar.
// - El hook pre-commit de Git corre este archivo directamente y frena el commit si algo cambió.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const STAMP = path.join(ROOT, 'herramientas', 'publicado.json');
const IGNORED = /(\.(txt|part|tmp)$)|^(Thumbs\.db|desktop\.ini|\.DS_Store)$/i;

// Todo lo que lee generate-manifest.js (pack.json queda afuera: el .bat le cambia el número de versión).
function inputs() {
  const list = [];
  const walk = (rel) => {
    const dir = path.join(ROOT, rel);
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (!IGNORED.test(entry.name)) list.push(child);
    }
  };
  walk('mods');
  walk('optional');
  walk('files');
  for (const f of ['inicial.zip', 'opciones-predeterminadas.txt', 'descripciones.json', 'optional.json']) {
    if (fs.existsSync(path.join(ROOT, f))) list.push(f);
  }
  walk('launcher');
  return list.filter((p) => !p.startsWith('mods/') || p.endsWith('.jar')).sort();
}

const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

function guardar() {
  const state = {};
  for (const rel of inputs()) {
    const full = path.join(ROOT, rel);
    const stat = fs.statSync(full);
    state[rel] = { sha1: sha1(full), size: stat.size, mtimeMs: stat.mtimeMs };
  }
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });
  fs.writeFileSync(STAMP, JSON.stringify(state, null, 1) + '\n');
}

function comprobar() {
  if (!fs.existsSync(STAMP)) return ['(todavía no se corrió PUBLICAR MODS.bat en esta PC)'];
  const saved = JSON.parse(fs.readFileSync(STAMP, 'utf8'));
  const current = inputs();
  const problems = [];
  for (const rel of current) {
    const before = saved[rel];
    if (!before) {
      problems.push(`+ nuevo:     ${rel}`);
      continue;
    }
    const stat = fs.statSync(path.join(ROOT, rel));
    // Si tamaño y fecha coinciden no hace falta leer el archivo entero.
    if (stat.size === before.size && stat.mtimeMs === before.mtimeMs) continue;
    if (sha1(path.join(ROOT, rel)) !== before.sha1) problems.push(`* cambiado:  ${rel}`);
  }
  for (const rel of Object.keys(saved)) {
    if (!current.includes(rel)) problems.push(`- quitado:   ${rel}`);
  }
  return problems;
}

module.exports = { guardar };

if (require.main === module) {
  const problems = comprobar();
  if (problems.length) {
    console.error('');
    console.error('NO SE PUEDE HACER COMMIT: cambiaste archivos del pack sin correr "PUBLICAR MODS.bat".');
    console.error('');
    for (const p of problems) console.error('  ' + p);
    console.error('');
    console.error('Haz doble clic en "PUBLICAR MODS.bat" y después vuelve a tocar "Commit to main".');
    console.error('(Si no, a los jugadores les sale "el archivo descargado está corrupto".)');
    process.exit(1);
  }
}

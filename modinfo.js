// Lee el fabric.mod.json de dentro de un .jar (sin dependencias externas).
const fs = require('fs');
const zlib = require('zlib');

function readEntry(file, wanted) {
  const buf = fs.readFileSync(file);
  // Fin del directorio central (EOCD).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// Devuelve { id, name, description, environment, depends: [ids], provides: [ids] } o null.
function modInfo(file) {
  try {
    const raw = readEntry(file, 'fabric.mod.json');
    if (!raw) return null;
    // Algunos mods traen saltos de línea dentro de los textos: se limpian antes de parsear.
    const json = JSON.parse(raw.toString('utf8').replace(/^﻿/, '').replace(/[\u0000-\u001F]+/g, ' '));
    return {
      id: json.id,
      name: json.name || json.id,
      description: typeof json.description === 'string' ? json.description : '',
      environment: json.environment || '*',
      depends: Object.keys(json.depends || {}),
      provides: Array.isArray(json.provides) ? json.provides : []
    };
  } catch {
    return null;
  }
}

module.exports = { modInfo };

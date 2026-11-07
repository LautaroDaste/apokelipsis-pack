#!/usr/bin/env node
// Panel de control de Apokelipsis: una página web que corre SOLO en esta PC (127.0.0.1) y edita
// los archivos de la carpeta del repositorio. Se abre con "PANEL DE CONTROL.bat".
//
// Seguridad: escucha solo en 127.0.0.1, cada vez con un puerto y una contraseña al azar (va en la
// dirección que abre el .bat). Sin esa contraseña ninguna otra página puede usar el panel.

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn, exec } = require('child_process');
const { readZip, writeZip } = require('./zip');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(__dirname, 'web');
const GAME = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.apokelipsis');
const KEY_DIR = path.join(os.homedir(), 'apokelipsis-firma');
const KEY_FILE = process.env.APOKELIPSIS_CLAVE || path.join(KEY_DIR, 'clave-privada.pem');
const TRASH = path.join(ROOT, 'herramientas', 'mods-quitados');
const TOKEN = crypto.randomBytes(24).toString('hex');

// ---------- utilidades ----------
const p = (...parts) => path.join(ROOT, ...parts);
const exists = (f) => fs.existsSync(f);
const readText = (f) => fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
const readJson = (f, def) => (exists(f) ? JSON.parse(readText(f)) : def);
const writeJson = (f, data) => fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
const SAFE_JAR = /^[^\\/:*?"<>|\x00-\x1f]{1,200}\.jar$/i;

class UserError extends Error {}
const fail = (msg) => {
  throw new UserError(msg);
};

function inside(base, target) {
  const rel = path.relative(base, target);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: opts.timeout || 180000, env: { ...process.env, ...(opts.env || {}) } },
      (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout || ''}${stderr || ''}`.trim() }));
  });
}

// ---------- pack.json ----------
const packFile = p('pack.json');
const readPack = () => readJson(packFile, {});
const writePack = (pack) => writeJson(packFile, pack);
const manifest = () => readJson(p('manifest.json'), null);

// ---------- información de los .jar (con caché) ----------
const jarCache = new Map();
function jarInfo(full) {
  const st = fs.statSync(full);
  const key = `${full}|${st.size}|${st.mtimeMs}`;
  if (jarCache.has(key)) return jarCache.get(key);
  let info = { id: null, name: null, version: null, environment: '*', description: '', icon: null, lang: {} };
  try {
    const entries = readZip(full);
    const byName = new Map(entries.map((e) => [e.name, e]));
    const fmj = byName.get('fabric.mod.json');
    if (fmj) {
      const json = JSON.parse(fmj.read().toString('utf8').replace(/^\uFEFF/, '').replace(/[\u0000-\u001F]+/g, ' '));
      const icon = typeof json.icon === 'string' ? json.icon : json.icon && typeof json.icon === 'object' ? Object.values(json.icon).pop() : null;
      info = {
        id: json.id,
        name: json.name || json.id,
        version: String(json.version || ''),
        environment: json.environment || '*',
        description: typeof json.description === 'string' ? json.description : '',
        icon: icon && byName.has(icon.replace(/^\//, '')) ? icon.replace(/^\//, '') : null,
        lang: {}
      };
    }
    // Textos de las teclas (para mostrar "Abrir Pokédex" en vez de key.cobblemon...).
    for (const e of entries) {
      const m = /^assets\/[^/]+\/lang\/(es_es|es_ar|es_mx|en_us)\.json$/.exec(e.name);
      if (!m) continue;
      try {
        const data = JSON.parse(e.read().toString('utf8').replace(/^\uFEFF/, ''));
        const lang = m[1] === 'en_us' ? 'en' : 'es';
        for (const [k, v] of Object.entries(data)) {
          if (typeof v !== 'string' || !(k.startsWith('key') || k.includes('key') || k.startsWith('category'))) continue;
          if (lang === 'es' || !info.lang[k]) info.lang[k] = v;
        }
      } catch {}
    }
  } catch {}
  jarCache.set(key, info);
  return info;
}

function listJars(dir) {
  return exists(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.jar')).sort((a, b) => a.localeCompare(b)) : [];
}

// ---------- API ----------
const api = {};

api['GET /estado'] = async () => {
  const pack = readPack();
  const man = manifest();
  const pub = require('../estado-publicado');
  let pendientes = [];
  try {
    pendientes = pub.comprobar();
  } catch {}
  return {
    servidor: pack.server || {},
    packVersion: pack.packVersion,
    minecraft: pack.minecraft,
    fabric: pack.fabricLoader,
    launcher: pack.launcher?.version || null,
    reinicio: Number.isInteger(pack.reinicioConfig) ? pack.reinicioConfig : 0,
    reinicioPublicado: man?.resetVersion || 0,
    mods: man ? { obligatorios: man.mods.length, opcionales: man.optional.length, archivos: (man.files || []).length } : null,
    totalJars: listJars(p('mods')).length,
    pendientes,
    ...(await publicador.estadoLocal()),
    clave: claveEstado(),
    juego: exists(path.join(GAME, 'options.txt')),
    carpeta: ROOT
  };
};

// Mods
api['GET /mods'] = async () => {
  const man = manifest();
  const required = new Set((man?.mods || []).map((m) => m.file));
  const optional = new Set((man?.optional || []).map((m) => m.file));
  const published = readJson(p('herramientas', 'publicado.json'), {});
  return listJars(p('mods')).map((file) => {
    const full = p('mods', file);
    const info = jarInfo(full);
    const estado = required.has(file) ? 'obligatorio'
      : optional.has(file) ? 'opcional'
      : published[`mods/${file}`] ? 'servidor'
      : 'nuevo';
    return { file, size: fs.statSync(full).size, id: info.id, name: info.name || file, version: info.version, description: info.description, environment: info.environment, icon: !!info.icon, estado };
  });
};

api['GET /mods/icono'] = async (q, req, res) => {
  const file = q.get('file');
  if (!SAFE_JAR.test(file || '') || !exists(p('mods', file))) fail('no existe');
  const info = jarInfo(p('mods', file));
  const entry = info.icon && readZip(p('mods', file)).find((e) => e.name === info.icon);
  if (!entry) fail('sin icono');
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
  res.end(entry.read());
  return undefined;
};

api['POST /mods/subir'] = async (q, req, res, body) => {
  const name = path.basename(q.get('nombre') || '');
  if (!SAFE_JAR.test(name)) fail('El archivo tiene que ser un .jar');
  if (!body.length) fail('El archivo está vacío');
  let entries;
  try {
    entries = readZip(body);
  } catch {
    fail(`${name} no es un .jar válido (¿se descargó entero?)`);
  }
  const fmj = entries.find((e) => e.name === 'fabric.mod.json');
  if (!fmj) fail(`${name} no es un mod de Fabric. Este servidor solo usa mods de Fabric para Minecraft ${readPack().minecraft}.`);
  const tmp = p('mods', name + '.subiendo');
  await fsp.writeFile(tmp, body);
  const target = p('mods', name);
  await fsp.rm(target, { force: true });
  await fsp.rename(tmp, target);
  const info = jarInfo(target);
  // ¿Hay otra versión del mismo mod? (mismo id, otro archivo)
  const otros = listJars(p('mods')).filter((f) => f !== name && jarInfo(p('mods', f)).id === info.id && info.id);
  return { ok: true, file: name, name: info.name, id: info.id, otros };
};

api['POST /mods/quitar'] = async (q, req, res, body) => {
  const { files } = JSON.parse(body);
  await fsp.mkdir(TRASH, { recursive: true });
  for (const file of files || []) {
    if (!SAFE_JAR.test(file) || !exists(p('mods', file))) continue;
    await fsp.rm(path.join(TRASH, file), { force: true });
    await fsp.rename(p('mods', file), path.join(TRASH, file));
  }
  return { ok: true };
};

api['GET /mods/quitados'] = async () =>
  listJars(TRASH).map((file) => ({ file, name: jarInfo(path.join(TRASH, file)).name || file, fecha: fs.statSync(path.join(TRASH, file)).mtimeMs }));

api['POST /mods/restaurar'] = async (q, req, res, body) => {
  const { file } = JSON.parse(body);
  if (!SAFE_JAR.test(file) || !exists(path.join(TRASH, file))) fail('No está en la papelera');
  await fsp.rename(path.join(TRASH, file), p('mods', file));
  return { ok: true };
};

// Mods opcionales
const PROTECTED_REQUIRED = ['apokelipsis', 'customskinloader'];
api['GET /opcionales'] = async () => {
  const man = manifest();
  const desc = readJson(p('descripciones.json'), {});
  const pack = readPack();
  const meta = (id) => (typeof desc[id] === 'string' ? { descripcion: desc[id] } : desc[id] || {});
  const forced = (pack.requiredClient || []).filter((id) => !PROTECTED_REQUIRED.includes(id));
  const byId = new Map();
  for (const f of listJars(p('mods'))) {
    const i = jarInfo(p('mods', f));
    if (i.id) byId.set(i.id, { file: f, ...i });
  }
  return {
    publicado: !!man,
    opcionales: (man?.optional || []).map((o) => ({
      id: o.id,
      file: o.file,
      nombre: meta(o.id).nombre || '',
      nombreOriginal: byId.get(o.id)?.name || o.name,
      descripcion: meta(o.id).descripcion || '',
      descripcionOriginal: byId.get(o.id)?.description || '',
      activado: meta(o.id).activado !== false,
      requiere: o.requires || [],
      icon: byId.get(o.id) ? byId.get(o.id).file : null
    })),
    forzados: forced.map((id) => ({ id, nombre: byId.get(id)?.name || id }))
  };
};

api['POST /opcionales'] = async (q, req, res, body) => {
  const { opcionales = [], forzados } = JSON.parse(body);
  const desc = readJson(p('descripciones.json'), {});
  for (const o of opcionales) {
    if (typeof o.id !== 'string' || !/^[A-Za-z0-9._+-]{1,128}$/.test(o.id)) continue;
    const nombre = String(o.nombre || '').trim().slice(0, 60);
    const descripcion = String(o.descripcion || '').trim().slice(0, 300);
    const activado = o.activado !== false;
    if (!nombre && activado) {
      if (descripcion) desc[o.id] = descripcion;
      else delete desc[o.id];
    } else {
      desc[o.id] = { ...(nombre ? { nombre } : {}), ...(descripcion ? { descripcion } : {}), activado };
    }
  }
  const sorted = Object.fromEntries(Object.keys(desc).sort().map((k) => [k, desc[k]]));
  writeJson(p('descripciones.json'), sorted);
  if (Array.isArray(forzados)) {
    const pack = readPack();
    const ids = forzados.filter((id) => typeof id === 'string' && /^[A-Za-z0-9._+-]{1,128}$/.test(id));
    pack.requiredClient = [...new Set([...PROTECTED_REQUIRED.filter((id) => (pack.requiredClient || []).includes(id)), ...ids])];
    writePack(pack);
  }
  return { ok: true };
};

// Menú del juego (frases amarillas y servidor)
const FRASES = p('files', 'config', 'apokelipsis', 'frases.json');
api['GET /menu'] = async () => {
  const pack = readPack();
  return { frases: readJson(FRASES, { frases: [] }).frases || [], nombre: pack.server?.name || '', direccion: pack.server?.address || '' };
};
api['POST /menu'] = async (q, req, res, body) => {
  const { frases, nombre, direccion } = JSON.parse(body);
  const clean = (Array.isArray(frases) ? frases : []).map((s) => String(s).trim()).filter(Boolean).map((s) => s.slice(0, 80));
  await fsp.mkdir(path.dirname(FRASES), { recursive: true });
  writeJson(FRASES, { frases: clean });
  const pack = readPack();
  pack.server = { ...(pack.server || {}), name: String(nombre || '').trim().slice(0, 60) || 'Apokelipsis', address: String(direccion || '').trim().slice(0, 120) };
  writePack(pack);
  return { ok: true };
};

// Opciones predeterminadas (options.txt)
const OPTIONS = p('opciones-predeterminadas.txt');
const parseOptions = (text) =>
  text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.indexOf(':') > 0).map((l) => {
    const i = l.indexOf(':');
    return { clave: l.slice(0, i).trim(), valor: l.slice(i + 1).trim() };
  });
api['GET /opciones'] = async () => ({ lineas: exists(OPTIONS) ? parseOptions(readText(OPTIONS)) : [] });
api['GET /opciones/juego'] = async () => {
  const f = path.join(GAME, 'options.txt');
  if (!exists(f)) fail('No encontré tu juego (abre Apokelipsis con el launcher al menos una vez en esta PC).');
  return { lineas: parseOptions(readText(f)), ruta: f };
};
api['POST /opciones'] = async (q, req, res, body) => {
  const { lineas } = JSON.parse(body);
  const out = [];
  for (const l of lineas || []) {
    const clave = String(l.clave || '').trim();
    const valor = String(l.valor ?? '').trim();
    if (!/^[A-Za-z0-9_.\-]{1,128}$/.test(clave) || /[\r\n]/.test(valor)) continue;
    out.push(`${clave}:${valor}`);
  }
  fs.writeFileSync(OPTIONS, out.join('\n') + '\n');
  return { ok: true, total: out.length };
};

// Textos de las teclas de los mods
let traduccionesCache = null;
api['GET /traducciones'] = async () => {
  if (traduccionesCache) return traduccionesCache;
  const textos = {};
  const mods = {};
  for (const f of listJars(p('mods'))) {
    const info = jarInfo(p('mods', f));
    for (const [k, v] of Object.entries(info.lang)) {
      if (!textos[k]) {
        textos[k] = v;
        mods[k] = info.name || f;
      }
    }
  }
  traduccionesCache = { textos, mods };
  return traduccionesCache;
};

// Fondo del menú (para la vista previa)
api['GET /panorama'] = async (q, req, res) => {
  const i = Number(q.get('i') || 0);
  const f = p('files', 'config', 'apokelipsis', `panorama_${Number.isInteger(i) && i >= 0 && i < 6 ? i : 0}.png`);
  if (!exists(f)) fail('sin fondo');
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=600' });
  res.end(fs.readFileSync(f));
  return undefined;
};

// Packs de texturas disponibles
api['GET /packs'] = async () => {
  const dir = p('files', 'resourcepacks');
  return { archivos: exists(dir) ? fs.readdirSync(dir).filter((f) => /\.zip$/i.test(f) || fs.statSync(path.join(dir, f)).isDirectory()).sort() : [] };
};

// Configs de mods (inicial.zip)
const INICIAL = p('inicial.zip');
const CONFIG_DIRS = ['config', 'defaultconfigs'];
const IGNORE_CONFIG = /(^|\/)(apokelipsis\.json|apokelipsis\/|.*\.(log|bak|old|lock|tmp)$)/i;
function gameConfigFiles() {
  const out = [];
  const walk = (rel, depth) => {
    const dir = path.join(GAME, ...rel.split('/'));
    if (!exists(dir) || depth > 6) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (IGNORE_CONFIG.test(r)) continue;
      if (e.isDirectory()) walk(r, depth + 1);
      else if (e.isFile()) {
        const size = fs.statSync(path.join(dir, e.name)).size;
        if (size <= 4 * 1024 * 1024) out.push({ ruta: r, tamano: size });
      }
    }
  };
  CONFIG_DIRS.forEach((d) => walk(d, 0));
  return out;
}
const safeRel = (r) => typeof r === 'string' && CONFIG_DIRS.some((d) => r.startsWith(d + '/')) && !r.split('/').some((s) => !s || s === '..' || s.includes(':') || s.includes('\\'));

api['GET /inicial'] = async () => {
  const zip = exists(INICIAL) ? readZip(INICIAL) : [];
  const inZip = new Map(zip.map((e) => [e.name, e]));
  const juego = gameConfigFiles().map((f) => {
    const z = inZip.get(f.ruta);
    let igual = null;
    if (z) igual = z.read().equals(fs.readFileSync(path.join(GAME, ...f.ruta.split('/'))));
    return { ...f, enZip: !!z, igual };
  });
  return {
    zip: zip.map((e) => ({ ruta: e.name, tamano: e.size, enJuego: juego.some((j) => j.ruta === e.name) })),
    juego,
    hayJuego: exists(GAME)
  };
};

api['POST /inicial'] = async (q, req, res, body) => {
  const { archivos } = JSON.parse(body);
  const zip = exists(INICIAL) ? new Map(readZip(INICIAL).map((e) => [e.name, e])) : new Map();
  const files = [];
  const seen = new Set();
  for (const a of archivos || []) {
    if (!safeRel(a.ruta) || seen.has(a.ruta.toLowerCase())) continue;
    seen.add(a.ruta.toLowerCase());
    if (a.desde === 'juego') {
      const full = path.join(GAME, ...a.ruta.split('/'));
      if (!inside(GAME, full) || !exists(full)) continue;
      files.push({ name: a.ruta, data: fs.readFileSync(full) });
    } else if (zip.has(a.ruta)) {
      files.push({ name: a.ruta, data: zip.get(a.ruta).read() });
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  if (exists(INICIAL)) await fsp.copyFile(INICIAL, p('herramientas', 'inicial-anterior.zip'));
  await fsp.writeFile(INICIAL, writeZip(files));
  return { ok: true, total: files.length };
};

// Reinicio de configuración para todos los jugadores
api['POST /reiniciar'] = async () => {
  const pack = readPack();
  const man = manifest();
  const published = man?.resetVersion || 0;
  // Siempre uno más que lo publicado: pulsar dos veces antes de publicar no pide dos reinicios.
  pack.reinicioConfig = published + 1;
  writePack(pack);
  return { ok: true, reinicio: pack.reinicioConfig };
};
api['POST /reiniciar/cancelar'] = async () => {
  const pack = readPack();
  pack.reinicioConfig = manifest()?.resetVersion || 0;
  writePack(pack);
  return { ok: true };
};

// Clave de firma
function claveEstado() {
  const autorizadas = readJson(path.join(__dirname, 'claves-autorizadas.json'), { claves: [] }).claves.map((c) => c.clave.trim());
  if (!exists(KEY_FILE)) return { existe: false, autorizada: false, ruta: KEY_FILE };
  try {
    const pub = crypto.createPublicKey(fs.readFileSync(KEY_FILE, 'utf8')).export({ type: 'spki', format: 'pem' }).toString().trim();
    return { existe: true, publica: pub, autorizada: autorizadas.includes(pub), ruta: KEY_FILE };
  } catch {
    return { existe: true, error: 'La clave existe pero no se pudo leer', autorizada: false, ruta: KEY_FILE };
  }
}
api['GET /clave'] = async () => ({ ...claveEstado(), autorizadas: readJson(path.join(__dirname, 'claves-autorizadas.json'), { claves: [] }).claves });
api['POST /clave/crear'] = async () => {
  if (exists(KEY_FILE)) fail('Esta PC ya tiene una clave. No se crea otra para no perder la actual.');
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  await fsp.mkdir(path.dirname(KEY_FILE), { recursive: true });
  await fsp.writeFile(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  return claveEstado();
};

// Publicar en un solo paso (traer, launcher, lista firmada, commit y push): ver publicar.js
const publicador = require('./publicar')({ ROOT, KEY_DIR, TRASH, run, readJson, readPack, writePack, claveEstado, UserError });
Object.assign(api, publicador.api);

api['POST /abrir'] = async (q, req, res, body) => {
  const { que } = JSON.parse(body);
  if (que === 'desktop') {
    const bin = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktop', 'bin', 'github.bat');
    if (exists(bin)) {
      spawn('cmd.exe', ['/c', bin, ROOT], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return { ok: true };
    }
    fail('No encontré GitHub Desktop en esta PC.');
  }
  const target = { repo: ROOT, mods: p('mods'), juego: GAME, packs: p('files', 'resourcepacks') }[que];
  if (!target || !exists(target)) fail('No existe esa carpeta');
  spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true };
};

// ---------- servidor HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new UserError('El archivo es demasiado grande'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const port = server.address().port;
  // Solo se atiende a 127.0.0.1:<puerto> (evita que una página web engañe al navegador con otro nombre).
  if (req.headers.host !== `127.0.0.1:${port}`) {
    res.writeHead(403).end();
    return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const security = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

  if (url.pathname.startsWith('/api/')) {
    const tokenOk = req.headers['x-token'] === TOKEN || (req.method === 'GET' && url.searchParams.get('t') === TOKEN);
    if (!tokenOk) {
      res.writeHead(401, security).end();
      return;
    }
    const handler = api[`${req.method} ${url.pathname.slice(4)}`];
    if (!handler) {
      res.writeHead(404, security).end();
      return;
    }
    try {
      const body = req.method === 'POST' ? await readBody(req, url.pathname === '/api/mods/subir' ? 400 * 1024 * 1024 : 4 * 1024 * 1024) : Buffer.alloc(0);
      const result = await handler(url.searchParams, req, res, url.pathname === '/api/mods/subir' ? body : body.toString('utf8'));
      if (result === undefined) return;
      res.writeHead(200, { ...security, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (!(err instanceof UserError)) console.error(err);
      if (!res.headersSent) res.writeHead(err instanceof UserError ? 400 : 500, { ...security, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Archivos de la página
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(WEB, rel);
  if (!inside(WEB, file) || !exists(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, security).end();
    return;
  }
  res.writeHead(200, {
    ...security,
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/#${TOKEN}`;
  console.log('');
  console.log('  Panel de control de APOKELIPSIS abierto en tu navegador.');
  console.log('  Si no se abrió, copia esta dirección en el navegador:');
  console.log('  ' + url);
  console.log('');
  console.log('  No cierres esta ventana mientras uses el panel. Para terminar, ciérrala.');
  if (!process.argv.includes('--sin-navegador')) exec(`start "" "${url}"`);
  if (process.env.PANEL_URL_FILE) fs.writeFileSync(process.env.PANEL_URL_FILE, url);
});

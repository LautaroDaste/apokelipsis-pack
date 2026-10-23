#!/usr/bin/env node
// Genera manifest.json a partir de:
//   pack.json      -> versión de Minecraft/Fabric, datos del servidor, URL base del repo
//                     y "clientMods": slugs de Modrinth obligatorios solo en el cliente
//   mods/          -> los mods del modpack. Se clasifican solos:
//                       - solo servidor  -> no se instalan en los jugadores
//                       - solo cliente   -> opcionales (el jugador puede apagarlos), salvo que
//                                           un mod obligatorio los necesite o estén en "requiredClient"
//                       - ambos lados    -> obligatorios
//   optional.json  -> mods opcionales extra fuera del modpack (normalmente vacío)
//
// Los mods que existen en Modrinth se descargan desde Modrinth; el resto desde tu repo (baseUrl).
// Uso: node generate-manifest.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { modInfo } = require('./modinfo');

const ROOT = __dirname;
const UA = 'apokelipsis-pack-tool/1.0';
const MODRINTH = 'https://api.modrinth.com/v2';

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^﻿/, ''));
const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
const jarsIn = (dir) =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.jar')).sort()
    : [];

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!res.ok) throw new Error(`Modrinth respondió ${res.status} para ${url}`);
  return res.json();
}

// Describe jars locales y busca en Modrinth cuáles están publicados allí (por sha1).
async function describeLocal(dir, baseUrl) {
  const entries = jarsIn(dir).map((file) => {
    const full = path.join(ROOT, dir, file);
    return { file, sha1: sha1(full), size: fs.statSync(full).size };
  });
  let found = {};
  if (entries.length) {
    found = await api(`${MODRINTH}/version_files`, {
      method: 'POST',
      body: JSON.stringify({ hashes: entries.map((e) => e.sha1), algorithm: 'sha1' })
    });
  }
  return entries.map((e) => {
    const version = found[e.sha1];
    const remote = version?.files.find((f) => f.hashes.sha1 === e.sha1);
    return {
      ...e,
      url: remote ? remote.url : `${baseUrl}/${dir}/${encodeURIComponent(e.file)}`,
      projectId: version?.project_id,
      deps: (version?.dependencies || [])
        .filter((d) => d.dependency_type === 'required' && d.project_id)
        .map((d) => d.project_id)
    };
  });
}

async function resolveModrinth(slug, pack) {
  const params = new URLSearchParams({
    loaders: JSON.stringify(['fabric']),
    game_versions: JSON.stringify([pack.minecraft])
  });
  const versions = await api(`${MODRINTH}/project/${slug}/version?${params}`);
  // Siempre la más nueva (aunque sea beta): así las versiones de mods relacionados
  // (por ejemplo Iris y Sodium) coinciden entre sí.
  const version = versions[0];
  if (!version) throw new Error(`"${slug}" no tiene versión para Fabric ${pack.minecraft}`);
  const file = version.files.find((f) => f.primary) || version.files[0];
  return {
    file: file.filename,
    url: file.url,
    sha1: file.hashes.sha1,
    size: file.size,
    projectId: version.project_id,
    deps: version.dependencies
      .filter((d) => d.dependency_type === 'required' && d.project_id)
      .map((d) => d.project_id)
  };
}

async function main() {
  const pack = readJson('pack.json');
  const baseUrl = pack.baseUrl.replace(/\/$/, '');
  const optionalDefs = fs.existsSync(path.join(ROOT, 'optional.json')) ? readJson('optional.json') : [];

  console.log('Analizando los mods del modpack...');
  const local = await describeLocal('mods', baseUrl);

  // Lado de cada mod: el fabric.mod.json manda; si dice "*", se usa lo que indica Modrinth.
  const projectIds = [...new Set(local.map((m) => m.projectId).filter(Boolean))];
  const projects = projectIds.length
    ? await api(`${MODRINTH}/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`)
    : [];
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const provider = new Map();
  for (const m of local) {
    m.info = modInfo(path.join(ROOT, 'mods', m.file));
    const p = projectById.get(m.projectId);
    const env = m.info?.environment || '*';
    m.side = env === 'client' ? 'client'
      : env === 'server' ? 'server'
      : p?.client_side === 'unsupported' ? 'server'
      : p?.server_side === 'unsupported' ? 'client'
      : 'both';
    m.title = p?.title || m.info?.name || m.file;
    m.text = (p?.description || m.info?.description || '').trim();
    if (m.info) [m.info.id, ...m.info.provides].forEach((id) => provider.set(id, m));
  }
  const depsOf = (m) => (m.info?.depends || []).map((id) => provider.get(id)).filter((d) => d && d !== m);
  const forced = new Set(pack.requiredClient || []);

  // 1) Los mods solo de servidor no se instalan, salvo que un mod del cliente los necesite.
  const kept = new Set(local.filter((m) => m.side !== 'server'));
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of [...kept]) for (const d of depsOf(m)) if (!kept.has(d)) { kept.add(d); changed = true; }
  }
  // 2) Obligatorios: los de ambos lados (y los forzados en pack.json), más lo que ellos necesiten.
  const required = new Set([...kept].filter((m) => m.side !== 'client' || forced.has(m.info?.id)));
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of [...required]) for (const d of depsOf(m)) if (!required.has(d)) { required.add(d); changed = true; }
  }
  // 3) Opcionales: los mods solo de cliente que nadie obligatorio necesita (por ejemplo Punchy).
  const optionalMods = [...kept].filter((m) => !required.has(m));
  const optionalId = (m) => m.info?.id || m.file;

  const mods = local.filter((m) => required.has(m));
  for (const slug of pack.clientMods || []) {
    const info = await resolveModrinth(slug, pack);
    if (!mods.some((m) => m.projectId === info.projectId)) mods.push(info);
    console.log(`  ${slug} (cliente): ${info.file}`);
  }
  // Descripciones en español (descripciones.json, por id del mod). Si falta, se usa la original.
  const spanish = fs.existsSync(path.join(ROOT, 'descripciones.json')) ? readJson('descripciones.json') : {};
  const optional = optionalMods
    .map((m) => ({
      id: optionalId(m),
      name: m.title,
      description: spanish[optionalId(m)] || (m.text.length > 120 ? m.text.slice(0, 117) + '...' : m.text),
      default: true,
      requires: depsOf(m).filter((d) => optionalMods.includes(d)).map(optionalId),
      file: m.file,
      url: m.url,
      sha1: m.sha1,
      size: m.size
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const skipped = local.filter((m) => !kept.has(m));
  console.log(`  ${mods.length} obligatorios, ${optional.length} opcionales (solo cliente), ${skipped.length} solo servidor (no se instalan)`);
  console.log('  Solo servidor: ' + skipped.map((m) => m.title).join(', '));
  console.log('  Opcionales: ' + optional.map((m) => m.name).join(', '));
  const untranslated = optional.filter((o) => !spanish[o.id]);
  if (untranslated.length) {
    console.warn('  AVISO: sin descripción en español (agrégalas en descripciones.json): ' + untranslated.map((o) => o.id).join(', '));
  }

  // Mods opcionales extra fuera del modpack (optional.json); normalmente vacío.
  const localOptional = new Map((await describeLocal('optional', baseUrl)).map((e) => [e.file, e]));
  for (const def of optionalDefs) {
    let info;
    if (def.modrinth) info = await resolveModrinth(def.modrinth, pack);
    else if (def.file && localOptional.has(def.file)) info = localOptional.get(def.file);
    else throw new Error(`El opcional "${def.id}" necesita "modrinth" o un "file" existente en optional/`);
    // Si el modpack ya lo trae como obligatorio, no tiene sentido ofrecerlo como opcional.
    if (mods.some((m) => (info.projectId && m.projectId === info.projectId) || m.file === info.file)) {
      console.log(`  ${def.name || def.id}: ya está en los obligatorios, se omite`);
      continue;
    }
    optional.push({ ...def, ...info });
    console.log(`  ${def.name || def.id}: ${info.file}`);
  }

  // Avisa de dependencias que no estén en el pack.
  const present = new Set([...mods, ...optional].map((m) => m.projectId).filter(Boolean));
  const missingDeps = [...mods, ...optional].flatMap((mod) =>
    (mod.deps || []).filter((dep) => !present.has(dep)).map((dep) => ({ mod, dep }))
  );
  if (missingDeps.length) {
    const ids = [...new Set(missingDeps.map((m) => m.dep))];
    const projects = await api(`${MODRINTH}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`);
    const names = new Map(projects.map((p) => [p.id, p.title]));
    for (const { mod, dep } of missingDeps) {
      console.warn(`  AVISO: ${mod.file} necesita "${names.get(dep) || dep}", que no está en el pack`);
    }
  }

  // Opciones de Minecraft que vienen por defecto (mismo formato que options.txt).
  const optionsFile = path.join(ROOT, 'opciones-predeterminadas.txt');
  const defaultOptions = {};
  if (fs.existsSync(optionsFile)) {
    for (const line of fs.readFileSync(optionsFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) defaultOptions[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }

  // Archivos extra: todo lo que haya en files/ se copia a la carpeta del juego con la misma ruta
  // (por ejemplo files/resourcepacks/x.zip -> resourcepacks/x.zip). Los que estén en Modrinth
  // (packs de texturas, shaders) se descargan desde allí.
  console.log('Analizando archivos extra...');
  const files = [];
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, relPath);
      else if (!entry.name.endsWith('.txt')) {
        files.push({
          path: relPath,
          url: `${baseUrl}/files/${relPath.split('/').map(encodeURIComponent).join('/')}`,
          sha1: sha1(full),
          size: fs.statSync(full).size
        });
      }
    }
  };
  walk(path.join(ROOT, 'files'), '');
  if (files.length) {
    const found = await api(`${MODRINTH}/version_files`, {
      method: 'POST',
      body: JSON.stringify({ hashes: files.map((f) => f.sha1), algorithm: 'sha1' })
    });
    for (const f of files) {
      const remote = found[f.sha1]?.files.find((x) => x.hashes.sha1 === f.sha1);
      if (remote) f.url = remote.url;
    }
  }

  // Configuración inicial: inicial.zip se descomprime en la carpeta del juego la primera vez
  // (solo crea los archivos que falten; nunca pisa lo que el jugador ya tiene).
  let initial = null;
  const initialFile = path.join(ROOT, 'inicial.zip');
  if (fs.existsSync(initialFile)) {
    initial = { url: `${baseUrl}/inicial.zip`, sha1: sha1(initialFile), size: fs.statSync(initialFile).size };
  }

  const clean = ({ projectId, deps, modrinth, ...rest }) => rest;
  const manifest = {
    packVersion: pack.packVersion,
    minecraft: pack.minecraft,
    fabricLoader: pack.fabricLoader,
    server: pack.server,
    defaultOptions,
    mods: mods.map(clean),
    optional: optional.map(clean),
    files,
    initial
  };
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const hosted = [...mods, ...optional, ...files, ...(initial ? [initial] : [])].filter((m) => m.url.startsWith(baseUrl));
  console.log(`\nmanifest.json generado: ${mods.length} obligatorios, ${optional.length} opcionales, ${files.length} archivos extra.`);
  if (hosted.length) {
    console.log('Estos archivos no están en Modrinth y deben subirse al repo junto al manifest:');
    hosted.forEach((m) => console.log(`  - ${decodeURIComponent(m.url.slice(baseUrl.length + 1))}  (${(m.size / 1048576).toFixed(1)} MB)`));
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

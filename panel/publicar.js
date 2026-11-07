// Publicar en un solo paso (botón «Guardar y publicar» del panel):
//   1. trae lo que hayan publicado otros administradores (y baja los mods que falten en esta PC),
//   2. si hay un launcher nuevo en launcher/version.json, lo sube a GitHub Releases,
//   3. genera y firma la lista (generate-manifest.js),
//   4. hace commit y push.
// Para hablar con GitHub usa una llave (token) que se guarda cifrada con el usuario de Windows,
// fuera de OneDrive, junto a la clave de firma.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

module.exports = function crearPublicador(ctx) {
  const { ROOT, KEY_DIR, TRASH, run, readJson, readPack, writePack, claveEstado, UserError } = ctx;
  const p = (...a) => path.join(ROOT, ...a);
  const exists = (f) => fs.existsSync(f);
  const TOKEN_FILE = path.join(KEY_DIR, 'github-token.dat');
  const fail = (m) => {
    throw new UserError(m);
  };

  // ---------- Git ----------
  let gitPath;
  function findGit() {
    if (gitPath !== undefined) return gitPath;
    const candidates = [];
    for (const dir of (process.env.PATH || '').split(path.delimiter)) candidates.push(path.join(dir, 'git.exe'));
    const desktop = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktop');
    if (exists(desktop)) {
      for (const app of fs.readdirSync(desktop).filter((d) => d.startsWith('app-')).sort().reverse()) {
        candidates.push(path.join(desktop, app, 'resources', 'app', 'git', 'cmd', 'git.exe'));
      }
    }
    candidates.push('C:\\Program Files\\Git\\cmd\\git.exe');
    gitPath = candidates.find((c) => exists(c)) || null;
    return gitPath;
  }
  const hayGit = () => !!findGit() && exists(p('.git'));
  const git = (args, opts = {}) => run(findGit(), args, { ...opts, env: { GIT_TERMINAL_PROMPT: '0', ...(opts.env || {}) } });
  async function gitOk(args, msg, opts) {
    const r = await git(args, opts);
    if (r.code !== 0) throw new Error(`${msg}\n${r.out}`);
    return r.out;
  }
  async function count(range) {
    const r = await git(['rev-list', '--count', range]);
    return r.code === 0 ? Number(r.out) || 0 : 0;
  }
  async function jsonAt(rev, file) {
    const r = await git(['show', `${rev}:${file}`]);
    try {
      return r.code === 0 ? JSON.parse(r.out.replace(/^\uFEFF/, '')) : null;
    } catch {
      return null;
    }
  }

  // ---------- Llave de GitHub (cifrada con DPAPI de Windows) ----------
  function powershell(script, input) {
    return new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
      let out = '';
      let err = '';
      ps.stdout.on('data', (d) => (out += d));
      ps.stderr.on('data', (d) => (err += d));
      ps.on('error', reject);
      ps.on('close', (c) => (c === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || 'PowerShell falló'))));
      ps.stdin.end(input);
    });
  }
  let tokenCache = null;
  async function getToken() {
    if (tokenCache) return tokenCache;
    if (!exists(TOKEN_FILE)) return null;
    try {
      tokenCache = await powershell(
        '$e=[Console]::In.ReadToEnd().Trim(); $s=ConvertTo-SecureString -String $e; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))',
        fs.readFileSync(TOKEN_FILE, 'utf8')
      );
      return tokenCache || null;
    } catch {
      return null;
    }
  }
  async function saveToken(token) {
    const enc = await powershell('$t=[Console]::In.ReadToEnd().Trim(); ConvertTo-SecureString -String $t -AsPlainText -Force | ConvertFrom-SecureString', token);
    await fsp.mkdir(KEY_DIR, { recursive: true });
    await fsp.writeFile(TOKEN_FILE, enc);
    tokenCache = token;
  }

  async function gh(url, { method = 'GET', body, raw, headers = {}, token } = {}) {
    token = token || (await getToken());
    if (!token) fail('El panel todavía no está conectado con GitHub (pestaña «Publicar»).');
    const res = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'apokelipsis-panel',
        ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: raw ? body : body ? JSON.stringify(body) : undefined
    });
    if (res.status === 404 && method === 'GET') return null;
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 401) fail('GitHub rechazó la llave (puede haber vencido). Vuelve a conectarla en la pestaña «Publicar».');
    if (!res.ok) throw new Error(`GitHub respondió ${res.status}: ${data?.message || ''}`);
    return data;
  }

  async function repoInfo() {
    let url = hayGit() ? (await git(['remote', 'get-url', 'origin'])).out : '';
    let m = /github\.com[/:]([^/]+)\/([^/\s]+?)(\.git)?$/.exec(url.trim());
    if (!m) m = /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//.exec(readPack().baseUrl || '');
    if (!m) fail('No sé cuál es el repositorio de GitHub de esta carpeta.');
    return { owner: m[1], repo: m[2] };
  }

  async function authEnv() {
    const token = await getToken();
    if (!token) return {};
    // El token va como cabecera solo para github.com (no queda guardado en la configuración de Git).
    return {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic ' + Buffer.from(`x-access-token:${token}`).toString('base64')
    };
  }

  // ---------- Trabajo en segundo plano (la página va mostrando el progreso) ----------
  let job = null;
  const fase = (t) => {
    job.fase = t;
    job.log.push('▶ ' + t);
  };
  const log = (t) => {
    if (t) job.log.push(...String(t).split(/\r?\n/).filter((l) => l.trim()));
  };
  function start(modo) {
    if (job && !job.done) fail('Ya se está publicando, espera a que termine.');
    job = { modo, fase: 'Empezando...', log: [], done: false, ok: false, inicio: Date.now() };
    (async () => {
      try {
        if (modo === 'traer') await traer();
        else await publicar();
        job.ok = true;
      } catch (err) {
        job.error = err.message.split('\n')[0];
        log(err.message);
      } finally {
        job.done = true;
      }
    })();
    return job;
  }

  // ---------- 1. Traer lo de otros administradores ----------
  const GENERATED = ['manifest.json', 'manifest.sig', '.gitignore'];
  async function traer() {
    if (!hayGit()) fail('Esta carpeta no está conectada con GitHub, o falta GitHub Desktop en esta PC.');
    fase('Revisando GitHub');
    await gitOk(['fetch', '--quiet'], 'No se pudo conectar con GitHub. Revisa tu internet.', { env: await authEnv(), timeout: 120000 });

    // Un intento anterior que no se llegó a subir: se deshace el commit (los cambios siguen en la carpeta).
    if ((await count('@{u}..HEAD')) > 0) {
      const base = (await gitOk(['merge-base', 'HEAD', '@{u}'], 'Git no encuentra el punto en común')).trim();
      await gitOk(['reset', '--quiet', base], 'No se pudo deshacer el intento anterior');
      log('Se retomó una publicación anterior que no se había llegado a subir.');
    }
    // Lo que genera el panel se vuelve a generar al final: así nunca choca con lo de otros.
    const tracked = (await git(['ls-files', '--', ...GENERATED])).out.split('\n').filter(Boolean);
    if (tracked.length) await git(['checkout', 'HEAD', '--', ...tracked]);
    const basePack = await jsonAt('HEAD', 'pack.json');
    const localPack = readPack();
    const oldMan = await jsonAt('HEAD', 'manifest.json');

    const behind = await count('HEAD..@{u}');
    if (behind > 0) {
      fase(`Trayendo ${behind} cambio(s) de otros administradores`);
      // pack.json se junta campo por campo (si no, Git lo marca como conflicto por cualquier cosa).
      await git(['checkout', 'HEAD', '--', 'pack.json']);
      const r = await git(['pull', '--rebase', '--autostash', '--quiet'], { env: await authEnv(), timeout: 300000 });
      if (r.code !== 0) {
        writePack(localPack);
        throw new Error(`Otro administrador cambió lo mismo que tú y no se pudieron juntar los cambios. Abre GitHub Desktop para resolverlo (o pásale este mensaje a Claude).\n${r.out}`);
      }
      const remotePack = readPack();
      const merged = { ...remotePack };
      for (const k of new Set([...Object.keys(localPack), ...Object.keys(basePack || {})])) {
        if (k === 'packVersion') continue;
        const changedHere = JSON.stringify(localPack[k]) !== JSON.stringify(basePack?.[k]);
        if (changedHere) {
          if (localPack[k] === undefined) delete merged[k];
          else merged[k] = localPack[k];
        }
      }
      writePack(merged);
    } else if (basePack?.packVersion && localPack.packVersion !== basePack.packVersion) {
      // packVersion lo sube el generador; se vuelve al publicado para no sumarlo dos veces.
      writePack({ ...localPack, packVersion: basePack.packVersion });
    }
    await reconciliar(oldMan, readJson(p('manifest.json'), null));
  }

  // Deja las carpetas mods/ y files/ como dice la lista publicada: los archivos que se descargan de
  // Modrinth no están en GitHub, así que se bajan acá; y si otro administrador quitó un mod, se quita.
  async function reconciliar(oldMan, newMan) {
    const baseUrl = String(readPack().baseUrl || '').replace(/\/$/, '');
    const entries = (m) =>
      !m ? [] : [
        ...[...(m.mods || []), ...(m.optional || []), ...(m.serverOnly || [])].map((x) => ({ ...x, rel: `mods/${x.file}` })),
        ...(m.files || []).map((f) => ({ ...f, rel: `files/${f.path}` }))
      ];
    const safe = (rel) => rel.split('/').every((s) => s && s !== '..' && !/[\\:*?"<>|]/.test(s));
    const stamp = readJson(p('herramientas', 'publicado.json'), {});
    const newE = entries(newMan).filter((e) => safe(e.rel));
    const newRels = new Set(newE.map((e) => e.rel));

    if (oldMan && newMan && newMan.packVersion !== oldMan.packVersion) {
      for (const e of entries(oldMan)) {
        if (newRels.has(e.rel) || !safe(e.rel) || !exists(p(e.rel))) continue;
        if ((await git(['ls-files', '--error-unmatch', '--', e.rel])).code === 0) continue;
        await fsp.mkdir(TRASH, { recursive: true });
        await fsp.rename(p(e.rel), path.join(TRASH, path.basename(e.rel)));
        log(`Quitado (lo quitó otro administrador): ${e.rel}`);
      }
    }
    // Faltan en esta PC y no los quitaste tú (los que quitaste quedan anotados en publicado.json).
    // (Tampoco los que están en la papelera de esta PC: los quitaste tú y todavía no publicaste.)
    const missing = newE.filter((e) => !exists(p(e.rel)) && !stamp[e.rel] && !exists(path.join(TRASH, path.basename(e.rel)))
      && e.url && !e.url.startsWith(baseUrl) && /^https:\/\//.test(e.url));
    if (!missing.length) return;
    fase(`Descargando ${missing.length} archivo(s) que faltan en esta PC`);
    for (const e of missing) {
      const res = await fetch(e.url, { headers: { 'User-Agent': 'apokelipsis-panel' } });
      if (!res.ok) throw new Error(`No se pudo descargar ${e.rel} (${res.status})`);
      const data = Buffer.from(await res.arrayBuffer());
      const ok = e.sha512 ? crypto.createHash('sha512').update(data).digest('hex') === e.sha512 : crypto.createHash('sha1').update(data).digest('hex') === e.sha1;
      if (!ok) throw new Error(`${e.rel} se descargó dañado (no coincide su huella)`);
      await fsp.mkdir(path.dirname(p(e.rel)), { recursive: true });
      await fsp.writeFile(p(e.rel), data);
      log(`Descargado: ${e.rel}`);
    }
  }

  // ---------- 2. Launcher nuevo ----------
  const isNewer = (a, b) => {
    const x = String(a).split('.').map(Number);
    const y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };
  function launcherNuevo() {
    const v = readJson(p('launcher', 'version.json'), null);
    const pack = readPack();
    return v?.version && isNewer(v.version, pack.launcher?.version || '0') ? v.version : null;
  }
  async function publicarLauncher() {
    const version = launcherNuevo();
    if (!version) return;
    const pack = readPack();
    const file = pack.launcher?.file || 'launcher/Instalar Apokelipsis.exe';
    if (!exists(p(file))) fail(`Falta el instalador del launcher (${file}).`);
    const data = fs.readFileSync(p(file));
    fase(`Subiendo el launcher ${version} a GitHub (${Math.round(data.length / 1048576)} MB, puede tardar unos minutos)`);
    const { owner, repo } = await repoInfo();
    const tag = `v${version}`;
    let rel = await gh(`/repos/${owner}/${repo}/releases/tags/${tag}`);
    if (!rel) {
      rel = await gh(`/repos/${owner}/${repo}/releases`, {
        method: 'POST',
        body: { tag_name: tag, name: `Launcher ${version}`, body: 'Instalador del launcher de Apokelipsis. Los jugadores lo reciben solo al abrir el launcher.' }
      });
    }
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const NAME = 'Instalar-Apokelipsis.exe';
    let asset = (rel.assets || []).find((a) => a.name === NAME);
    if (asset && (asset.size !== data.length || (asset.digest && asset.digest !== `sha256:${sha256}`))) {
      await gh(`/repos/${owner}/${repo}/releases/assets/${asset.id}`, { method: 'DELETE' });
      asset = null;
    }
    if (!asset) {
      asset = await gh(`https://uploads.github.com/repos/${owner}/${repo}/releases/${rel.id}/assets?name=${NAME}`, {
        method: 'POST',
        raw: true,
        body: data,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
    }
    writePack({ ...readPack(), launcher: { version, file, url: asset.browser_download_url } });
    log(`Launcher ${version} publicado: ${asset.browser_download_url}`);
  }

  // ---------- Publicar todo ----------
  async function identity() {
    const email = (await git(['config', 'user.email'])).out.trim();
    if (email) return [];
    const me = await gh('/user');
    return ['-c', `user.name=${me.login}`, '-c', `user.email=${me.id}+${me.login}@users.noreply.github.com`];
  }

  async function publicar() {
    if (!claveEstado().existe) fail('Esta PC no tiene la clave de firma (pestaña «Administradores»).');
    if (!(await getToken())) fail('El panel todavía no está conectado con GitHub (pestaña «Publicar»).');

    // Primero se trae lo publicado: la lista de claves autorizadas puede haber cambiado.
    await traer();
    if (!claveEstado().autorizada) fail('La clave de esta PC todavía no está autorizada en el launcher (pestaña «Administradores»).');
    await publicarLauncher();

    fase('Preparando y firmando la lista de mods (consulta Modrinth)');
    const r = await run(process.execPath, ['generate-manifest.js'], { timeout: 600000 });
    log(r.out);
    if (r.code !== 0) throw new Error('No se pudo preparar la lista. Mira el detalle.');

    fase('Subiendo a GitHub');
    const pack = readPack();
    const baseUrl = String(pack.baseUrl || '').replace(/\/$/, '');
    // El instalador del launcher vive en Releases (pesa más de lo que GitHub acepta en el repositorio).
    if (pack.launcher?.file && pack.launcher.url && !pack.launcher.url.startsWith(baseUrl)) {
      await git(['rm', '--cached', '--quiet', '--ignore-unmatch', '--', pack.launcher.file]);
    }
    await gitOk(['add', '-A'], 'No se pudieron preparar los archivos');
    // Los archivos que se descargan a los jugadores se suben tal cual (sin cambiar saltos de línea),
    // así GitHub sirve exactamente los mismos bytes con los que se calculó su huella.
    await git(['add', '--renormalize', '--', 'files', '.gitattributes']);
    const dirty = (await git(['status', '--porcelain'])).out.trim();
    if (dirty) {
      await gitOk([...(await identity()), 'commit', '--quiet', '-m', `Panel: pack ${pack.packVersion}`], 'No se pudo guardar el cambio en Git');
    }
    if (!dirty && (await count('@{u}..HEAD')) === 0) {
      fase('No había nada nuevo para publicar');
      return;
    }
    const push = await git(['push', '--quiet'], { env: await authEnv(), timeout: 900000 });
    if (push.code !== 0) {
      if (/rejected|fetch first|non-fast-forward/i.test(push.out)) {
        fail('Otro administrador publicó justo al mismo tiempo. Vuelve a tocar «Publicar»: el panel juntará sus cambios con los tuyos.');
      }
      throw new Error(`GitHub no aceptó la subida.\n${push.out}`);
    }
    fase(`¡Listo! Pack ${readPack().packVersion} publicado`);
  }

  // ---------- Estado rápido (sin internet) ----------
  async function estadoLocal() {
    if (!hayGit()) return { git: false, conectado: exists(TOKEN_FILE), launcherNuevo: launcherNuevo() };
    const status = (await git(['status', '--porcelain'])).out.trim();
    return {
      git: true,
      conectado: exists(TOKEN_FILE),
      sinSubir: (await count('@{u}..HEAD')) > 0 || !!status,
      launcherNuevo: launcherNuevo()
    };
  }

  const api = {
    'POST /publicar': async () => start('publicar'),
    'POST /traer': async () => start('traer'),
    'GET /trabajo': async () => job || { done: true, ninguno: true },
    'GET /remoto': async () => {
      if (!hayGit()) return { git: false };
      await git(['fetch', '--quiet'], { env: await authEnv(), timeout: 30000 });
      return { git: true, atrasado: await count('HEAD..@{u}') };
    },
    'GET /github': async () => {
      if (!exists(TOKEN_FILE)) return { conectado: false, git: hayGit() };
      try {
        const { owner, repo } = await repoInfo();
        const [me, r] = await Promise.all([gh('/user'), gh(`/repos/${owner}/${repo}`)]);
        return { conectado: true, git: hayGit(), usuario: me.login, repo: `${owner}/${repo}`, puedeEscribir: !!r?.permissions?.push };
      } catch (err) {
        return { conectado: false, git: hayGit(), error: err.message };
      }
    },
    'POST /github/conectar': async (q, req, res, body) => {
      const token = String(JSON.parse(body).token || '').trim();
      if (!/^(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(token)) fail('Eso no parece una llave de GitHub (empieza con ghp_ o github_pat_).');
      const { owner, repo } = await repoInfo();
      const r = await gh(`/repos/${owner}/${repo}`, { token });
      if (!r) fail(`Con esa llave no se ve el repositorio ${owner}/${repo}.`);
      if (!r.permissions?.push) fail(`Esa llave no tiene permiso para publicar en ${owner}/${repo}. Pídele al dueño que te invite como colaborador.`);
      const me = await gh('/user', { token });
      await saveToken(token);
      return { ok: true, usuario: me.login, repo: `${owner}/${repo}` };
    },
    'POST /github/desconectar': async () => {
      tokenCache = null;
      await fsp.rm(TOKEN_FILE, { force: true });
      return { ok: true };
    }
  };

  return { api, estadoLocal, findGit, git, hayGit };
};

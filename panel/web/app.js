'use strict';
const TOKEN = location.hash.slice(1);
const N = window.NOMBRES;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

async function api(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'X-Token': TOKEN, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}) },
    body: raw ? body : body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 401 ? 'El panel se reinició: cierra esta pestaña y vuelve a abrir "PANEL DE CONTROL.bat".' : `Error ${res.status}`));
  return data;
}
const iconUrl = (file) => `/api/mods/icono?file=${encodeURIComponent(file)}&t=${TOKEN}`;

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3500);
}
function modal(html, { wide } = {}) {
  $('#modal-box').innerHTML = html;
  $('#modal-box').style.width = wide ? 'min(900px, 100%)' : '';
  $('#modal').hidden = false;
  return $('#modal-box');
}
const closeModal = () => ($('#modal').hidden = true);
$('#modal').addEventListener('mousedown', (e) => e.target.id === 'modal' && closeModal());
function confirmar(titulo, texto, { ok = 'Aceptar', danger } = {}) {
  return new Promise((resolve) => {
    const box = modal(`<h2>${titulo}</h2><p>${texto}</p><div class="modal-actions"><button class="btn ghost" data-r="0">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${ok}</button></div>`);
    box.onclick = (e) => {
      const r = e.target.dataset.r;
      if (r === undefined) return;
      closeModal();
      resolve(r === '1');
    };
  });
}

// ---------------- navegación y guardado ----------------
const dirty = new Set();
const savers = {};
const loaders = {};
let current = 'inicio';
function markDirty(key) {
  dirty.add(key);
  $('#savebar').hidden = false;
}
async function saveAll() {
  const btn = $('#save');
  btn.disabled = true;
  try {
    for (const key of [...dirty]) {
      await savers[key]();
      dirty.delete(key);
    }
    $('#savebar').hidden = true;
    toast('Guardado. Recuerda publicar para que les llegue a los jugadores.', 'ok');
    refreshEstado();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}
$('#save').onclick = saveAll;
$('#discard').onclick = async () => {
  const keys = [...dirty];
  dirty.clear();
  $('#savebar').hidden = true;
  for (const key of keys) await loaders[key]?.();
};
window.addEventListener('beforeunload', (e) => {
  if (dirty.size) e.preventDefault();
});

async function show(view) {
  current = view;
  $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
  $('#main').scrollTop = 0;
  try {
    await views[view]?.();
  } catch (err) {
    toast(err.message, 'err');
  }
}
$('#nav').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) show(b.dataset.view);
};
document.addEventListener('click', async (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    e.preventDefault();
    return show(go.dataset.go);
  }
  if (e.target.closest('[data-close]')) return closeModal();
  const o = e.target.closest('[data-open]');
  if (o) e.preventDefault();
  if (!o) return;
  try {
    await api('/abrir', { method: 'POST', body: { que: o.dataset.open } });
  } catch (err) {
    toast(err.message, 'err');
  }
});

let estado = null;
async function refreshEstado() {
  estado = await api('/estado');
  $$('.mc-ver').forEach((el) => (el.textContent = estado.minecraft));
  $('#nav-pend').hidden = !estado.pendientes.length && estado.reinicio === estado.reinicioPublicado;
  $('#side-foot').innerHTML = `Pack ${esc(estado.packVersion)} · Launcher ${esc(estado.launcher || '?')}<br>${esc(estado.carpeta)}`;
  return estado;
}

// ---------------- INICIO ----------------
const views = {};
views.inicio = async () => {
  const e = await refreshEstado();
  const m = e.mods;
  $('#inicio-cards').innerHTML = `
    <div class="stat hl"><div class="k">Servidor</div><div class="v">${esc(e.servidor.name || '—')}</div><div class="s">${e.servidor.address ? esc(e.servidor.address) : 'Sin dirección todavía'}</div></div>
    <div class="stat"><div class="k">Versión del pack</div><div class="v">${esc(e.packVersion)}</div><div class="s">Minecraft ${esc(e.minecraft)} · Fabric ${esc(e.fabric)}</div></div>
    <div class="stat"><div class="k">Mods</div><div class="v">${e.totalJars}</div><div class="s">${m ? `${m.obligatorios} obligatorios · ${m.opcionales} opcionales` : 'Sin publicar'}</div></div>
    <div class="stat"><div class="k">Launcher</div><div class="v">${esc(e.launcher || '—')}</div><div class="s">Versión que reciben los jugadores</div></div>`;
  const pend = e.pendientes;
  const reset = e.reinicio > e.reinicioPublicado;
  $('#inicio-pend').innerHTML = pend.length || reset
    ? `<h3>📝 Cambios sin publicar</h3><p class="muted small">Están guardados en esta PC pero los jugadores todavía no los tienen.</p>
       <div class="list">${pend.slice(0, 12).map((x) => `<div class="mf">${esc(x)}</div>`).join('')}${pend.length > 12 ? `<div class="mf">…y ${pend.length - 12} más</div>` : ''}
       ${reset ? '<div class="mf">♻️ Reinicio de configuración para todos los jugadores</div>' : ''}</div>
       <p><button class="btn primary" data-go="publicar">🚀 Ir a publicar</button></p>`
    : `<h3>✅ Todo publicado</h3><p class="muted">Los jugadores tienen la última versión de todo.</p>`;
  if (!e.clave.autorizada) {
    $('#inicio-pend').insertAdjacentHTML('beforebegin', `<div class="note err" id="key-warn">🔑 Esta PC no puede publicar todavía: ${e.clave.existe ? 'su clave no está autorizada en el launcher' : 'no tiene la clave de firma'}. <a href="#" data-go="admins">Ver cómo solucionarlo</a>.</div>`);
  }
  gitBanner();
};
async function gitBanner() {
  const el = $('#git-banner');
  el.innerHTML = '';
  try {
    const g = await api('/git');
    if (g.disponible && g.atrasado > 0) {
      el.innerHTML = `<div class="note info">⬇ Hay <b>${g.atrasado}</b> cambio(s) en GitHub que no tienes (de otro administrador). <button class="btn" id="pull-btn">Traerlos ahora</button></div>`;
      $('#pull-btn').onclick = pull;
    }
  } catch {}
}
async function pull() {
  const r = await api('/git/traer', { method: 'POST' });
  if (r.ok) {
    toast('Cambios traídos', 'ok');
    show(current);
  } else modal(`<h2>No se pudieron traer los cambios</h2><pre class="console">${esc(r.salida)}</pre><p>Ábrelo en GitHub Desktop y toca «Pull origin».</p><div class="modal-actions"><button class="btn" data-open="desktop">Abrir GitHub Desktop</button><button class="btn primary" data-close>Cerrar</button></div>`);
}

// ---------------- MODS ----------------
let mods = [];
let modsFilter = 'todos';
const ESTADOS = { obligatorio: 'Obligatorio', opcional: 'Opcional', servidor: 'Solo servidor', nuevo: 'Sin publicar' };
views.mods = async () => {
  mods = await api('/mods');
  renderMods();
  renderTrash();
};
function modIcon(m) {
  return m.icon ? `<img src="${iconUrl(m.file)}" alt="" loading="lazy">` : '📦';
}
function renderMods() {
  const q = $('#mods-search').value.trim().toLowerCase();
  const list = mods.filter((m) => (modsFilter === 'todos' || m.estado === modsFilter) && (!q || `${m.name} ${m.file} ${m.id}`.toLowerCase().includes(q)));
  $$('#mods-filter button').forEach((b) => {
    const n = b.dataset.f === 'todos' ? mods.length : mods.filter((m) => m.estado === b.dataset.f).length;
    b.textContent = `${b.textContent.replace(/\s*\(\d+\)$/, '')} (${n})`;
  });
  $('#mods-list').innerHTML = list.length
    ? list.map((m) => `
      <div class="row" title="${esc(m.description)}">
        <div class="mi">${modIcon(m)}</div>
        <div class="mt"><div class="mn">${esc(m.name)} <span class="muted small">${esc(m.version || '')}</span></div><div class="mf">${esc(m.file)} · ${fmtSize(m.size)}</div></div>
        <span class="badge ${m.estado}">${ESTADOS[m.estado]}</span>
        <button class="icon-btn" data-del="${esc(m.file)}" title="Quitar">🗑️</button>
      </div>`).join('')
    : '<div class="empty">No hay mods que coincidan.</div>';
}
$('#mods-search').oninput = renderMods;
$('#mods-filter').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  modsFilter = b.dataset.f;
  $$('#mods-filter button').forEach((x) => x.classList.toggle('on', x === b));
  renderMods();
};
$('#mods-list').onclick = async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  const m = mods.find((x) => x.file === b.dataset.del);
  const extra = m.id === 'apokelipsis' ? '<br><br><b>¡Ojo!</b> Este es el mod del menú de Apokelipsis.' : '';
  if (!(await confirmar('¿Quitar este mod?', `<b>${esc(m.name)}</b> (${esc(m.file)}) se mueve a la papelera. Al publicar, se les quita a los jugadores.${extra}`, { ok: 'Quitar', danger: true }))) return;
  await api('/mods/quitar', { method: 'POST', body: { files: [m.file] } });
  toast(`${m.name} quitado`);
  views.mods();
  refreshEstado();
};
async function renderTrash() {
  const t = await api('/mods/quitados');
  $('#trash-count').textContent = t.length ? `(${t.length})` : '(vacía)';
  $('#trash-list').innerHTML = t.map((m) => `<div class="row"><div class="mi">📦</div><div class="mt"><div class="mn">${esc(m.name)}</div><div class="mf">${esc(m.file)}</div></div><button class="btn ghost" data-restore="${esc(m.file)}">↩ Restaurar</button></div>`).join('') || '<div class="muted small">No hay nada.</div>';
}
$('#trash-list').onclick = async (e) => {
  const b = e.target.closest('[data-restore]');
  if (!b) return;
  await api('/mods/restaurar', { method: 'POST', body: { file: b.dataset.restore } });
  toast('Restaurado');
  views.mods();
};
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  upload([...e.dataTransfer.files]);
});
$('#drop-input').onchange = (e) => {
  upload([...e.target.files]);
  e.target.value = '';
};
async function upload(files) {
  const box = $('#upload-list');
  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'row up';
    row.innerHTML = `<div class="mi"><span class="spin"></span></div><div class="mt"><div class="mn">${esc(f.name)}</div><div class="mf">Subiendo ${fmtSize(f.size)}...</div></div>`;
    box.prepend(row);
    try {
      if (!/\.jar$/i.test(f.name)) throw new Error('No es un .jar');
      const r = await api(`/mods/subir?nombre=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, raw: true });
      row.innerHTML = `<div class="mi">✅</div><div class="mt"><div class="mn">${esc(r.name || f.name)}</div><div class="mf">Agregado: ${esc(r.file)}</div></div>`;
      row.className = 'row';
      if (r.otros.length && (await confirmar('Hay otra versión de este mod', `Ya tenías <b>${esc(r.otros.join(', '))}</b>, que es el mismo mod (${esc(r.id)}). ¿Quitar la versión vieja? (va a la papelera)`, { ok: 'Quitar la vieja' }))) {
        await api('/mods/quitar', { method: 'POST', body: { files: r.otros } });
        row.querySelector('.mf').textContent += ` · reemplaza a ${r.otros.join(', ')}`;
      }
    } catch (err) {
      row.className = 'row err';
      row.innerHTML = `<div class="mi">⚠️</div><div class="mt"><div class="mn">${esc(f.name)}</div><div class="mf">${esc(err.message)}</div></div>`;
    }
  }
  views.mods();
  refreshEstado();
}

// ---------------- OPCIONALES ----------------
let opc = null;
views.opcionales = loaders.opcionales = async () => {
  if (dirty.has('opcionales') && opc) return renderOpc();
  opc = await api('/opcionales');
  renderOpc();
};
function renderOpc() {
  $('#opc-note').className = 'note info';
  $('#opc-note').innerHTML = 'Los mods nuevos que sean solo de cliente aparecen aquí después de <b>publicar</b> (el panel no sabe de qué lado van hasta entonces). Si dejas el nombre o la descripción vacíos, se usa el original del mod.';
  $('#opc-list').innerHTML = opc.opcionales.map((o, i) => `
    <div class="opc ${o.activado ? '' : 'off'}" data-i="${i}">
      <div class="opc-head"><div class="mi">${o.icon ? `<img src="${iconUrl(o.icon)}" alt="">` : '📦'}</div><input data-k="nombre" value="${esc(o.nombre)}" placeholder="${esc(o.nombreOriginal)}" maxlength="60"></div>
      <textarea data-k="descripcion" maxlength="300" placeholder="${esc(o.descripcionOriginal || 'Descripción para los jugadores')}">${esc(o.descripcion)}</textarea>
      <div class="opc-foot">
        <label class="sw"><input type="checkbox" data-k="activado" ${o.activado ? 'checked' : ''}><i></i>Encendido por defecto</label>
        <button class="btn ghost small" data-force="${esc(o.id)}" title="Todos los jugadores lo tendrán sí o sí">Hacer obligatorio</button>
      </div>
      ${o.requiere.length ? `<div class="muted small">Necesita: ${o.requiere.map(esc).join(', ')}</div>` : ''}
    </div>`).join('') || '<div class="empty">No hay mods opcionales publicados.</div>';
  $('#forzados').innerHTML = `<h3>🔒 Mods de cliente que son obligatorios</h3>
    <p class="muted small">Mods que podrían ser opcionales pero decidiste que todos los tengan.</p>
    <div class="list">${opc.forzados.map((f) => `<div class="row"><div class="mt"><div class="mn">${esc(f.nombre)}</div><div class="mf">${esc(f.id)}</div></div><button class="btn ghost" data-unforce="${esc(f.id)}">Volver a opcional</button></div>`).join('') || '<div class="muted small">Ninguno.</div>'}</div>`;
}
$('#opc-list').oninput = (e) => {
  const card = e.target.closest('.opc');
  const k = e.target.dataset.k;
  if (!card || !k) return;
  const o = opc.opcionales[card.dataset.i];
  o[k] = k === 'activado' ? e.target.checked : e.target.value;
  card.classList.toggle('off', !o.activado);
  markDirty('opcionales');
};
$('#view-opcionales').onclick = (e) => {
  const f = e.target.closest('[data-force]');
  const u = e.target.closest('[data-unforce]');
  if (f) {
    const o = opc.opcionales.find((x) => x.id === f.dataset.force);
    opc.forzados.push({ id: o.id, nombre: o.nombre || o.nombreOriginal });
    opc.opcionales = opc.opcionales.filter((x) => x !== o);
    toast(`${o.nombreOriginal} será obligatorio al publicar`);
  } else if (u) {
    opc.forzados = opc.forzados.filter((x) => x.id !== u.dataset.unforce);
    toast('Volverá a ser opcional al publicar');
  } else return;
  markDirty('opcionales');
  renderOpc();
};
savers.opcionales = () => api('/opcionales', { method: 'POST', body: { opcionales: opc.opcionales, forzados: opc.forzados.map((f) => f.id) } });

// ---------------- MENÚ ----------------
let menu = null;
let pvIndex = 0;
views.menu = loaders.menu = async () => {
  if (!(dirty.has('menu') && menu)) menu = await api('/menu');
  $('#menu-preview').style.backgroundImage = `url(/api/panorama?i=0&t=${TOKEN})`;
  renderMenu();
};
function renderMenu() {
  $('#frases').innerHTML = menu.frases.map((f, i) => `
    <div class="frase"><input value="${esc(f)}" data-i="${i}" maxlength="80" class="${i === pvIndex ? 'sel' : ''}"><span class="len">${f.length}</span><button class="icon-btn" data-rm="${i}" title="Quitar">✕</button></div>`).join('');
  $('#srv-name').value = menu.nombre;
  $('#srv-addr').value = menu.direccion;
  updatePreview();
}
function updatePreview() {
  const f = menu.frases[pvIndex] || menu.frases[0] || '';
  const el = $('#pv-splash');
  el.textContent = f;
  // Igual que en el juego: las frases largas se ven más chicas.
  el.style.fontSize = Math.max(7, Math.min(16, 260 / (f.length + 4))) + 'px';
  $('#pv-server').textContent = menu.direccion ? menu.nombre : 'Servidor: próximamente';
}
$('#frases').oninput = (e) => {
  const i = Number(e.target.dataset.i);
  menu.frases[i] = e.target.value;
  e.target.nextElementSibling.textContent = e.target.value.length;
  pvIndex = i;
  updatePreview();
  markDirty('menu');
};
$('#frases').onfocusin = (e) => {
  if (e.target.dataset.i === undefined) return;
  pvIndex = Number(e.target.dataset.i);
  $$('#frases input').forEach((x) => x.classList.toggle('sel', x === e.target));
  updatePreview();
};
$('#frases').onclick = (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b) return;
  menu.frases.splice(Number(b.dataset.rm), 1);
  pvIndex = 0;
  markDirty('menu');
  renderMenu();
};
$('#frase-add').onclick = () => {
  menu.frases.push('');
  pvIndex = menu.frases.length - 1;
  renderMenu();
  $$('#frases input').pop().focus();
  markDirty('menu');
};
['#srv-name', '#srv-addr'].forEach((s) => ($(s).oninput = () => {
  menu.nombre = $('#srv-name').value;
  menu.direccion = $('#srv-addr').value;
  updatePreview();
  markDirty('menu');
}));
savers.menu = () => api('/menu', { method: 'POST', body: menu });

// ---------------- CONFIGURACIÓN INICIAL ----------------
let opts = null; // [{clave, valor}]
let trad = { textos: {}, mods: {} };
let cfgTab = 'opciones';
const VIDEO = ['renderDistance', 'simulationDistance', 'graphicsMode', 'maxFps', 'enableVsync', 'guiScale', 'fov', 'fovEffectScale', 'gamma', 'particles', 'mipmapLevels', 'biomeBlendRadius', 'entityDistanceScaling', 'entityShadows', 'renderClouds', 'ao', 'fullscreen', 'prioritizeChunkUpdates', 'screenEffectScale', 'darknessEffectScale', 'glintSpeed', 'glintStrength', 'menuBackgroundBlurriness', 'bobView', 'hideLightningFlashes', 'damageTiltStrength', 'cloudRange'];
const CATS = { video: '🖥️ Video', sonido: '🔊 Sonido', chat: '💬 Chat', juego: '🎮 Juego y mouse', skin: '🧍 Partes de la skin', otros: '📋 Otras', controles: '🎮 Controles', packs: '🎨 Packs de texturas' };
function cat(k) {
  if (k.startsWith('key_')) return 'controles';
  if (k === 'resourcePacks' || k === 'incompatibleResourcePacks') return 'packs';
  if (k.startsWith('soundCategory_') || k === 'directionalAudio' || k === 'showSubtitles') return 'sonido';
  if (k.startsWith('modelPart_')) return 'skin';
  if (VIDEO.includes(k)) return 'video';
  if (/^(chat|textBackground|backgroundForChat|autoSuggestions|hideMatchedNames|onlyShowSecureChat)/.test(k)) return 'chat';
  if (/mouse|Mouse|toggle|autoJump|mainHand|attackIndicator|lang|pauseOnLostFocus|advancedItemTooltips/.test(k)) return 'juego';
  return 'otros';
}
const getOpt = (k) => opts.find((o) => o.clave === k)?.valor;
function setOpt(k, v) {
  const o = opts.find((x) => x.clave === k);
  if (o) o.valor = v;
  else opts.push({ clave: k, valor: v });
  markDirty('opciones');
}

views.config = loaders.opciones = async () => {
  if (!(dirty.has('opciones') && opts)) opts = (await api('/opciones')).lineas;
  api('/traducciones').then((t) => {
    trad = t;
    if (cfgTab === 'controles') renderKeys();
    updateConfCount();
  });
  showCfgTab(cfgTab);
};
$('#cfg-tabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) showCfgTab(b.dataset.t);
};
function showCfgTab(t) {
  cfgTab = t;
  $$('#cfg-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  $$('#view-config .tab').forEach((el) => (el.hidden = el.id !== 't-' + t));
  ({ opciones: renderOpts, controles: renderKeys, packs: renderPacks, configs: loadConfigs, reinicio: renderReset })[t]();
  updateConfCount();
}

// Opciones
function renderOpts() {
  const q = $('#opt-search').value.trim().toLowerCase();
  const groups = {};
  for (const o of opts) {
    const c = cat(o.clave);
    if (c === 'controles' || c === 'packs') continue;
    const label = N.opciones[o.clave] || o.clave;
    if (q && !`${label} ${o.clave}`.toLowerCase().includes(q)) continue;
    (groups[c] ||= []).push(o);
  }
  const order = ['video', 'sonido', 'juego', 'chat', 'skin', 'otros'];
  $('#opt-groups').innerHTML = order.filter((c) => groups[c]).map((c) => `
    <div class="card opt-group"><h3>${CATS[c]}</h3>
      ${groups[c].map((o) => {
        const bool = o.valor === 'true' || o.valor === 'false';
        return `<div class="opt"><div><div class="on">${esc(N.opciones[o.clave] || o.clave)}</div><div class="ok">${esc(o.clave)}</div></div>
          <div>${bool ? `<label class="sw"><input type="checkbox" data-opt="${esc(o.clave)}" ${o.valor === 'true' ? 'checked' : ''}><i></i>${o.valor === 'true' ? 'Sí' : 'No'}</label>` : `<input data-opt="${esc(o.clave)}" value="${esc(o.valor)}">`}</div>
          <button class="icon-btn" data-optrm="${esc(o.clave)}" title="Quitar (el juego usará su valor normal)">✕</button></div>`;
      }).join('')}
    </div>`).join('') || '<div class="empty">No hay opciones.</div>';
}
$('#opt-search').oninput = renderOpts;
$('#opt-groups').addEventListener('input', (e) => {
  const k = e.target.dataset.opt;
  if (!k) return;
  if (e.target.type === 'checkbox') {
    setOpt(k, String(e.target.checked));
    e.target.parentElement.lastChild.textContent = e.target.checked ? 'Sí' : 'No';
  } else setOpt(k, e.target.value);
});
$('#opt-groups').addEventListener('click', (e) => {
  const b = e.target.closest('[data-optrm]');
  if (!b) return;
  opts = opts.filter((o) => o.clave !== b.dataset.optrm);
  markDirty('opciones');
  renderOpts();
});

// Copiar desde mi juego
$('#import-btn').onclick = async () => {
  let juego;
  try {
    juego = (await api('/opciones/juego')).lineas;
  } catch (err) {
    return toast(err.message, 'err');
  }
  const diffs = juego.filter((j) => !N.personales.includes(j.clave) && getOpt(j.clave) !== j.valor);
  if (!diffs.length) return toast('Tu juego tiene la misma configuración que el pack.', 'ok');
  const byCat = {};
  for (const d of diffs) (byCat[cat(d.clave)] ||= []).push(d);
  const order = ['video', 'controles', 'packs', 'sonido', 'juego', 'chat', 'skin', 'otros'];
  const label = (k) => (k.startsWith('key_') ? keyLabel(k.slice(4)) : N.opciones[k] || k);
  const val = (k, v) => (v === undefined ? '<i class="muted">(no está)</i>' : k.startsWith('key_') ? esc(N.nombreTecla(v)) : k === 'resourcePacks' ? `${safeArr(v).length} packs` : esc(v));
  const box = modal(`<h2>Copiar desde mi juego</h2>
    <p class="muted">Estas opciones de tu juego son distintas a las del pack. Marca las que quieres que reciban los jugadores nuevos.</p>
    <table class="diff"><tr><th></th><th>Opción</th><th>En el pack</th><th>En tu juego</th></tr>
    ${order.filter((c) => byCat[c]).map((c) => `<tr class="cat"><td><input type="checkbox" data-cat="${c}" checked></td><td colspan="3">${CATS[c]} (${byCat[c].length})</td></tr>
      ${byCat[c].map((d) => `<tr><td><input type="checkbox" data-k="${esc(d.clave)}" data-c="${c}" checked></td><td>${esc(label(d.clave))}</td><td class="val">${val(d.clave, getOpt(d.clave))}</td><td class="val">${val(d.clave, d.valor)}</td></tr>`).join('')}`).join('')}
    </table>
    <div class="modal-actions"><button class="btn ghost" id="imp-cancel">Cancelar</button><button class="btn primary" id="imp-ok">Copiar marcadas</button></div>`, { wide: true });
  box.onchange = (e) => {
    if (e.target.dataset.cat) $$(`[data-c="${e.target.dataset.cat}"]`, box).forEach((x) => (x.checked = e.target.checked));
  };
  $('#imp-cancel').onclick = closeModal;
  $('#imp-ok').onclick = () => {
    const keys = $$('[data-k]:checked', box).map((x) => x.dataset.k);
    for (const k of keys) setOpt(k, juego.find((j) => j.clave === k).valor);
    closeModal();
    toast(`${keys.length} opciones copiadas. Toca «Guardar».`, 'ok');
    showCfgTab(cfgTab);
  };
};

// Controles
function keyLabel(id) {
  let m;
  if (N.teclas[id]) return N.teclas[id];
  if ((m = /^key\.hotbar\.(\d)$/.exec(id))) return `Barra rápida ${m[1]}`;
  return trad.textos[id] || id.replace(/^key\./, '').replace(/[._]/g, ' ');
}
function keyGroup(id) {
  if (N.teclas[id] || /^key\.hotbar\./.test(id)) return 'Minecraft';
  if (trad.mods[id]) return trad.mods[id];
  const parts = id.replace(/^key\./, '').split('.');
  return parts.length > 1 ? parts[0] : 'Otros';
}
function conflicts() {
  const byKey = {};
  for (const o of opts) {
    if (!o.clave.startsWith('key_') || o.valor === 'key.keyboard.unknown') continue;
    // Las teclas de JEI/REI/EMI solo funcionan dentro de los inventarios: no chocan con las del juego.
    if (/^key\.(jei|rei|emi)\./.test(o.clave.slice(4))) continue;
    (byKey[o.valor] ||= []).push(o.clave.slice(4));
  }
  return byKey;
}
function updateConfCount() {
  if (!opts) return;
  const n = Object.values(conflicts()).filter((l) => l.length > 1).length;
  $('#conf-count').hidden = !n;
  $('#conf-count').textContent = n;
}
let waiting = null;
function renderKeys() {
  const q = $('#key-search').value.trim().toLowerCase();
  const only = $('#key-conf-only').checked;
  const conf = conflicts();
  const groups = {};
  for (const o of opts) {
    if (!o.clave.startsWith('key_')) continue;
    const id = o.clave.slice(4);
    const others = (conf[o.valor] || []).filter((x) => x !== id);
    if (only && !others.length) continue;
    const g = keyGroup(id);
    const label = keyLabel(id);
    if (q && !`${label} ${id} ${g}`.toLowerCase().includes(q)) continue;
    (groups[g] ||= []).push({ id, label, valor: o.valor, others });
  }
  const names = Object.keys(groups).sort((a, b) => (a === 'Minecraft' ? -1 : b === 'Minecraft' ? 1 : a.localeCompare(b)));
  $('#keys').innerHTML = names.map((g) => `<div class="kgroup"><h3>${esc(g)}</h3>
    ${groups[g].map((k) => `<div class="krow ${k.others.length ? 'conf' : ''}"><div><div class="kn">${esc(k.label)}</div>
      ${k.others.length ? `<div class="kc">⚠ Misma tecla que: ${k.others.map((x) => esc(keyLabel(x))).join(', ')}</div>` : `<div class="kid">${esc(k.id)}</div>`}</div>
      <button class="kbtn ${k.valor === 'key.keyboard.unknown' ? 'unset' : ''}" data-key="${esc(k.id)}">${esc(N.nombreTecla(k.valor))}</button></div>`).join('')}
  </div>`).join('') || `<div class="empty">${only ? '🎉 No hay teclas repetidas.' : 'No hay controles.'}</div>`;
  updateConfCount();
}
$('#key-search').oninput = renderKeys;
$('#key-conf-only').onchange = renderKeys;
$('#keys').addEventListener('click', (e) => {
  const b = e.target.closest('[data-key]');
  if (!b || waiting) return;
  e.stopPropagation();
  waiting = b;
  b.classList.add('wait');
  b.textContent = 'Pulsa una tecla...';
  setTimeout(() => {
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onMouse, true);
  });
});
document.addEventListener('contextmenu', (e) => waiting && e.preventDefault());
function finishKey(value) {
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('mousedown', onMouse, true);
  const id = waiting.dataset.key;
  waiting = null;
  if (value) setOpt('key_' + id, value);
  renderKeys();
}
function onKey(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.code === 'Escape') return finishKey(null);
  if (e.code === 'Backspace') return finishKey('key.keyboard.unknown');
  const v = N.codigo(e.code);
  if (v) finishKey(v);
  else toast('Esa tecla no se puede usar en Minecraft');
}
function onMouse(e) {
  e.preventDefault();
  e.stopPropagation();
  finishKey(['key.mouse.left', 'key.mouse.middle', 'key.mouse.right', 'key.mouse.4', 'key.mouse.5'][e.button] || null);
}

// Packs de texturas
function safeArr(v) {
  try {
    const a = JSON.parse(v || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
let packFiles = [];
async function renderPacks() {
  packFiles = (await api('/packs')).archivos;
  drawPacks();
}
function drawPacks() {
  const on = safeArr(getOpt('resourcePacks'));
  const shown = [...on].reverse(); // arriba = más prioridad
  const locked = (p) => p === 'vanilla' || p === 'fabric';
  const name = (p) => (p.startsWith('file/') ? p.slice(5).replace(/\.zip$/i, '') : p === 'vanilla' ? 'Minecraft (base)' : p === 'fabric' ? 'Mods (base)' : p);
  const kind = (p) => (p.startsWith('file/') ? '🎨' : locked(p) ? '🧱' : '🧩');
  $('#packs-on').innerHTML = shown.map((p, i) => `<div class="row ${locked(p) ? 'lock' : ''}"><div class="mi">${kind(p)}</div><div class="mt"><div class="mn">${esc(name(p))}</div><div class="mf">${p.startsWith('file/') ? (packFiles.includes(p.slice(5)) ? 'Pack del servidor' : '⚠ No está en files/resourcepacks') : locked(p) ? 'Base del juego (siempre abajo)' : 'Incluido en un mod'}</div></div>
    ${locked(p) ? '' : `<div class="pk-actions"><button data-mv="${i}" data-d="-1" title="Subir">▲</button><button data-mv="${i}" data-d="1" title="Bajar">▼</button><button data-off="${esc(p)}" title="Desactivar">✕</button></div>`}</div>`).join('');
  const off = packFiles.map((f) => 'file/' + f).filter((p) => !on.includes(p));
  $('#packs-off').innerHTML = off.map((p) => `<div class="row"><div class="mi">🎨</div><div class="mt"><div class="mn">${esc(name(p))}</div></div><button class="btn ghost" data-on="${esc(p)}">＋ Activar</button></div>`).join('') || '<div class="muted small">Todos los packs del servidor están activados.</div>';
}
$('#t-packs').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || b.dataset.open) return;
  let on = safeArr(getOpt('resourcePacks'));
  if (b.dataset.on) on.push(b.dataset.on);
  else if (b.dataset.off) on = on.filter((p) => p !== b.dataset.off);
  else if (b.dataset.mv !== undefined) {
    const shown = [...on].reverse();
    const i = Number(b.dataset.mv);
    const j = i + Number(b.dataset.d);
    if (j < 0 || j >= shown.length || ['vanilla', 'fabric'].includes(shown[j])) return;
    [shown[i], shown[j]] = [shown[j], shown[i]];
    on = shown.reverse();
  } else return;
  setOpt('resourcePacks', JSON.stringify(on));
  drawPacks();
};
savers.opciones = () => api('/opciones', { method: 'POST', body: { lineas: opts } });

// Configs de mods (inicial.zip)
let cfg = null;
let cfgFilter = 'todos';
loaders.configs = async () => {
  cfg = null;
  await loadConfigs();
};
async function loadConfigs() {
  if (!cfg) {
    $('#cfgf-list').innerHTML = '<div class="empty"><span class="spin"></span> Comparando archivos...</div>';
    const r = await api('/inicial');
    const rows = new Map();
    for (const z of r.zip) rows.set(z.ruta, { ruta: z.ruta, enZip: true, enJuego: false, igual: null, desde: 'zip' });
    for (const j of r.juego) {
      const row = rows.get(j.ruta) || { ruta: j.ruta, enZip: false, desde: 'no' };
      Object.assign(row, { enJuego: true, igual: j.igual });
      rows.set(j.ruta, row);
    }
    cfg = { rows: [...rows.values()].sort((a, b) => a.ruta.localeCompare(b.ruta)), hayJuego: r.hayJuego };
  }
  drawConfigs();
}
const cfgState = (r) => (r.enZip && r.enJuego ? (r.igual ? 'igual' : 'distinto') : r.enZip ? 'pack' : 'nuevo');
const STATE_TXT = { igual: '✔ Igual en tu juego', distinto: '✎ Distinto en tu juego', pack: 'Solo en el pack', nuevo: '＋ Solo en tu juego' };
function drawConfigs() {
  const q = $('#cfgf-search').value.trim().toLowerCase();
  const list = cfg.rows.filter((r) => {
    const s = cfgState(r);
    const f = cfgFilter === 'todos' || (cfgFilter === 'pack' ? r.enZip : s === cfgFilter);
    return f && (!q || r.ruta.toLowerCase().includes(q));
  });
  $('#cfgf-list').innerHTML = (cfg.hayJuego ? '' : '<div class="note">No encontré tu juego en esta PC: solo puedes quitar archivos del pack.</div>') +
    (list.slice(0, 400).map((r) => `<div class="row cfgf"><div class="mi">${r.ruta.endsWith('.json') || r.ruta.endsWith('.json5') ? '🧾' : '📄'}</div>
      <div class="mt"><div class="mn">${esc(r.ruta)}</div><div class="mf">${STATE_TXT[cfgState(r)]}</div></div>
      <select data-ruta="${esc(r.ruta)}">
        <option value="no" ${r.desde === 'no' ? 'selected' : ''}>No incluir</option>
        ${r.enZip ? `<option value="zip" ${r.desde === 'zip' ? 'selected' : ''}>Dejar la del pack</option>` : ''}
        ${r.enJuego ? `<option value="juego" ${r.desde === 'juego' ? 'selected' : ''}>Usar la de mi juego</option>` : ''}
      </select></div>`).join('') || '<div class="empty">Nada que mostrar.</div>') +
    (list.length > 400 ? `<div class="muted small">…y ${list.length - 400} más (usa el buscador).</div>` : '');
}
$('#cfgf-search').oninput = drawConfigs;
$('#cfgf-filter').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  cfgFilter = b.dataset.f;
  $$('#cfgf-filter button').forEach((x) => x.classList.toggle('on', x === b));
  drawConfigs();
};
$('#cfgf-list').onchange = (e) => {
  const r = cfg.rows.find((x) => x.ruta === e.target.dataset.ruta);
  if (!r) return;
  r.desde = e.target.value;
  markDirty('configs');
};
$('#cfgf-all').onclick = () => {
  const n = cfg.rows.filter((r) => cfgState(r) === 'distinto' && r.desde !== 'juego').map((r) => (r.desde = 'juego')).length;
  if (!n) return toast('No hay archivos distintos.');
  markDirty('configs');
  drawConfigs();
  toast(`${n} archivos usarán la versión de tu juego. Toca «Guardar».`);
};
savers.configs = async () => {
  await api('/inicial', { method: 'POST', body: { archivos: cfg.rows.filter((r) => r.desde !== 'no').map((r) => ({ ruta: r.ruta, desde: r.desde })) } });
  cfg = null;
};

// Reiniciar a todos
async function renderReset() {
  const e = await refreshEstado();
  const pend = e.reinicio > e.reinicioPublicado;
  $('#reset-state').innerHTML = pend
    ? `<div class="note">⏳ Reinicio pedido. Se aplica cuando <b>publiques</b>. <button class="btn ghost" id="reset-cancel">Cancelar el reinicio</button></div>`
    : `<p class="muted small">Reinicios hechos hasta ahora: ${e.reinicioPublicado}.</p><button class="btn danger" id="reset-go">♻️ Reiniciar la configuración de todos</button>`;
  $('#reset-go') && ($('#reset-go').onclick = async () => {
    if (!(await confirmar('¿Reiniciar a todos los jugadores?', 'Cuando publiques, cada jugador recibirá de nuevo toda la configuración inicial la próxima vez que abra el juego. Se pierden sus ajustes personales de opciones, controles y configs de mods.', { ok: 'Sí, reiniciar a todos', danger: true }))) return;
    await api('/reiniciar', { method: 'POST' });
    toast('Reinicio pedido. Ahora publica.', 'ok');
    renderReset();
  });
  $('#reset-cancel') && ($('#reset-cancel').onclick = async () => {
    await api('/reiniciar/cancelar', { method: 'POST' });
    toast('Reinicio cancelado');
    renderReset();
  });
}

// ---------------- PUBLICAR ----------------
let published = false;
views.publicar = async () => {
  const [e, g] = await Promise.all([refreshEstado(), api('/git').catch(() => ({ disponible: false }))]);
  const pend = e.pendientes.length || e.reinicio > e.reinicioPublicado;
  const steps = [];
  if (g.disponible && g.atrasado > 0) {
    steps.push(`<div class="step"><div class="n">!</div><div class="body"><h3>Primero: trae los cambios de otros administradores</h3>
      <p>En GitHub hay ${g.atrasado} cambio(s) que no tienes. Tráelos antes de publicar para no pisarlos.</p><button class="btn primary" id="p-pull">⬇ Traer cambios</button></div></div>`);
  }
  steps.push(`<div class="step ${published ? 'done' : ''}"><div class="n">${published ? '✓' : 1}</div><div class="body"><h3>Generar y firmar la lista</h3>
    <p>${pend ? 'Revisa los mods, prepara la lista y la firma con tu clave. Tarda menos de un minuto.' : 'No hay cambios nuevos, pero puedes generarla igual para comprobar.'}</p>
    ${dirty.size ? '<div class="note">Tienes cambios sin guardar: guárdalos antes.</div>' : ''}
    ${!e.clave.autorizada ? '<div class="note err">Esta PC no puede firmar (mira la pestaña Administradores).</div>' : ''}
    <button class="btn primary big" id="p-gen" ${!e.clave.autorizada || dirty.size ? 'disabled' : ''}>🚀 Generar y firmar</button></div></div>`);
  steps.push(`<div class="step"><div class="n">2</div><div class="body"><h3>Subir a GitHub</h3>
    ${g.disponible
      ? `<p>${g.cambios ? `Hay ${g.cambios} archivo(s) para subir.` : 'No hay nada para subir.'}${g.adelantado ? ` Y ${g.adelantado} commit(s) guardados sin subir.` : ''}</p>
         <div class="toolbar"><input id="p-msg" placeholder="Qué cambiaste (por ejemplo: nuevos mods)" style="max-width:380px"><button class="btn primary" id="p-push" ${g.cambios || g.adelantado ? '' : 'disabled'}>⬆ Subir</button></div>
         <p class="muted small">¿Prefieres hacerlo a mano? <a href="#" data-open="desktop">Abrir GitHub Desktop</a> → Commit to main → Push origin.</p>`
      : `<p>Abre GitHub Desktop y:</p><ul><li>Abajo a la izquierda escribe un nombre (por ejemplo: <i>mods</i>).</li><li>Toca <b>Commit to main</b>.</li><li>Arriba toca <b>Push origin</b>.</li></ul><button class="btn" data-open="desktop">Abrir GitHub Desktop</button>`}
    </div></div>`);
  $('#pub-steps').innerHTML = steps.join('');
  $('#p-pull') && ($('#p-pull').onclick = async () => { await pull(); });
  $('#p-gen').onclick = generate;
  $('#p-push') && ($('#p-push').onclick = push);
};
async function generate() {
  const b = $('#p-gen');
  b.disabled = true;
  b.innerHTML = '<span class="spin"></span> Generando...';
  const out = $('#pub-out');
  out.hidden = false;
  out.textContent = 'Revisando mods y consultando Modrinth...';
  try {
    const r = await api('/publicar', { method: 'POST' });
    out.textContent = r.salida;
    if (r.ok) {
      published = true;
      toast('Lista generada y firmada ✔', 'ok');
    } else toast('Hubo un error: mira el detalle abajo', 'err');
  } catch (err) {
    out.textContent = err.message;
    toast(err.message, 'err');
  }
  await views.publicar();
  out.hidden = false;
}
async function push() {
  const b = $('#p-push');
  b.disabled = true;
  b.innerHTML = '<span class="spin"></span> Subiendo...';
  const out = $('#pub-out');
  try {
    const r = await api('/git/subir', { method: 'POST', body: { mensaje: $('#p-msg').value.trim() || 'cambios desde el panel' } });
    out.hidden = false;
    out.textContent = r.salida;
    if (r.ok) {
      toast('¡Publicado! Los jugadores lo reciben al abrir el launcher.', 'ok');
      published = false;
    } else toast('No se pudo subir. Prueba con GitHub Desktop.', 'err');
  } catch (err) {
    toast(err.message, 'err');
  }
  await views.publicar();
}

// ---------------- ADMINISTRADORES ----------------
views.admins = async () => {
  const k = await api('/clave');
  $('#admins').innerHTML = `
    <div class="card"><h3>🔑 La clave de esta PC</h3>
      ${!k.existe ? `<p>Esta PC no tiene clave de firma, así que no puede publicar.</p>
          <p class="muted small">Si eres el dueño y ya tenías una clave, <b>no crees otra</b>: copia tu <code>clave-privada.pem</code> del respaldo a <code>${esc(k.ruta)}</code>.<br>Si eres un administrador nuevo, crea la tuya:</p>
          <button class="btn primary" id="k-new">Crear mi clave</button>`
        : k.autorizada ? `<div class="note ok">✅ Esta PC puede publicar: su clave está autorizada en el launcher.</div><p class="muted small">Guardada en <code>${esc(k.ruta)}</code>. No la compartas con nadie y guarda una copia en un pendrive.</p>`
        : `<div class="note err">Esta PC tiene clave, pero el launcher todavía no la acepta.</div>
           <p>Envíale esta <b>clave pública</b> al dueño del servidor (no es secreta):</p><div class="keybox">${esc(k.publica)}</div><button class="btn" id="k-copy">📋 Copiar</button>`}
    </div>
    <div class="card"><h3>👥 Claves autorizadas</h3><div class="list">${k.autorizadas.map((a) => `<div class="row"><div class="mi">🔑</div><div class="mt"><div class="mn">${esc(a.nombre)}</div><div class="mf">${esc(a.clave.split('\n')[1] || '')}</div></div>${k.publica === a.clave.trim() ? '<span class="badge opcional">Esta PC</span>' : ''}</div>`).join('')}</div></div>
    <div class="card"><h3>➕ Sumar a otro administrador</h3>
      <ol class="howto">
        <li>En GitHub (github.com/LautaroDaste/apokelipsis-pack → <b>Settings → Collaborators</b>) invítalo con su usuario.</li>
        <li>Él instala <b>GitHub Desktop</b>, clona el repositorio <code>apokelipsis-pack</code> y abre <b>PANEL DE CONTROL.bat</b> (está dentro).</li>
        <li>En esta pestaña toca <b>Crear mi clave</b> y te manda la clave pública.</li>
        <li>El dueño se la pasa a Claude para agregarla al launcher (<code>launcher/src/core/firma.js</code> y <code>panel/claves-autorizadas.json</code>) y publica el launcher nuevo.</li>
      </ol>
      <p class="muted small">Hasta entonces el otro administrador puede usar el panel y subir cambios, pero no firmar: el dueño publica por él.</p>
    </div>`;
  $('#k-new') && ($('#k-new').onclick = async () => {
    if (!(await confirmar('¿Crear una clave nueva?', 'Solo hazlo si eres un administrador nuevo. Si eres el dueño y perdiste la tuya, recupérala del respaldo.', { ok: 'Crear' }))) return;
    try {
      await api('/clave/crear', { method: 'POST' });
      views.admins();
    } catch (err) {
      toast(err.message, 'err');
    }
  });
  $('#k-copy') && ($('#k-copy').onclick = () => navigator.clipboard.writeText(k.publica).then(() => toast('Copiada', 'ok')));
};

window.show = show;
window.closeModal = closeModal;
show('inicio');

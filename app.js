/* =========== CONFIG =========== */
const CONFIG = {
  // Enganxa aquí la "Web app URL" que et dona Apps Script en desplegar Code.gs
  API_URL: 'https://script.google.com/macros/s/AKfycbzyoYdwOOCccEkkb8ngn7GkiQkk2XW2UNpC6vwA61sizxpr12eXLjzTimiyY4iIXtS1/exec',
};

const params = new URLSearchParams(location.search);
const usuari = params.get('u'); // ex: ?u=U13  (també accepta u17sfb / u18de en minuscules, veure NORM_USUARI)

const NORM_USUARI = {
  'u13':'U13', 'u14':'U14', 'u15':'U15', 'u16':'U16',
  'u17sfb':'U17+SFB', 'u17+sfb':'U17+SFB',
  'u18de':'U18+DE', 'u18+de':'U18+DE',
  'lf2':'LF2',
};
// window.CATEGORIA_FIXA la fixen les pàgines d'instal·lació per categoria
// (u13.html, u14.html...) abans de carregar aquest script — així l'app sap
// qui ets sense dependre de cap paràmetre d'URL, que és el que no es
// conserva quan iOS instal·la la pàgina a la pantalla d'inici. index.html
// (sense CATEGORIA_FIXA) continua acceptant ?u=... per a ús directe al navegador.
const USUARI_ACTUAL = window.CATEGORIA_FIXA || (usuari ? (NORM_USUARI[usuari.toLowerCase()] || usuari) : null);

let state = {
  view: 'meuequip',
  data: null,       // resposta de ?action=config
  seleccio: [],      // jugadores triades aquesta sessió { nom, equip, posicio }
  capitana: null,
  subview: 'totes',  // 'totes' | 'equips'
  equipObert: null,  // quin dels 15 equips té obert a la subvista 'equips'
  confirmant: false, // si s'està mostrant la pantalla de resum previ a l'enviament
  equipUsuariObert: null, // quin equip d'un altre usuari està desplegat a Classificació
};

/* Apps Script sempre redirigeix /exec -> script.googleusercontent.com/macros/echo...
   per servir la resposta real. En mode standalone (app instal·lada a la
   pantalla d'inici d'iOS), fetch() falla sovint seguint aquesta redirecció
   concreta ("The string did not match the expected pattern"), tot i que la
   mateixa URL funciona bé en una pestanya normal de Safari. XMLHttpRequest
   no té aquest problema, així que és el que fem servir aquí. */
function xhrJson(method, url, body){
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    if (body != null) xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8'); // evita preflight CORS amb Apps Script
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300){
        reject(new Error('Error del servidor (' + xhr.status + ').'));
        return;
      }
      try { resolve(JSON.parse(xhr.responseText)); }
      catch(e){ reject(new Error('Resposta no vàlida del servidor.')); }
    };
    xhr.onerror = () => reject(new Error('Error de connexió.'));
    xhr.send(body != null ? body : null);
  });
}

async function apiGet(action, extra={}){
  const u = new URL(CONFIG.API_URL);
  u.searchParams.set('action', action);
  Object.entries(extra).forEach(([k,v]) => u.searchParams.set(k,v));
  return xhrJson('GET', u.toString());
}
async function apiPost(body){
  return xhrJson('POST', CONFIG.API_URL, JSON.stringify(body));
}

function posLabel(p){ return {B:'Base', A:'Aler', P:'Pivot'}[p] || p; }

async function init(){
  if (!USUARI_ACTUAL){
    document.getElementById('app').innerHTML =
      '<div class="card"><div class="error-box">Aquest enllaç no identifica cap categoria. Demana l\'enllaç correcte a l\'organització (ha de portar ?u=... al final).</div></div>';
    return;
  }
  document.getElementById('header-sub').textContent = USUARI_ACTUAL;
  try{
    state.data = await apiGet('config', { u: USUARI_ACTUAL });
    if (!state.data.ok) throw new Error(state.data.error);
  } catch(err){
    document.getElementById('app').innerHTML = '<div class="card"><div class="error-box">No s\'ha pogut connectar amb el full de dades. ' + err.message + '</div></div>';
    return;
  }
  if (state.data.meuEquip){
    state.seleccio = state.data.meuEquip.jugadores.map(j => ({nom:j.nom, equip:j.equip, posicio:j.posicio}));
    state.capitana = (state.data.meuEquip.jugadores.find(j=>j.capitana) || {}).nom || null;
  }
  render();
  document.querySelectorAll('nav.bottom button').forEach(btn=>{
    btn.addEventListener('click', () => { state.view = btn.dataset.view; render(); });
  });
}

function render(){
  document.querySelectorAll('nav.bottom button').forEach(b=>{
    b.classList.toggle('active', b.dataset.view === state.view);
  });
  const app = document.getElementById('app');
  if (state.view === 'meuequip') app.innerHTML = viewMeuEquip();
  else if (state.view === 'escollir') { app.innerHTML = viewEscollir(); bindEscollir(); }
  else if (state.view === 'classificacio') { app.innerHTML = '<div class="loading">Carregant classificació…</div>'; loadClassificacio(); }
  else if (state.view === 'preguntes') { app.innerHTML = viewPreguntes(); bindPreguntes(); }
}

/* ---------- VISTA: EL MEU EQUIP ---------- */
function viewMeuEquip(){
  const jornada = state.data.jornada;
  if (state.data.jaEnviat){
    const jugs = ordenaPerPosicio(state.data.meuEquip.jugadores);
    const rows = jugs.map(j => `
      <div class="player-row">
        <div>
          <div class="player-name">${j.nom} ${j.capitana ? '<span class="pill">Capitana</span>' : ''}</div>
          <div class="player-meta">${j.equip} · ${posLabel(j.posicio)}</div>
        </div>
      </div>`).join('');
    return `
      <div class="card">
        <div class="row"><h2>Jornada ${jornada}</h2><span class="pill ok">Enviat</span></div>
        ${rows}
      </div>
      <div class="empty">Per canviar l'equip d'aquesta jornada, contacta l'organització.</div>
    `;
  }
  return `
    <div class="card">
      <div class="row"><h2>Jornada ${jornada}</h2><span class="pill bad">Sense enviar</span></div>
      <p style="color:var(--text-dim); font-size:13.5px; margin:6px 0 12px;">Encara no has enviat l'equip d'aquesta jornada.</p>
      <button class="btn-primary" onclick="state.view='escollir'; render();">Escollir equip</button>
    </div>
  `;
}

/* ---------- VISTA: ESCOLLIR EQUIP ---------- */
function contaPosicio(pos){ return state.seleccio.filter(j=>j.posicio===pos).length; }
function contaEstrelles(pos){
  return state.seleccio.filter(j => {
    const info = infoJugadora(j.nom, j.equip);
    return info && info.estrella && (!pos || j.posicio===pos);
  }).length;
}
function jaTriada(nom, equip){ return state.seleccio.some(j=>j.nom===nom && j.equip===equip); }
function infoJugadora(nom, equip){ return state.data.pool.find(p=>p.nom===nom && p.equip===equip); }

function toggleJugadora(nom, equip){
  if (jaTriada(nom, equip)){
    state.seleccio = state.seleccio.filter(j=>!(j.nom===nom && j.equip===equip));
    if (state.capitana === nom) state.capitana = null;
  } else {
    const info = infoJugadora(nom, equip);
    if (state.seleccio.length >= 9) return;
    if (contaPosicio(info.posicio) >= 3) return;
    if (info.estrella && (contaEstrelles() >= 3 || contaEstrelles(info.posicio) >= 2)) return;
    state.seleccio.push({ nom, equip, posicio: info.posicio });
  }
  render();
}

function viewEscollir(){
  if (state.data.jaEnviat){
    return `<div class="card"><div class="ok-box">Ja has enviat l'equip d'aquesta jornada. Consulta'l a "El meu equip".</div></div>`;
  }
  if (state.confirmant){
    return viewConfirmacio();
  }
  const pool = state.data.pool;
  const equips = [...new Set(pool.map(p=>p.equip))];

  let llistatHtml;
  if (state.subview === 'totes'){
    llistatHtml = ordenaPerPosicio(pool).map(p => filaJugadora(p)).join('');
  } else {
    if (!state.equipOert && !state.equipObert) state.equipObert = null;
    if (state.equipObert){
      const jugs = ordenaPerPosicio(pool.filter(p=>p.equip===state.equipObert));
      llistatHtml = `
        <button class="btn-secondary" style="margin-bottom:10px;" onclick="state.equipObert=null; render();">‹ Tots els equips</button>
        ${jugs.map(p=>filaJugadora(p)).join('')}
      `;
    } else {
      llistatHtml = `<div class="team-chip-list">` + equips.map(eq => {
        const n = pool.filter(p=>p.equip===eq).length;
        const triades = state.seleccio.filter(j=>j.equip===eq).length;
        return `<button class="team-chip" onclick="state.equipObert='${eq}'; render();">
          <span>${eq}</span><span class="count">${triades>0 ? triades+' triades · ' : ''}${n} jugadores</span>
        </button>`;
      }).join('') + `</div>`;
    }
  }

  const posOk = ['B','A','P'].every(p => contaPosicio(p) === 3);
  const equipsCoberts = new Set(state.seleccio.map(j=>j.equip));
  const equipsFaltants = state.data.equipsActius.filter(eq => !equipsCoberts.has(eq));

  return `
    <div class="card">
      <div class="row"><h2>Jornada ${state.data.jornada} · resum</h2><span class="pill">${state.seleccio.length}/9</span></div>
      <div class="row" style="font-size:12.5px; color:var(--text-dim); margin-top:2px;">
        <span>Bases: ${contaPosicio('B')}/3</span><span>Alers: ${contaPosicio('A')}/3</span><span>Pivots: ${contaPosicio('P')}/3</span>
      </div>
      <div class="row" style="font-size:12.5px; color:var(--text-dim); margin-top:4px;">
        <span>★ Estrelles: ${contaEstrelles()}/3</span>
      </div>
      ${equipsFaltants.length ? `<div class="error-box" style="margin-top:10px;">Falten equips per cobrir: ${equipsFaltants.join(', ')}</div>` : ''}
      ${state.seleccio.length===9 ? capitanaPicker() : ''}
    </div>

    <div class="card">
      <div class="tabs-sub">
        <button class="${state.subview==='totes'?'active':''}" onclick="state.subview='totes'; state.equipObert=null; render();">Totes les jugadores</button>
        <button class="${state.subview==='equips'?'active':''}" onclick="state.subview='equips'; render();">Per equip</button>
      </div>
      ${llistatHtml}
    </div>

    <button class="btn-primary" id="btn-enviar" ${validEnviament() ? '' : 'disabled'}>Revisar i enviar</button>
  `;
}

const ORDRE_POSICIO = { B: 0, A: 1, P: 2 };
function ordenaPerPosicio(jugs){
  return jugs.slice().sort((a,b) => ORDRE_POSICIO[a.posicio] - ORDRE_POSICIO[b.posicio]);
}

function viewConfirmacio(){
  const files = ordenaPerPosicio(state.seleccio);
  const rows = files.map(j => `
    <div class="player-row">
      <div>
        <div class="player-name">${j.nom} ${j.nom===state.capitana ? '<span class="pill">Capitana</span>' : ''}</div>
        <div class="player-meta">${j.equip} · ${posLabel(j.posicio)}</div>
      </div>
    </div>
  `).join('');
  return `
    <div class="card">
      <h2>Revisa el teu equip abans d'enviar</h2>
      <p style="color:var(--text-dim); font-size:12.5px; margin:0 0 10px;">Un cop enviat no es podrà modificar. Jornada ${state.data.jornada}.</p>
      ${rows}
    </div>
    <button class="btn-primary" id="btn-confirmar-enviar">Confirmar i enviar</button>
    <button class="btn-secondary" style="width:100%; margin-top:8px; padding:12px;" onclick="state.confirmant=false; render();">‹ Tornar enrere i editar</button>
    <div id="enviar-missatge"></div>
  `;
}

function filaJugadora(p){
  const triada = jaTriada(p.nom, p.equip);
  const posicioPlena = contaPosicio(p.posicio) >= 3;
  const estrellaBloquejada = p.estrella && !triada && (contaEstrelles() >= 3 || contaEstrelles(p.posicio) >= 2);
  const ple = !triada && (state.seleccio.length >= 9 || posicioPlena || estrellaBloquejada);
  return `
    <div class="player-row">
      <div>
        <div class="player-name">${p.nom}${p.estrella ? '<span class="star">★</span>' : ''}</div>
        <div class="player-meta">${p.equip} · ${posLabel(p.posicio)}${p.origen!=='propi' ? ' · '+p.origen : ''}</div>
      </div>
      ${triada
        ? `<button class="btn-remove" onclick="toggleJugadora('${escNom(p.nom)}','${p.equip}')">Treure</button>`
        : `<button class="btn-add" ${ple?'disabled':''} onclick="toggleJugadora('${escNom(p.nom)}','${p.equip}')">Afegir</button>`}
    </div>
  `;
}
function escNom(n){ return n.replace(/'/g, "\\'"); }

function capitanaPicker(){
  const opcions = state.seleccio.map(j=>`<option value="${j.nom}" ${state.capitana===j.nom?'selected':''}>${j.nom} (${j.equip})</option>`).join('');
  return `
    <div style="margin-top:12px;">
      <label style="font-size:12.5px; color:var(--text-dim);">Capitana (puntuació x2)</label>
      <select class="capitana-select" onchange="state.capitana=this.value; render();">
        <option value="">— Selecciona —</option>
        ${opcions}
      </select>
    </div>
  `;
}

function validEnviament(){
  return state.seleccio.length===9
    && ['B','A','P'].every(p=>contaPosicio(p)===3)
    && state.data.equipsActius.every(eq => state.seleccio.some(j=>j.equip===eq))
    && !!state.capitana;
}

function bindEscollir(){
  const btnRevisar = document.getElementById('btn-enviar');
  if (btnRevisar) btnRevisar.addEventListener('click', () => { state.confirmant = true; render(); });
  const btnConfirmar = document.getElementById('btn-confirmar-enviar');
  if (btnConfirmar) btnConfirmar.addEventListener('click', enviarEquip);
}

async function enviarEquip(){
  const btn = document.getElementById('btn-confirmar-enviar');
  btn.disabled = true; btn.textContent = 'Enviant…';
  try{
    const resp = await apiPost({
      usuari: USUARI_ACTUAL,
      jugadors: state.seleccio,
      capitana: state.capitana,
    });
    const msg = document.getElementById('enviar-missatge');
    if (resp.ok){
      msg.innerHTML = '<div class="ok-box">Equip enviat correctament!</div>';
      state.data.jaEnviat = true;
      state.confirmant = false;
      state.view = 'meuequip';
      setTimeout(async () => { state.data = await apiGet('config', {u:USUARI_ACTUAL}); render(); }, 600);
    } else {
      msg.innerHTML = '<div class="error-box">' + resp.error + '</div>';
      btn.disabled = false; btn.textContent = 'Confirmar i enviar';
    }
  } catch(err){
    document.getElementById('enviar-missatge').innerHTML = '<div class="error-box">Error de connexió: ' + err.message + '</div>';
    btn.disabled = false; btn.textContent = 'Confirmar i enviar';
  }
}

/* ---------- VISTA: CLASSIFICACIÓ ---------- */
async function loadClassificacio(){
  try{
    const resp = await apiGet('classificacio');
    if (!resp.ok) throw new Error(resp.error);
    const global = resp.global.slice().sort((a,b)=> Number(b.Punts_totals_acumulats||0) - Number(a.Punts_totals_acumulats||0));
    const rows = global.map(g => `
      <div class="rank-row">
        <div class="rank-num"></div>
        <div>${g.Usuari}</div>
        <div class="rank-points">${Number(g.Punts_totals_acumulats||0).toFixed(1)}</div>
      </div>
    `).join('');

    let equipsHtml = '';
    if (resp.mostrarEquips && resp.equipsUsuaris){
      const usuaris = Object.keys(resp.equipsUsuaris);
      equipsHtml = `
        <div class="card">
          <h2>Equips de la jornada ${resp.jornadaMostrada}</h2>
          ${usuaris.map(u => {
            const jugs = ordenaPerPosicio(resp.equipsUsuaris[u]);
            const obert = state.equipUsuariObert === u;
            return `
              <button class="team-chip" style="margin-bottom:8px;" onclick="state.equipUsuariObert = state.equipUsuariObert==='${u}' ? null : '${u}'; render();">
                <span>${u}</span><span class="count">${obert ? 'amagar' : 'veure equip'}</span>
              </button>
              ${obert ? jugs.map(j => `
                <div class="player-row">
                  <div>
                    <div class="player-name">${j.nom} ${j.capitana ? '<span class="pill">Capitana</span>' : ''}</div>
                    <div class="player-meta">${j.equip} · ${posLabel(j.posicio)}</div>
                  </div>
                </div>
              `).join('') : ''}
            `;
          }).join('')}
        </div>
      `;
    }

    document.getElementById('app').innerHTML = `
      <div class="card">
        <h2>Classificació general</h2>
        ${rows || '<div class="empty">Encara no hi ha punts registrats.</div>'}
      </div>
      ${equipsHtml}
    `;
  } catch(err){
    document.getElementById('app').innerHTML = `<div class="card"><div class="error-box">No s'ha pogut carregar la classificació. ${err.message}</div></div>`;
  }
}

/* ---------- VISTA: PREGUNTES ---------- */
function campPregunta(id, label, valor, disabled){
  return `
    <div style="margin-bottom:14px;">
      <label style="font-size:12.5px; color:var(--text-dim); display:block; margin-bottom:5px;">${label}</label>
      <input type="text" id="${id}" value="${valor ? String(valor).replace(/"/g,'&quot;') : ''}" ${disabled?'disabled':''} placeholder="La teva resposta" />
    </div>
  `;
}

function viewPreguntes(){
  const p = state.data.preguntes || {};
  const enviat = !!state.data.respostes;
  const r = state.data.respostes || {};

  if (!p.average && !p.p2 && !p.p3){
    return `<div class="card"><div class="empty">Encara no hi ha preguntes publicades per a aquesta jornada.</div></div>`;
  }

  let camps = '';
  camps += campPregunta('resp-average', 'Pregunta de l\'average: ' + p.average, r.average, enviat);
  if (p.p2) camps += campPregunta('resp-p2', p.p2, r.p2, enviat);
  if (p.p3) camps += campPregunta('resp-p3', p.p3, r.p3, enviat);

  return `
    <div class="card">
      <div class="row"><h2>Preguntes · Jornada ${state.data.jornada}</h2>${enviat ? '<span class="pill ok">Enviades</span>' : '<span class="pill bad">Sense enviar</span>'}</div>
      ${camps}
      ${enviat
        ? `<div class="ok-box">Respostes enviades. Per canviar-les, contacta l'organització.</div>`
        : `<button class="btn-primary" id="btn-enviar-preguntes">Enviar respostes</button>`}
      <div id="preguntes-missatge"></div>
    </div>
  `;
}

function bindPreguntes(){
  const btn = document.getElementById('btn-enviar-preguntes');
  if (btn) btn.addEventListener('click', enviarRespostes);
}

async function enviarRespostes(){
  const btn = document.getElementById('btn-enviar-preguntes');
  btn.disabled = true; btn.textContent = 'Enviant…';
  const respostes = {
    average: (document.getElementById('resp-average') || {}).value || '',
    p2: (document.getElementById('resp-p2') || {}).value || '',
    p3: (document.getElementById('resp-p3') || {}).value || '',
  };
  try{
    const resp = await apiPost({ usuari: USUARI_ACTUAL, tipus: 'respostes', respostes });
    const msg = document.getElementById('preguntes-missatge');
    if (resp.ok){
      state.data.respostes = respostes;
      render();
    } else {
      msg.innerHTML = '<div class="error-box">' + resp.error + '</div>';
      btn.disabled = false; btn.textContent = 'Enviar respostes';
    }
  } catch(err){
    document.getElementById('preguntes-missatge').innerHTML = '<div class="error-box">Error de connexió: ' + err.message + '</div>';
    btn.disabled = false; btn.textContent = 'Enviar respostes';
  }
}

init();

if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(()=>{}));
}

/**
 * SUPERMANAGER MCBF 26/27 — Codis d'accés
 *
 * Cada participant té un codi. L'app el desa al mòbil i l'envia a cada petició; el
 * servidor el tradueix a participant i no es refia mai del paràmetre `u`. Sense això,
 * qualsevol que tingués l'URL de l'`/exec` podia enviar l'equip d'un altre.
 *
 * COM INSTAL·LAR-HO
 * 1. Enganxa aquest fitxer com un fitxer nou `Auth` al mateix projecte d'Apps Script.
 * 2. Menú `Supermanager → Crear codis d'accés`: crea la pestanya `Codis` amb un codi
 *    per participant. Els codis no són al repositori: els genera el full.
 * 3. Al `Code.gs` desplegat, canvia dues línies (només dues):
 *
 *      dins de `doGet(e)`:
 *        - const usuari = e.parameter.u;
 *        + const usuari = auth_resolUsuari_(e.parameter);
 *
 *      dins de `doPost(e)`:
 *        - const usuari = body.usuari;
 *        + const usuari = auth_resolUsuari_(body);
 *
 * 4. Desplegar → Gestiona implementacions → llapis → Versió nova. Mateixa URL.
 *
 * `AUTH_PERMET_SENSE_CODI` està a `false`: sense codi no es contesta res. Va néixer com
 * un interruptor per no deixar penjat ningú que ja tingués l'app instal·lada, però com
 * que encara no s'havia repartit, no hi ha ningú a qui esperar.
 */

const AUTH_PERMET_SENSE_CODI = false;

const AUTH = {
  FULL: 'Codis',
  COL_CODI: 'Codi',
  COL_USUARI: 'Usuari',
  COL_ACTIU: 'Actiu',
};

/** Alfabet sense caràcters que es confonen en llegir-los en veu alta: ni O/0 ni I/1. */
const AUTH_ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AUTH_LLARGADA = 6;

/** ---------- EL QUE FA SERVIR EL WEB APP ---------- */

/**
 * Qui és qui fa la petició. Rep l'objecte de paràmetres (d'un GET) o el cos (d'un POST).
 *
 * MAI no llança. Al `doGet` desplegat, la línia que crida aquesta funció és **abans**
 * del `try`, de manera que una excepció s'escaparia del `catch` i Apps Script respondria
 * amb la seva pàgina d'error HTML en comptes del JSON que espera l'app. Per això, quan
 * el codi no val, retornem un nom de participant que no existeix: la validació que ja hi
 * ha (`USUARIS_VALIDS`) el rebutja dins del `try` i l'error surt en JSON com cal.
 */
function auth_resolUsuari_(params) {
  params = params || {};
  const codi = String(params.codi || '').trim();

  if (codi) return auth_usuariPerCodi_(codi) || '(codi no vàlid)';
  if (AUTH_PERMET_SENSE_CODI) return params.u || params.usuari || '';
  return '(sense codi)';
}

/** Retorna el participant d'un codi actiu, o null. No distingeix majúscules ni espais. */
function auth_usuariPerCodi_(codi) {
  const sh = sd_ss_().getSheetByName(AUTH.FULL);
  if (!sh) return null;

  const cap = sd_capcalera_(sh);
  const iCodi = cap.indexOf(AUTH.COL_CODI);
  const iUsuari = cap.indexOf(AUTH.COL_USUARI);
  const iActiu = cap.indexOf(AUTH.COL_ACTIU);
  if (iCodi === -1 || iUsuari === -1) return null;

  const net = auth_neteja_(codi);
  const files = sd_valors_(sh, cap.length);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (auth_neteja_(f[iCodi]) !== net) continue;
    if (iActiu !== -1 && String(f[iActiu]).trim().toUpperCase() === 'NO') return null;
    return String(f[iUsuari]).trim();
  }
  return null;
}

function auth_neteja_(codi) {
  return String(codi || '').replace(/[\s-]/g, '').toUpperCase();
}

/** ---------- CREAR ELS CODIS ---------- */

function creaCodisAmbAvis() {
  const ui = SpreadsheetApp.getUi();
  const sh = sd_ss_().getSheetByName(AUTH.FULL);
  if (sh && sh.getLastRow() > 1) {
    const r = ui.alert('Crear codis d\'accés',
      'La pestanya "Codis" ja existeix i té codis. Vols afegir-hi només els participants ' +
      'que encara no en tinguin? Els codis que ja hi ha no es tocaran.',
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  const n = creaCodis();
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sd_full_(AUTH.FULL));
  SpreadsheetApp.getActiveSpreadsheet().toast(
    n ? n + ' codis nous creats.' : 'Tothom ja tenia codi, no s\'ha creat res.',
    'Supermanager', 6);
}

/**
 * Crea la pestanya `Codis` si cal i hi posa un codi per cada participant que no en
 * tingui. Mai no reescriu un codi existent: si algú ja té el seu apuntat, li segueix
 * servint.
 */
function creaCodis() {
  const ss = sd_ss_();
  let sh = ss.getSheetByName(AUTH.FULL);
  if (!sh) {
    sh = ss.insertSheet(AUTH.FULL);
    sh.getRange(1, 1, 1, 4).setValues([[AUTH.COL_CODI, AUTH.COL_USUARI, 'Nom', AUTH.COL_ACTIU]])
      .setFontWeight('bold').setBackground('#f2f2f2');
    sh.setColumnWidth(1, 110);
    sh.setColumnWidth(2, 110);
    sh.setColumnWidth(3, 220);
    sh.setFrozenRows(1);
  }

  const cap = sd_capcalera_(sh);
  const iCodi = cap.indexOf(AUTH.COL_CODI);
  const iUsuari = cap.indexOf(AUTH.COL_USUARI);
  if (iCodi === -1 || iUsuari === -1) {
    throw new Error('La pestanya "Codis" ha de tenir les columnes "Codi" i "Usuari".');
  }

  const files = sd_valors_(sh, cap.length);
  const jaTenen = {};
  const usats = {};
  files.forEach(f => {
    const u = String(f[iUsuari] || '').trim();
    if (u) jaTenen[u] = true;
    const c = auth_neteja_(f[iCodi]);
    if (c) usats[c] = true;
  });

  const noves = [];
  auth_participants_().forEach(u => {
    if (jaTenen[u]) return;
    const codi = auth_codiNou_(usats);
    usats[codi] = true;
    const fila = new Array(cap.length).fill('');
    fila[iCodi] = codi;
    fila[iUsuari] = u;
    const iActiu = cap.indexOf(AUTH.COL_ACTIU);
    if (iActiu !== -1) fila[iActiu] = 'SI';
    noves.push(fila);
  });

  if (noves.length) {
    sh.getRange(sh.getLastRow() + 1, 1, noves.length, cap.length).setValues(noves);
  }
  return noves.length;
}

/** Els participants: els que surten a `Classificacio`, que és la llista de qui juga. */
function auth_participants_() {
  const sh = sd_full_('Classificacio');
  const cap = sd_capcalera_(sh);
  const i = sd_exigeixColumna_(cap, 'Usuari', 'Classificacio');
  const vistos = [];
  sd_valors_(sh, cap.length).forEach(f => {
    const u = String(f[i] || '').trim();
    if (u && vistos.indexOf(u) === -1) vistos.push(u);
  });
  return vistos;
}

function auth_codiNou_(usats) {
  for (let intent = 0; intent < 200; intent++) {
    let codi = '';
    for (let i = 0; i < AUTH_LLARGADA; i++) {
      codi += AUTH_ALFABET.charAt(Math.floor(Math.random() * AUTH_ALFABET.length));
    }
    if (!usats[codi]) return codi;
  }
  throw new Error('No s\'ha pogut generar un codi nou.');
}

/** ---------- HORA LÍMIT PER ENVIAR L'EQUIP ---------- */

/**
 * Cada jornada pot tenir una hora de tancament a la columna `Tancament` de `Jornades`:
 * normalment, quan comença el primer partit. A partir d'aquella hora el servidor deixa
 * d'acceptar equips i respostes.
 *
 * Ho comprova el servidor i no l'app, perquè si ho decidís el mòbil n'hi hauria prou amb
 * canviar-li l'hora per saltar-se el límit. L'app només ho ensenya.
 *
 * Si la casella és buida, aquella jornada no té límit i tot segueix com fins ara.
 *
 * AL `Code.gs`, dins de `doPost(e)`, just després de la línia de `const usuari`:
 *
 *     auth_exigeixObert_();
 */

const AUTH_COL_TANCAMENT = 'Tancament';

/** L'hora de tancament de la jornada, o null si aquella jornada no en té. */
function auth_tancament_(jornada) {
  const sh = sd_ss_().getSheetByName('Jornades');
  if (!sh) return null;

  const cap = sd_capcalera_(sh);
  const iJor = cap.indexOf('Jornada');
  const iTanca = cap.indexOf(AUTH_COL_TANCAMENT);
  if (iJor === -1 || iTanca === -1) return null;

  if (jornada === undefined) jornada = sd_jornadaActual_();

  const files = sd_valors_(sh, cap.length);
  for (let i = 0; i < files.length; i++) {
    if (Number(files[i][iJor]) !== Number(jornada)) continue;
    const v = files[i][iTanca];
    if (v instanceof Date) return v;
    if (sd_buit_(v)) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Que hi ha al `config` perquè l'app ho pugui ensenyar. */
function auth_estatTancament_(jornada) {
  const tanca = auth_tancament_(jornada);
  if (!tanca) return { tancament: null, tancat: false };
  return {
    tancament: Utilities.formatDate(tanca, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"),
    tancat: new Date().getTime() >= tanca.getTime(),
  };
}

/** Llança si la jornada ja està tancada. Va dins del `try` del `doPost`. */
function auth_exigeixObert_(jornada) {
  const tanca = auth_tancament_(jornada);
  if (!tanca) return;
  if (new Date().getTime() < tanca.getTime()) return;
  throw new Error('Les tries d\'aquesta jornada es van tancar el ' +
    Utilities.formatDate(tanca, Session.getScriptTimeZone(), "d/MM 'a les' HH:mm") + '.');
}

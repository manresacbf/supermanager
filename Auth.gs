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
 * MENTRE DURA LA MUDANÇA
 * `AUTH_PERMET_SENSE_CODI` deixa passar les peticions sense codi, perquè les pàgines
 * per categoria que la gent ja té instal·lades (u13.html, u17sfb.html…) segueixin
 * funcionant. Quan tothom hagi entrat el seu codi a la pàgina nova, posa-ho a `false`
 * i esborra aquelles pàgines: fins llavors, el codi no protegeix de res.
 */

const AUTH_PERMET_SENSE_CODI = true;

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
 * Llança si el codi no val, de manera que el web app ja respon amb l'error.
 */
function auth_resolUsuari_(params) {
  params = params || {};
  const codi = String(params.codi || '').trim();

  if (codi) {
    const usuari = auth_usuariPerCodi_(codi);
    if (!usuari) throw new Error('El codi no és correcte. Demana el teu a l\'organització.');
    return usuari;
  }

  if (AUTH_PERMET_SENSE_CODI) return params.u || params.usuari || '';
  throw new Error('Cal entrar el codi d\'accés.');
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

/**
 * SUPERMANAGER MCBF 26/27 — Pestanya d'entrada de resultats
 *
 * PER QUÈ EXISTEIX
 * `Resultats_jugadores` té una fila per cada jugadora i cada equip: 87 files, 174
 * caselles. Però cada jornada només hi ha unes 22 jugadores que algú hagi triat; la
 * resta no les mira ningú. Buscar-les una a una en una llista sense ordre és el que
 * feia que l'equip que entra els resultats s'hi encallés.
 *
 * Aquesta pestanya és la llista curta: només les jugadores triades, agrupades per
 * equip i en ordre B/A/P, amb les mateixes marques que feien servir al seu full
 * (★ per estrella, "dobla de U16" per als doblatges) i la columna de qui l'ha triat.
 *
 * COM ES FA SERVIR
 *   1. Un cop tancades les tries: menú `Supermanager → Preparar entrada de resultats`.
 *   2. S'omplen les columnes PUNTS i FALTES. Jugadora que no va jugar, es deixa buida.
 *   3. Menú `Supermanager → Desar resultats entrats` → ho bolca a `Resultats_jugadores`.
 *
 * Es pot preparar i desar tantes vegades com calgui: en preparar-la, les caselles
 * surten amb el que ja hi hagi desat, de manera que es pot corregir i tornar a desar.
 *
 * DEPÈN DE `Doblatges.gs`: fa servir les seves funcions auxiliars (`sd_full_`,
 * `sd_capcalera_`, `sd_valors_`, `sd_jornadaActual_`…). Han d'estar tots dos al
 * mateix projecte d'Apps Script.
 */

const SE = {
  ENTRADA: 'Entrada_resultats',
  EQUIPS_USUARI: 'Equips_usuari',
  JUGADORES: 'Jugadores',
  RESULTATS: 'Resultats_jugadores',
};

/** Columnes de la pestanya d'entrada (1-based). */
const SE_COL = { POSICIO: 1, NOM: 2, PUNTS: 3, FALTES: 4, MARQUES: 5, TRIADA: 6 };
const SE_AMPLADA = 6;

const SE_ORDRE_POSICIO = { B: 0, A: 1, P: 2 };

/** ---------- PREPARAR ---------- */

function preparaEntradaResultatsAmbAvis() {
  const r = preparaEntradaResultats();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!r.jugadores) {
    ss.toast(
      'Jornada ' + r.jornada + ': encara no hi ha cap equip enviat, així que no hi ha res a puntuar.',
      'Supermanager', 8);
    return;
  }
  ss.setActiveSheet(sd_full_(SE.ENTRADA));
  ss.toast(
    'Jornada ' + r.jornada + ': ' + r.jugadores + ' jugadores a puntuar, de ' + r.equips + ' equips.',
    'Supermanager', 6);
}

/** Genera la llista curta de la jornada actual. */
function preparaEntradaResultats() {
  const jornada = sd_jornadaActual_();
  const triades = se_triadesDe_(jornada);
  const info = se_infoJugadores_();
  const desats = se_resultatsDe_(jornada);

  // Una entrada per parella (jugadora, equip) que hagi triat algú.
  const llista = Object.keys(triades).map(clau => {
    const t = triades[clau];
    const i = info[clau] || {};
    const d = desats[clau] || {};
    return {
      equip: t.equip,
      nom: t.nom,
      posicio: i.posicio || t.posicio || '',
      estrella: !!i.estrella,
      origen: i.origen || '',
      punts: sd_buit_(d.punts) ? '' : d.punts,
      faltes: sd_buit_(d.faltes) ? '' : d.faltes,
      usuaris: t.usuaris,
    };
  });

  const equips = se_equipsOrdenats_(llista);
  const sh = se_preparaFull_();

  const files = [];
  files.push(['ENTRADA DE RESULTATS · JORNADA ' + jornada, '', '', '', '', '']);
  files.push(['Omple PUNTS i FALTES. Jugadora que no va jugar, deixa-la en blanc.',
    '', '', '', '', '']);
  files.push(['Quan acabis: menú Supermanager → Desar resultats entrats.', '', '', '', '', '']);
  files.push(['', '', '', '', '', '']);

  const marques = [];   // files que són capçalera de bloc o títol, per pintar-les després
  const editables = []; // rangs de PUNTS/FALTES

  equips.forEach(equip => {
    const jugs = llista.filter(j => j.equip === equip).sort(se_compara_);
    marques.push({ fila: files.length + 1, tipus: 'equip' });
    files.push(['EQUIP', equip, '', '', '', '']);
    marques.push({ fila: files.length + 1, tipus: 'capcalera' });
    files.push(['POSICIÓ', 'NOM', 'PUNTS', 'FALTES', '', 'TRIADA PER']);
    const inici = files.length + 1;
    jugs.forEach(j => {
      files.push([
        j.posicio,
        j.nom,
        j.punts,
        j.faltes,
        se_marques_(j),
        j.usuaris.join(', '),
      ]);
    });
    editables.push({ inici: inici, n: jugs.length });
    files.push(['', '', '', '', '', '']);
  });

  if (files.length) {
    sh.getRange(1, 1, files.length, SE_AMPLADA).setValues(files);
  }
  se_pintaFull_(sh, files.length, marques, editables);

  return { jornada: jornada, jugadores: llista.length, equips: equips.length };
}

/** "★" i/o "dobla de U16" */
function se_marques_(j) {
  const parts = [];
  if (j.estrella) parts.push('★');
  if (j.origen) parts.push(String(j.origen).replace(/^dobla\s*\(?/, 'dobla de ').replace(/\)$/, ''));
  return parts.join(' · ');
}

function se_compara_(a, b) {
  const pa = SE_ORDRE_POSICIO[a.posicio], pb = SE_ORDRE_POSICIO[b.posicio];
  if (pa !== pb) return (pa === undefined ? 9 : pa) - (pb === undefined ? 9 : pb);
  return a.nom.localeCompare(b.nom, 'ca');
}

/** Els equips en l'ordre en què surten a `Jugadores`, per no barrejar-los cada setmana. */
function se_equipsOrdenats_(llista) {
  const sh = sd_full_(SE.JUGADORES);
  const cap = sd_capcalera_(sh);
  const iEquip = sd_exigeixColumna_(cap, 'Equip', SE.JUGADORES);
  const ordre = [];
  sd_valors_(sh, cap.length).forEach(f => {
    const e = String(f[iEquip] || '').trim();
    if (e && ordre.indexOf(e) === -1) ordre.push(e);
  });
  const presents = {};
  llista.forEach(j => (presents[j.equip] = true));
  const dins = ordre.filter(e => presents[e]);
  // Per si algun equip de la llista no surt a `Jugadores`, que no es perdi.
  Object.keys(presents).forEach(e => { if (dins.indexOf(e) === -1) dins.push(e); });
  return dins;
}

/** ---------- DESAR ---------- */

function desaResultatsEntratsAmbAvis() {
  const r = desaResultatsEntrats();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Jornada ' + r.jornada + ': ' + r.desades + ' jugadores desades' +
    (r.buides ? ', ' + r.buides + ' en blanc' : '') + '.',
    'Supermanager', 6);
}

/** Bolca el que hi hagi a `Entrada_resultats` cap a `Resultats_jugadores`. */
function desaResultatsEntrats() {
  const sh = sd_full_(SE.ENTRADA);
  const jornada = se_jornadaDelFull_(sh);
  const valors = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), SE_AMPLADA).getValues();

  const canvis = [];
  let equip = '';
  let buides = 0;

  valors.forEach(f => {
    const a = String(f[SE_COL.POSICIO - 1] || '').trim();
    if (a.toUpperCase() === 'EQUIP') { equip = String(f[SE_COL.NOM - 1] || '').trim(); return; }
    if (a.toUpperCase() === 'POSICIÓ' || a.toUpperCase() === 'POSICIO') return;
    const nom = String(f[SE_COL.NOM - 1] || '').trim();
    if (!nom || !equip) return;
    const punts = f[SE_COL.PUNTS - 1];
    const faltes = f[SE_COL.FALTES - 1];
    if (sd_buit_(punts) && sd_buit_(faltes)) { buides++; return; }
    canvis.push({ nom: nom, equip: equip, punts: punts, faltes: faltes });
  });

  const desades = se_aplicaResultats_(jornada, canvis);
  return { jornada: jornada, desades: desades, buides: buides };
}

/** Escriu (o actualitza) les files corresponents de `Resultats_jugadores`. */
function se_aplicaResultats_(jornada, canvis) {
  if (!canvis.length) return 0;

  const sh = sd_full_(SE.RESULTATS);
  const cap = sd_capcalera_(sh);
  const iJor = sd_exigeixColumna_(cap, 'Jornada', SE.RESULTATS);
  const iNom = sd_exigeixColumna_(cap, 'Nom', SE.RESULTATS);
  const iPunts = sd_exigeixColumna_(cap, 'Punts', SE.RESULTATS);
  const iFaltes = sd_exigeixColumna_(cap, 'Faltes', SE.RESULTATS);
  const iEquip = sd_asseguraColumna_(sh, cap, 'Equip');
  const nCols = cap.length;

  const valors = sd_valors_(sh, nCols);
  const fila = {};
  valors.forEach((f, i) => {
    if (Number(f[iJor]) !== Number(jornada)) return;
    fila[sd_clau_(f[iNom], f[iEquip])] = i; // índex dins de `valors`
  });

  const noves = [];
  canvis.forEach(c => {
    const k = sd_clau_(c.nom, c.equip);
    if (k in fila) {
      valors[fila[k]][iPunts] = c.punts;
      valors[fila[k]][iFaltes] = c.faltes;
      return;
    }
    const f = new Array(nCols).fill('');
    f[iJor] = jornada;
    f[iNom] = c.nom;
    f[iEquip] = c.equip;
    f[iPunts] = c.punts;
    f[iFaltes] = c.faltes;
    noves.push(f);
  });

  if (valors.length) sh.getRange(2, 1, valors.length, nCols).setValues(valors);
  if (noves.length) sh.getRange(sh.getLastRow() + 1, 1, noves.length, nCols).setValues(noves);
  return canvis.length;
}

/** ---------- AJUDES ---------- */

/** Parelles (jugadora, equip) que ha triat algú, amb la llista de qui les ha triat. */
function se_triadesDe_(jornada) {
  const sh = sd_full_(SE.EQUIPS_USUARI);
  const cap = sd_capcalera_(sh);
  const iJor = sd_exigeixColumna_(cap, 'Jornada', SE.EQUIPS_USUARI);
  const iUsuari = sd_exigeixColumna_(cap, 'Usuari', SE.EQUIPS_USUARI);
  const iNom = sd_exigeixColumna_(cap, 'Jugadora', SE.EQUIPS_USUARI);
  const iEquip = sd_exigeixColumna_(cap, 'Equip_jugadora', SE.EQUIPS_USUARI);
  const iPos = cap.indexOf('Posicio');

  const out = {};
  sd_valors_(sh, cap.length).forEach(f => {
    if (Number(f[iJor]) !== Number(jornada)) return;
    const nom = String(f[iNom] || '').trim();
    const equip = String(f[iEquip] || '').trim();
    if (!nom || !equip) return;
    const k = sd_clau_(nom, equip);
    if (!out[k]) {
      out[k] = {
        nom: nom, equip: equip,
        posicio: iPos === -1 ? '' : String(f[iPos] || '').trim(),
        usuaris: [],
      };
    }
    const u = String(f[iUsuari] || '').trim();
    if (u && out[k].usuaris.indexOf(u) === -1) out[k].usuaris.push(u);
  });
  return out;
}

/** Posició, estrella i origen de cada parella (jugadora, equip) de `Jugadores`. */
function se_infoJugadores_() {
  const sh = sd_full_(SE.JUGADORES);
  const cap = sd_capcalera_(sh);
  const iNom = sd_exigeixColumna_(cap, 'Nom', SE.JUGADORES);
  const iEquip = sd_exigeixColumna_(cap, 'Equip', SE.JUGADORES);
  const iPos = cap.indexOf('Posicio');
  const iEstrella = cap.indexOf('Estrella');
  const iOrigen = cap.indexOf('Origen');

  const out = {};
  sd_valors_(sh, cap.length).forEach(f => {
    const nom = String(f[iNom] || '').trim();
    if (!nom) return;
    out[sd_clau_(nom, f[iEquip])] = {
      posicio: iPos === -1 ? '' : String(f[iPos] || '').trim(),
      estrella: iEstrella !== -1 && String(f[iEstrella] || '').trim().toUpperCase() === 'SI',
      origen: iOrigen === -1 ? '' : String(f[iOrigen] || '').trim(),
    };
  });
  return out;
}

/** El que ja hi ha desat, per poder repassar i corregir. */
function se_resultatsDe_(jornada) {
  const sh = sd_full_(SE.RESULTATS);
  const cap = sd_capcalera_(sh);
  const iJor = sd_exigeixColumna_(cap, 'Jornada', SE.RESULTATS);
  const iNom = sd_exigeixColumna_(cap, 'Nom', SE.RESULTATS);
  const iPunts = sd_exigeixColumna_(cap, 'Punts', SE.RESULTATS);
  const iFaltes = sd_exigeixColumna_(cap, 'Faltes', SE.RESULTATS);
  const iEquip = cap.indexOf('Equip');

  const out = {};
  sd_valors_(sh, cap.length).forEach(f => {
    if (Number(f[iJor]) !== Number(jornada)) return;
    const equip = iEquip === -1 ? '' : f[iEquip];
    out[sd_clau_(f[iNom], equip)] = { punts: f[iPunts], faltes: f[iFaltes] };
  });
  return out;
}

/** Crea la pestanya si cal i la deixa buida. */
function se_preparaFull_() {
  const ss = sd_ss_();
  let sh = ss.getSheetByName(SE.ENTRADA);
  if (!sh) sh = ss.insertSheet(SE.ENTRADA);
  sh.clear();
  sh.clearConditionalFormatRules();
  return sh;
}

/** El número de jornada escrit al títol de la pestanya. */
function se_jornadaDelFull_(sh) {
  const titol = String(sh.getRange(1, 1).getValue() || '');
  const m = titol.match(/JORNADA\s+(\d+)/i);
  if (!m) {
    throw new Error('No trobo el número de jornada a "' + SE.ENTRADA +
      '". Torna a executar "Preparar entrada de resultats".');
  }
  return Number(m[1]);
}

/** Format: prou llegible per treballar-hi i prou clar sobre què es pot escriure. */
function se_pintaFull_(sh, nFiles, marques, editables) {
  if (!nFiles) return;

  sh.setColumnWidth(SE_COL.POSICIO, 80);
  sh.setColumnWidth(SE_COL.NOM, 220);
  sh.setColumnWidth(SE_COL.PUNTS, 70);
  sh.setColumnWidth(SE_COL.FALTES, 70);
  sh.setColumnWidth(SE_COL.MARQUES, 150);
  sh.setColumnWidth(SE_COL.TRIADA, 200);

  sh.getRange(1, 1, 1, SE_AMPLADA).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1, 2, SE_AMPLADA).setFontColor('#666666').setFontStyle('italic');

  marques.forEach(m => {
    const r = sh.getRange(m.fila, 1, 1, SE_AMPLADA);
    if (m.tipus === 'equip') r.setFontWeight('bold').setBackground('#d9e2f3').setFontSize(12);
    else r.setFontWeight('bold').setBackground('#f2f2f2');
  });

  editables.forEach(e => {
    if (!e.n) return;
    sh.getRange(e.inici, SE_COL.PUNTS, e.n, 2)
      .setBackground('#fff8e1')
      .setBorder(true, true, true, true, true, true, '#d9c48a', SpreadsheetApp.BorderStyle.SOLID);
  });

  sh.setFrozenRows(4);
}

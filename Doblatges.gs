/**
 * SUPERMANAGER MCBF 26/27 — Sincronització automàtica dels doblatges
 *
 * QUÈ FA
 * Quan una jugadora dobla (juga amb dos equips), amb això només cal escriure-la
 * un cop a la pestanya `Doblatges`. La resta es genera sola:
 *   · `Jugadores`            → hi apareix una segona fila (mateix nom, equip on dobla).
 *   · `Resultats_jugadores`  → hi apareix una segona fila, per poder entrar els punts
 *                              i les faltes de cada partit per separat.
 *
 * COM INSTAL·LAR-HO
 * 1. Obre el Sheet → Extensions → Apps Script.
 * 2. Fitxers → + → Script. Posa-li de nom "Doblatges" i enganxa-hi aquest fitxer.
 *    NO toquis Code.gs: el que hi ha desplegat és més nou que la còpia del repo.
 * 3. A `Code.gs`, dins de `poolJugadores_()`, afegeix aquesta línia just després
 *    de `const jugadores = sheetRows_(SH.JUGADORES)`:
 *
 *        .filter(j => !String(j.Origen || '').trim())   // <-- afegir
 *
 *    Sense això l'app veuria la jugadora dos cops amb el mateix equip (un cop per
 *    la fila generada a `Jugadores` i un altre pel doblatge).
 * 4. Guarda. El trigger `onEdit` ja funciona sol; no cal tornar a desplegar el web app.
 *
 * COLUMNES QUE AFEGEIX (les crea soles la primera vegada)
 *   · `Jugadores.Origen`           → buit = jugadora del roster; "dobla (U16)" = fila generada.
 *   · `Resultats_jugadores.Equip`  → amb quin equip va jugar aquell partit.
 *
 * SEGURETAT: l'script només esborra files que ha creat ell mateix (les que tenen
 * `Origen` ple a `Jugadores`, o les de `Resultats_jugadores` que han quedat òrfenes
 * i encara no tenen ni punts ni faltes). Res del que escrius a mà es perd.
 */

const SD = {
  JUGADORES: 'Jugadores',
  DOBLATGES: 'Doblatges',
  JORNADES: 'Jornades',
  RESULTATS: 'Resultats_jugadores',
  COL_ORIGEN: 'Origen',
  COL_EQUIP: 'Equip',
};

/** ---------- PUNTS D'ENTRADA ---------- */

/**
 * Trigger simple: es dispara cada cop que s'edita el full.
 * Només fa feina si l'edició ha estat a la pestanya `Doblatges`.
 *
 * ATENCIÓ: si el projecte ja té una altra funció `onEdit`, Apps Script només
 * n'executa una. En aquest cas cal fusionar-les en una de sola.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    if (e.range.getSheet().getName() !== SD.DOBLATGES) return;
    sincronitzaDoblatges();
  } catch (err) {
    // Una edició del full no ha de petar mai per culpa d'això.
    console.error('sincronitzaDoblatges: ' + err);
  }
}

/** Menú manual, per si vols forçar la sincronització sense editar res. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Supermanager')
    .addItem('Preparar entrada de resultats', 'preparaEntradaResultatsAmbAvis')
    .addItem('Desar resultats entrats', 'desaResultatsEntratsAmbAvis')
    .addSeparator()
    .addItem('Sincronitzar doblatges', 'sincronitzaDoblatgesAmbAvis')
    .addItem('Reparar fórmules de puntuació', 'reparaFormulesAmbAvis')
    .addItem('Migrar jornades 1-3 del full antic', 'migraHistoricAmbAvis')
    .addToUi();
}

function sincronitzaDoblatgesAmbAvis() {
  const r = sincronitzaDoblatges();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Jornada ' + r.jornada + ': ' + r.doblatges + ' doblatges sincronitzats.',
    'Supermanager', 5
  );
}

/** Regenera les files derivades dels doblatges de la jornada actual. */
function sincronitzaDoblatges() {
  const jornada = sd_jornadaActual_();
  const doblatges = sd_doblatgesDe_(jornada);
  sd_sincronitzaJugadores_(doblatges);
  sd_sincronitzaResultats_(jornada);
  return { jornada: jornada, doblatges: doblatges.length };
}

/** ---------- LECTURA ---------- */

function sd_ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sd_full_(nom) {
  const sh = sd_ss_().getSheetByName(nom);
  if (!sh) throw new Error('No existeix la pestanya "' + nom + '".');
  return sh;
}

/** Capçalera (netejada) d'una pestanya. */
function sd_capcalera_(sh) {
  const n = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, n).getValues()[0].map(h => String(h).trim());
}

/** Files de dades en brut (sense la capçalera), amb tantes columnes com capçalera. */
function sd_valors_(sh, nCols) {
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  return sh.getRange(2, 1, ultima - 1, nCols).getValues();
}

/** Afegeix la columna si no hi és i retorna el seu índex (0-based). */
function sd_asseguraColumna_(sh, capcalera, nom) {
  let i = capcalera.indexOf(nom);
  if (i === -1) {
    i = capcalera.length;
    sh.getRange(1, i + 1).setValue(nom);
    capcalera.push(nom);
  }
  return i;
}

function sd_exigeixColumna_(capcalera, nom, fullNom) {
  const i = capcalera.indexOf(nom);
  if (i === -1) throw new Error('Falta la columna "' + nom + '" a la pestanya "' + fullNom + '".');
  return i;
}

function sd_clau_(nom, equip) {
  return String(nom).trim().toUpperCase() + '|' + String(equip).trim().toUpperCase();
}

function sd_buit_(v) {
  return v === '' || v === null || v === undefined;
}

/**
 * La jornada en curs: la més alta de `Jornades`. Mana `Jornades` i no `Doblatges`
 * perquè un número mal teclejat a `Doblatges` no generi tot un bloc de files
 * d'una jornada que encara no existeix.
 */
function sd_jornadaActual_() {
  const candidates = [];
  [SD.JORNADES, SD.DOBLATGES].forEach(nom => {
    if (candidates.length) return; // ja tenim jornades a `Jornades`
    const sh = sd_ss_().getSheetByName(nom);
    if (!sh) return;
    const cap = sd_capcalera_(sh);
    const i = cap.indexOf('Jornada');
    if (i === -1) return;
    sd_valors_(sh, cap.length).forEach(f => {
      const n = Number(f[i]);
      if (n) candidates.push(n);
    });
  });
  return candidates.length ? Math.max.apply(null, candidates) : 1;
}

/** "U16" -> "dobla (U16)";  "(fora del roster)" -> "dobla (fora del roster)" */
function sd_etiquetaOrigen_(origen) {
  const t = String(origen || '').trim();
  if (!t) return 'dobla';
  if (t.charAt(0) === '(' && t.charAt(t.length - 1) === ')') return 'dobla ' + t;
  return 'dobla (' + t + ')';
}

/** Doblatges d'una jornada, ignorant les files a mitges. */
function sd_doblatgesDe_(jornada) {
  const sh = sd_full_(SD.DOBLATGES);
  const cap = sd_capcalera_(sh);
  const iJor = sd_exigeixColumna_(cap, 'Jornada', SD.DOBLATGES);
  const iNom = sd_exigeixColumna_(cap, 'Nom', SD.DOBLATGES);
  const iDobla = sd_exigeixColumna_(cap, 'Equip_dobla', SD.DOBLATGES);
  const iOrig = sd_exigeixColumna_(cap, 'Equip_origen', SD.DOBLATGES);
  const iPos = sd_exigeixColumna_(cap, 'Posicio', SD.DOBLATGES);

  return sd_valors_(sh, cap.length)
    .filter(f => Number(f[iJor]) === Number(jornada))
    .map(f => ({
      nom: String(f[iNom] || '').trim(),
      equip: String(f[iDobla] || '').trim(),
      origen: String(f[iOrig] || '').trim(),
      posicio: String(f[iPos] || '').trim(),
    }))
    .filter(d => d.nom && d.equip && d.posicio);
}

/** ---------- PESTANYA `Jugadores` ---------- */

function sd_sincronitzaJugadores_(doblatges) {
  const sh = sd_full_(SD.JUGADORES);
  const cap = sd_capcalera_(sh);
  const iNom = sd_exigeixColumna_(cap, 'Nom', SD.JUGADORES);
  const iEquip = sd_exigeixColumna_(cap, 'Equip', SD.JUGADORES);
  const iOrigen = sd_asseguraColumna_(sh, cap, SD.COL_ORIGEN);
  const nCols = cap.length;

  // 1. Fora les files generades en una sincronització anterior (de baix cap amunt,
  //    perquè esborrar una fila desplaça totes les de sota).
  const valors = sd_valors_(sh, nCols);
  for (let i = valors.length - 1; i >= 0; i--) {
    if (String(valors[i][iOrigen] || '').trim()) sh.deleteRow(i + 2);
  }

  // 2. Quines parelles (jugadora, equip) ja hi són al roster mestre.
  const existents = {};
  sd_valors_(sh, nCols).forEach(f => {
    if (sd_buit_(f[iNom])) return;
    existents[sd_clau_(f[iNom], f[iEquip])] = true;
  });

  // 3. Una fila nova per cada doblatge que encara no hi sigui.
  //    Estrella sempre 'NO': qui dobla mai és estrella a l'equip on dobla (normativa punt 4).
  const noves = [];
  doblatges.forEach(d => {
    const k = sd_clau_(d.nom, d.equip);
    if (existents[k]) return;
    existents[k] = true;
    const fila = new Array(nCols).fill('');
    cap.forEach((h, i) => {
      if (h === 'Nom') fila[i] = d.nom;
      else if (h === 'Equip') fila[i] = d.equip;
      else if (h === 'Posicio') fila[i] = d.posicio;
      else if (h === 'Estrella') fila[i] = 'NO';
      else if (h === SD.COL_ORIGEN) fila[i] = sd_etiquetaOrigen_(d.origen);
    });
    noves.push(fila);
  });

  if (noves.length) {
    sh.getRange(sh.getLastRow() + 1, 1, noves.length, nCols).setValues(noves);
  }
}

/** ---------- PESTANYA `Resultats_jugadores` ---------- */

/**
 * Deixa una fila per cada parella (jugadora, equip) de la jornada, de manera que
 * qui dobla té dues línies i s'hi poden entrar els punts dels dos partits.
 * No esborra mai una fila que tingui punts o faltes escrits.
 */
function sd_sincronitzaResultats_(jornada) {
  // Roster efectiu: `Jugadores` ja porta les files dels doblatges d'aquesta jornada.
  const shJ = sd_full_(SD.JUGADORES);
  const capJ = sd_capcalera_(shJ);
  const jNom = sd_exigeixColumna_(capJ, 'Nom', SD.JUGADORES);
  const jEquip = sd_exigeixColumna_(capJ, 'Equip', SD.JUGADORES);
  const jOrigen = capJ.indexOf(SD.COL_ORIGEN);

  const roster = [];
  const rosterClaus = {};
  const equipPropi = {}; // NOM -> equip, només per a les jugadores del roster mestre
  sd_valors_(shJ, capJ.length).forEach(f => {
    if (sd_buit_(f[jNom])) return;
    const nom = String(f[jNom]).trim();
    const equip = String(f[jEquip] || '').trim();
    const generada = jOrigen !== -1 && String(f[jOrigen] || '').trim();
    roster.push({ nom: nom, equip: equip });
    rosterClaus[sd_clau_(nom, equip)] = true;
    if (!generada) equipPropi[nom.toUpperCase()] = equip;
  });

  const sh = sd_full_(SD.RESULTATS);
  const cap = sd_capcalera_(sh);
  const iJor = sd_exigeixColumna_(cap, 'Jornada', SD.RESULTATS);
  const iNom = sd_exigeixColumna_(cap, 'Nom', SD.RESULTATS);
  const iPunts = cap.indexOf('Punts');
  const iFaltes = cap.indexOf('Faltes');
  const iEquip = sd_asseguraColumna_(sh, cap, SD.COL_EQUIP);
  const nCols = cap.length;

  // 1. Les files antigues no tenen Equip: omple'l amb l'equip propi de la jugadora.
  //    Es fa de totes les jornades, no només de l'actual, perquè les fórmules de
  //    `Calcul_puntuacio` busquen per equip i una casella buida no hi lligaria mai.
  const valors = sd_valors_(sh, nCols);
  const pendents = [];
  valors.forEach((f, i) => {
    if (!sd_buit_(f[iEquip])) return;
    const propi = equipPropi[String(f[iNom] || '').trim().toUpperCase()];
    if (!propi) return;
    f[iEquip] = propi;
    pendents.push({ fila: i + 2, valor: propi });
  });
  pendents.forEach(p => sh.getRange(p.fila, iEquip + 1).setValue(p.valor));

  // 2. Quines parelles ja hi són en aquesta jornada.
  const presents = {};
  valors.forEach(f => {
    if (Number(f[iJor]) !== Number(jornada)) return;
    if (sd_buit_(f[iNom])) return;
    presents[sd_clau_(f[iNom], f[iEquip])] = true;
  });

  // 3. Afegeix les que falten (típicament, la segona línia de qui dobla).
  const noves = [];
  roster.forEach(r => {
    const k = sd_clau_(r.nom, r.equip);
    if (presents[k]) return;
    presents[k] = true;
    const fila = new Array(nCols).fill('');
    fila[iJor] = jornada;
    fila[iNom] = r.nom;
    fila[iEquip] = r.equip;
    noves.push(fila);
  });
  if (noves.length) {
    sh.getRange(sh.getLastRow() + 1, 1, noves.length, nCols).setValues(noves);
  }

  // 4. Treu les files d'un doblatge que s'ha desfet, però només si són buides.
  const finals = sd_valors_(sh, nCols);
  for (let i = finals.length - 1; i >= 0; i--) {
    const f = finals[i];
    if (Number(f[iJor]) !== Number(jornada)) continue;
    if (sd_buit_(f[iNom])) continue;
    if (rosterClaus[sd_clau_(f[iNom], f[iEquip])]) continue;
    const teDades = (iPunts !== -1 && !sd_buit_(f[iPunts])) || (iFaltes !== -1 && !sd_buit_(f[iFaltes]));
    if (teDades) continue;
    sh.deleteRow(i + 2);
  }
}

/** ---------- REPARACIÓ DE `Calcul_puntuacio` ---------- */

/**
 * `Calcul_puntuacio` té les columnes A:E plenes de `=IF(#REF!="","",#REF!)`: en algun
 * moment es va esborrar el rang al qual apuntaven i tota la pestanya va quedar morta
 * (com que C sempre val "", F:M tornen "" i `Classificacio.Punts_equip` dona 0).
 *
 * Aquesta funció hi torna a escriure les 13 fórmules:
 *   · A:E  → tornen a llegir `Equips_usuari`.
 *   · F:G  → busquen punts i faltes per Jornada + Nom + **Equip**, que és el que fa
 *            que una jugadora que dobla puntuï el partit correcte a cada equip.
 *   · H:M  → igual que abans (punts base, bonus del 20% per victòria, x2 de capitana).
 *
 * També torna a posar les fórmules de `Classificacio` C:D allà on hi hagi un número
 * escrit a mà. La pestanya és calculada i no s'hi ha d'escriure res a sobre.
 *
 * Es fa servir `setFormulas()`, que sempre fa servir la sintaxi amb comes
 * independentment de l'idioma del full: així no cal preocupar-se de si aquí toca
 * escriure "," o ";".
 */
function reparaFormules() {
  const calcul = sd_reparaCalculPuntuacio_();
  const clas = sd_reparaClassificacio_();
  return { files: calcul, classificacio: clas };
}

function reparaFormulesAmbAvis() {
  const r = reparaFormules();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Calcul_puntuacio: ' + r.files + ' files. Classificacio: ' + r.classificacio + ' caselles recuperades.',
    'Supermanager', 6
  );
}

function sd_reparaCalculPuntuacio_() {
  const sh = sd_full_('Calcul_puntuacio');
  const shEq = sd_full_('Equips_usuari');

  // Prou files per a tot el que hi ha a `Equips_usuari`. El mínim de 2000 cobreix una
  // temporada sencera (63 files per jornada: 7 participants x 9 jugadores); amb les 600
  // d'abans les fórmules s'haurien acabat cap a la jornada 10, i la classificació
  // s'hauria quedat encallada sense avisar.
  const files = Math.max(2000, shEq.getLastRow() - 1);
  if (sh.getMaxRows() < files + 1) sh.insertRowsAfter(sh.getMaxRows(), files + 1 - sh.getMaxRows());

  const fila = [[
    '=IF(Equips_usuari!$A2="","",Equips_usuari!$A2)',
    '=IF(Equips_usuari!$B2="","",Equips_usuari!$B2)',
    '=IF(Equips_usuari!$C2="","",Equips_usuari!$C2)',
    '=IF(Equips_usuari!$D2="","",Equips_usuari!$D2)',
    '=IF(Equips_usuari!$F2="","",Equips_usuari!$F2)',
    '=IF($C2="","",SUMIFS(Resultats_jugadores!$C:$C,Resultats_jugadores!$A:$A,$A2,Resultats_jugadores!$B:$B,$C2,Resultats_jugadores!$E:$E,$D2))',
    '=IF($C2="","",SUMIFS(Resultats_jugadores!$D:$D,Resultats_jugadores!$A:$A,$A2,Resultats_jugadores!$B:$B,$C2,Resultats_jugadores!$E:$E,$D2))',
    '=IF($C2="","",N($F2)-N($G2))',
    '=IF($C2="","",IFERROR(INDEX(Partits!$C:$C,MATCH($A2&"_"&$D2,Partits!$D:$D,0)),""))',
    '=IF($C2="","",IF(AND($I2="V",N($H2)>0),1.2,1))',
    '=IF($C2="","",N($H2)*$J2)',
    '=IF($C2="","",IF($E2="SI",2,1))',
    '=IF($C2="","",$K2*$L2)',
  ]];

  const origen = sh.getRange(2, 1, 1, 13);
  origen.setFormulas(fila);
  if (files > 1) origen.copyTo(sh.getRange(3, 1, files - 1, 13));
  return files;
}

function sd_formulaPuntsEquip_(fila) {
  return '=SUMIFS(Calcul_puntuacio!$M:$M,Calcul_puntuacio!$A:$A,$A' + fila +
    ',Calcul_puntuacio!$B:$B,$B' + fila + ')';
}

function sd_formulaPuntsPreguntes_(fila) {
  return '=SUMIFS(Respostes_usuari!$F:$F,Respostes_usuari!$A:$A,$A' + fila +
    ',Respostes_usuari!$B:$B,$B' + fila + ')';
}

/** Torna a posar les fórmules de `Classificacio` C:D on hi hagi un valor escrit a mà. */
function sd_reparaClassificacio_() {
  const sh = sd_full_('Classificacio');
  const ultima = sh.getLastRow();
  if (ultima < 2) return 0;

  const usuaris = sh.getRange(2, 1, ultima - 1, 2).getValues();
  const formules = sh.getRange(2, 3, ultima - 1, 2).getFormulas();
  let recuperades = 0;

  usuaris.forEach((u, i) => {
    if (sd_buit_(u[0]) || sd_buit_(u[1])) return;
    const r = i + 2;
    if (!formules[i][0]) {
      sh.getRange(r, 3).setFormula(sd_formulaPuntsEquip_(r));
      recuperades++;
    }
    if (!formules[i][1]) {
      sh.getRange(r, 4).setFormula(sd_formulaPuntsPreguntes_(r));
      recuperades++;
    }
  });

  return recuperades;
}

/** ---------- MIGRACIÓ DE LES JORNADES 1-3 ---------- */

/**
 * El supermanager es va portar a mà les tres primeres jornades, en un full a part
 * (`Equips i Classificació`). D'aquelles jornades només en tenim el total de cada
 * participant: la pestanya `EQUIPS JORNADA` d'aquell full es reescriu cada setmana i el
 * detall de la J2 i la J3 ja no hi és. La J1 no en té, de detall: va ser un qüestionari
 * de 10 preguntes, sense jugadores.
 *
 * Per això els totals van a una columna pròpia, `Punts_migrats`, i no a `Punts_equip`:
 * així les fórmules segueixen vives i el dia que aparegui el detall només cal esborrar
 * la casella migrada perquè el càlcul torni a manar.
 *
 * Alhora esborra la ronda de proves que hi ha desada com a jornada 1 (les tries del 23 i
 * 24/09 fetes per provar l'app). Si no, la J1 sumaria els punts del qüestionari més els
 * d'una ronda que no va existir.
 */
const SD_HISTORIC = {
  usuaris: ['U13', 'U14', 'U15', 'U16', 'U17+SFB', 'U18+DE', 'LF2'],
  //          U13     U14      U15     U16     U17+SFB  U18+DE   LF2
  1: /* qüestionari */ [15, 15, 15, 10, 10, 20, 5],
  2: [87.6, 105.6, 78.6, 81.4, 76.0, 145.4, 106.0],
  3: [88.6, 81.2, 86.6, 90.0, 100.2, 108.8, 101.2],
};

function migraHistoricAmbAvis() {
  const ui = SpreadsheetApp.getUi();
  const resposta = ui.alert(
    'Migrar les jornades 1, 2 i 3',
    'Això farà dues coses:\n\n' +
    '1. Escriurà els totals de les jornades 1, 2 i 3 del full antic a una columna nova ' +
    '"Punts_migrats" de Classificacio, i els sumarà als punts totals.\n\n' +
    '2. Esborrarà la ronda de proves desada com a jornada 1 (les tries fetes per provar ' +
    'l\'app): equips enviats, respostes i els punts i faltes de la jornada 1.\n\n' +
    'El full de dades no es pot desfer des d\'aquí, però Drive en guarda l\'historial de ' +
    'versions. Vols continuar?',
    ui.ButtonSet.YES_NO);
  if (resposta !== ui.Button.YES) return;

  const r = migraHistoric();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    r.migrats + ' totals migrats. Ronda de proves esborrada: ' +
    r.esborrats.equips + ' tries, ' + r.esborrats.respostes + ' respostes, ' +
    r.esborrats.resultats + ' resultats.',
    'Supermanager', 8);
}

function migraHistoric() {
  const esborrats = sd_esborraRondaDeProves_(1);
  const migrats = sd_escriuHistoric_();
  return { migrats: migrats, esborrats: esborrats };
}

/** Escriu els totals històrics a `Classificacio.Punts_migrats` i els suma al total. */
function sd_escriuHistoric_() {
  const sh = sd_full_('Classificacio');
  const cap = sd_capcalera_(sh);
  const iJor = sd_exigeixColumna_(cap, 'Jornada', 'Classificacio');
  const iUsuari = sd_exigeixColumna_(cap, 'Usuari', 'Classificacio');
  const iTotals = sd_exigeixColumna_(cap, 'Punts_totals', 'Classificacio');
  const iMigrats = sd_asseguraColumna_(sh, cap, 'Punts_migrats');
  const nCols = cap.length;

  const valors = sd_valors_(sh, nCols);
  let escrits = 0;

  valors.forEach((f, i) => {
    const jornada = Number(f[iJor]);
    const taula = SD_HISTORIC[jornada];
    if (!taula) return;
    const pos = SD_HISTORIC.usuaris.indexOf(String(f[iUsuari] || '').trim());
    if (pos === -1) return;
    const fila = i + 2;
    sh.getRange(fila, iMigrats + 1).setValue(taula[pos]);

    // Els punts de la jornada 1 estaven escrits a mà a `Punts_equip`. Ara que són a
    // `Punts_migrats`, allà hi ha de tornar a manar la fórmula: si no, es comptarien dos
    // cops. Un cop esborrada la ronda de proves, la fórmula donarà 0, que és el correcte.
    sh.getRange(fila, cap.indexOf('Punts_equip') + 1).setFormula(sd_formulaPuntsEquip_(fila));
    sh.getRange(fila, cap.indexOf('Punts_preguntes') + 1).setFormula(sd_formulaPuntsPreguntes_(fila));

    sh.getRange(fila, iTotals + 1).setFormula(
      '=N($' + sd_lletra_(cap.indexOf('Punts_equip')) + fila + ')' +
      '+N($' + sd_lletra_(cap.indexOf('Punts_preguntes')) + fila + ')' +
      '+N($' + sd_lletra_(iMigrats) + fila + ')');
    escrits++;
  });

  return escrits;
}

/** Índex 0-based -> lletra de columna ("A", "B", … "AA"). */
function sd_lletra_(i) {
  let n = i + 1, s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Treu d'una jornada les tries, les respostes i els punts entrats. */
function sd_esborraRondaDeProves_(jornada) {
  const equips = sd_esborraFilesDe_('Equips_usuari', jornada);
  const respostes = sd_esborraFilesDe_('Respostes_usuari', jornada);

  // De `Resultats_jugadores` no n'esborrem les files: les regenera la sincronització.
  // N'hi ha prou amb buidar els punts i les faltes.
  const sh = sd_full_(SD.RESULTATS);
  const cap = sd_capcalera_(sh);
  const iJor = sd_exigeixColumna_(cap, 'Jornada', SD.RESULTATS);
  const iPunts = sd_exigeixColumna_(cap, 'Punts', SD.RESULTATS);
  const iFaltes = sd_exigeixColumna_(cap, 'Faltes', SD.RESULTATS);
  const valors = sd_valors_(sh, cap.length);
  let resultats = 0;
  valors.forEach(f => {
    if (Number(f[iJor]) !== Number(jornada)) return;
    if (sd_buit_(f[iPunts]) && sd_buit_(f[iFaltes])) return;
    f[iPunts] = '';
    f[iFaltes] = '';
    resultats++;
  });
  if (valors.length) sh.getRange(2, 1, valors.length, cap.length).setValues(valors);

  return { equips: equips, respostes: respostes, resultats: resultats };
}

function sd_esborraFilesDe_(nomFull, jornada) {
  const sh = sd_full_(nomFull);
  const cap = sd_capcalera_(sh);
  const iJor = sd_exigeixColumna_(cap, 'Jornada', nomFull);
  const valors = sd_valors_(sh, cap.length);
  let n = 0;
  for (let i = valors.length - 1; i >= 0; i--) {
    if (Number(valors[i][iJor]) !== Number(jornada)) continue;
    sh.deleteRow(i + 2);
    n++;
  }
  return n;
}

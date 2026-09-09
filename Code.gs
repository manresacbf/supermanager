/**
 * SUPERMANAGER MCBF 26/27 — Backend (Google Apps Script)
 *
 * COM INSTAL·LAR-HO:
 * 1. Obre el Google Sheet (Supermanager_MCBF_26-27_Dades) al Drive.
 * 2. Extensions → Apps Script.
 * 3. Esborra el contingut per defecte de Code.gs i enganxa-hi tot aquest fitxer.
 * 4. Desplega → Nova implementació → tipus "Aplicació web".
 *      - Executar com: Jo (el teu compte)
 *      - Qui hi té accés: Qualsevol persona
 * 5. Copia la URL que et dona ("Web app URL") i posa-la a CONFIG.API_URL dins index.html.
 *
 * No cal canviar cap SPREADSHEET_ID: com que l'script viu "lligat" al mateix
 * Sheet, SpreadsheetApp.getActiveSpreadsheet() ja apunta al full correcte.
 */

const SH = {
  JUGADORES: 'Jugadores',
  DOBLATGES: 'Doblatges',
  JORNADES: 'Jornades',
  PARTITS: 'Partits',
  RESULTATS: 'Resultats_jugadores',
  EQUIPS_USUARI: 'Equips_usuari',
  RESPOSTES: 'Respostes_usuari',
  CLASSIFICACIO: 'Classificacio',
  CLASSIFICACIO_GLOBAL: 'Classificacio_global',
};

const USUARIS_VALIDS = ['U13', 'U14', 'U15', 'U16', 'U17+SFB', 'U18+DE', 'LF2'];

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheetRows_(sheetName) {
  const sheet = ss_().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

function jornadaActual_() {
  const jornades = sheetRows_(SH.JORNADES);
  if (!jornades.length) return 1;
  return Math.max(...jornades.map(j => Number(j.Jornada)));
}

function equipsActius_(jornada) {
  const jornades = sheetRows_(SH.JORNADES);
  const fila = jornades.find(j => Number(j.Jornada) === Number(jornada));
  if (!fila) return USUARIS_VALIDS.slice();
  return USUARIS_VALIDS.filter(eq => String(fila['Actiu_' + eq]).toUpperCase() === 'SI');
}

/** Retorna el pool de jugadores seleccionables per l'usuari: pròpies + les que dobles cap al seu equip aquesta jornada */
function poolJugadores_(usuari, jornada) {
  const actius = equipsActius_(jornada);
  const jugadores = sheetRows_(SH.JUGADORES)
    .filter(j => actius.includes(j.Equip))
    .map(j => ({
      nom: j.Nom,
      equip: j.Equip,
      posicio: j.Posicio,
      estrella: String(j.Estrella).toUpperCase() === 'SI',
      origen: 'propi',
    }));

  const doblatges = sheetRows_(SH.DOBLATGES)
    .filter(d => Number(d.Jornada) === Number(jornada) && actius.includes(d.Equip_dobla))
    .map(d => ({
      nom: d.Nom,
      equip: d.Equip_dobla,
      posicio: d.Posicio,
      estrella: false, // una jugadora que dobla mai és estrella amb l'equip on dobla (normativa punt 4)
      origen: 'dobla (' + d.Equip_origen + ')',
    }));

  return jugadores.concat(doblatges);
}

function equipJaEnviat_(usuari, jornada) {
  const files = sheetRows_(SH.EQUIPS_USUARI);
  return files.some(f => f.Usuari === usuari && Number(f.Jornada) === Number(jornada));
}

function meuEquip_(usuari, jornada) {
  const files = sheetRows_(SH.EQUIPS_USUARI).filter(
    f => f.Usuari === usuari && Number(f.Jornada) === Number(jornada)
  );
  if (!files.length) return null;
  const respostes = sheetRows_(SH.RESPOSTES).find(
    r => r.Usuari === usuari && Number(r.Jornada) === Number(jornada)
  );
  return {
    jugadores: files.map(f => ({
      nom: f.Jugadora,
      equip: f.Equip_jugadora,
      posicio: f.Posicio,
      capitana: String(f.Capitana).toUpperCase() === 'SI',
    })),
    respostes: respostes || null,
  };
}

function classificacio_() {
  return {
    global: sheetRows_(SH.CLASSIFICACIO_GLOBAL),
    perJornada: sheetRows_(SH.CLASSIFICACIO),
  };
}

/** ---------- VALIDACIÓ DE LES REGLES (normativa punts 1, 2, 3, 8) ---------- */
function validarEquip_(usuari, jornada, jugadors, capitana) {
  const errors = [];

  if (jugadors.length !== 9) {
    errors.push('Cal escollir exactament 9 jugadores (n\'hi ha ' + jugadors.length + ').');
  }

  const noms = jugadors.map(j => j.nom);
  const nomsUnics = new Set(noms);
  if (nomsUnics.size !== noms.length) {
    errors.push('Hi ha una jugadora repetida a l\'equip.');
  }

  const pool = poolJugadores_(usuari, jornada);
  const porNom = {};
  pool.forEach(p => (porNom[p.nom + '|' + p.equip] = p));

  const perPosicio = { B: 0, A: 0, P: 0 };
  const estrelles = { total: 0, B: 0, A: 0, P: 0 };
  const equipsCoberts = new Set();

  jugadors.forEach(j => {
    const info = porNom[j.nom + '|' + j.equip];
    if (!info) {
      errors.push('"' + j.nom + '" (' + j.equip + ') no és una jugadora vàlida per aquesta jornada.');
      return;
    }
    perPosicio[info.posicio] = (perPosicio[info.posicio] || 0) + 1;
    if (info.estrella) {
      estrelles.total++;
      estrelles[info.posicio]++;
    }
    equipsCoberts.add(info.equip);
  });

  ['B', 'A', 'P'].forEach(pos => {
    if (perPosicio[pos] !== 3) {
      errors.push('Calen exactament 3 jugadores a la posició ' + pos + ' (n\'hi ha ' + (perPosicio[pos] || 0) + ').');
    }
  });

  if (estrelles.total > 3) {
    errors.push('Màxim 3 jugadores estrella (n\'hi ha ' + estrelles.total + ').');
  }
  ['B', 'A', 'P'].forEach(pos => {
    if (estrelles[pos] > 2) {
      errors.push('Màxim 2 jugadores estrella a la posició ' + pos + ' (n\'hi ha ' + estrelles[pos] + ').');
    }
  });

  const actius = equipsActius_(jornada);
  const faltants = actius.filter(eq => !equipsCoberts.has(eq));
  if (faltants.length) {
    errors.push('Falta almenys 1 jugadora dels equips: ' + faltants.join(', ') + '.');
  }

  if (!capitana || !noms.includes(capitana)) {
    errors.push('Cal designar una capitana entre les 9 jugadores triades.');
  }

  return errors;
}

/** ---------- ENDPOINTS ---------- */
function doGet(e) {
  const action = e.parameter.action;
  const usuari = e.parameter.u;

  try {
    if (action === 'config') {
      if (!USUARIS_VALIDS.includes(usuari)) throw new Error('Usuari no reconegut: ' + usuari);
      const jornada = jornadaActual_();
      return respond_({
        ok: true,
        usuari: usuari,
        jornada: jornada,
        equipsActius: equipsActius_(jornada),
        jaEnviat: equipJaEnviat_(usuari, jornada),
        pool: poolJugadores_(usuari, jornada),
        meuEquip: meuEquip_(usuari, jornada),
      });
    }
    if (action === 'classificacio') {
      return respond_({ ok: true, ...classificacio_() });
    }
    return respond_({ ok: false, error: 'Acció desconeguda.' });
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const usuari = body.usuari;
    const jugadors = body.jugadors || [];
    const capitana = body.capitana;
    const respostes = body.respostes || {};

    if (!USUARIS_VALIDS.includes(usuari)) throw new Error('Usuari no reconegut: ' + usuari);
    const jornada = jornadaActual_();

    if (equipJaEnviat_(usuari, jornada)) {
      return respond_({
        ok: false,
        error: 'Ja s\'ha enviat un equip per a la jornada ' + jornada + '. Contacta l\'organització per canviar-lo.',
      });
    }

    const errors = validarEquip_(usuari, jornada, jugadors, capitana);
    if (errors.length) {
      return respond_({ ok: false, error: errors.join(' ') });
    }

    const now = new Date();
    const shEquips = ss_().getSheetByName(SH.EQUIPS_USUARI);
    jugadors.forEach(j => {
      shEquips.appendRow([jornada, usuari, j.nom, j.equip, j.posicio, j.nom === capitana ? 'SI' : 'NO', now]);
    });

    const shResp = ss_().getSheetByName(SH.RESPOSTES);
    shResp.appendRow([jornada, usuari, respostes.average || '', respostes.p2 || '', respostes.p3 || '', 0]);

    return respond_({ ok: true, jornada: jornada });
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  }
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

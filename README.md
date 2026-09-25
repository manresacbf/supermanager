# SuperManager MCBF 26/27

PWA per jugar al supermanager entre les categories del Manresa CBF, amb un Google
Sheet com a base de dades i un web app d'Apps Script pel mig.

## ⚠️ El `Code.gs` d'aquest repo està desfasat

L'Apps Script que hi ha **desplegat** és més nou que la còpia `Code.gs` d'aquest repo.
El desplegat, com a mínim:

- retorna `preguntes` i `respostes` dins de `?action=config`,
- retorna `equipsUsuaris`, `mostrarEquips` i `jornadaMostrada` dins de `?action=classificacio`,
- accepta `POST` amb `tipus: 'respostes'`,
- distingeix el **participant** (`U17+SFB`) de l'**equip del roster** (`U17`). El `Code.gs`
  del repo fa servir una sola llista per als dos, i per això `equipsActius_()` hi busca
  una columna `Actiu_U17+SFB` que al full ja no existeix (ara és `Actiu_U17`).

L'`app.js` d'aquest repo ja compta amb tot això. **No enganxis `Code.gs` per sobre de
l'script desplegat**: trencaries la pestanya de preguntes i els equips a la classificació.

## Sincronització automàtica dels doblatges — `Doblatges.gs`

Fitxer nou i independent. Quan una jugadora dobla només cal escriure-la un cop a la
pestanya `Doblatges`; l'script s'encarrega de la resta cada cop que s'edita aquella
pestanya:

- **`Jugadores`** → hi afegeix una segona fila (mateix nom, equip on dobla, `Estrella` = `NO`).
- **`Resultats_jugadores`** → hi afegeix una segona fila, per poder entrar punts i faltes
  de cada partit per separat.

Columnes noves que crea sol la primera vegada:

| Pestanya | Columna | Què hi posa |
| --- | --- | --- |
| `Jugadores` | `Origen` | Buit = jugadora del roster. `dobla (U16)` = fila generada per l'script. |
| `Resultats_jugadores` | `Equip` | Amb quin equip va jugar aquell partit. |

Només esborra files que ha creat ell mateix, i mai una fila de `Resultats_jugadores`
que ja tingui punts o faltes escrits.

### Instal·lació

1. Sheet → Extensions → Apps Script → Fitxers → **+** → Script, de nom `Doblatges`.
   Enganxa-hi `Doblatges.gs`. Repeteix-ho amb un segon fitxer `Entrada` per a `Entrada.gs`
   (`Entrada.gs` fa servir les funcions auxiliars de `Doblatges.gs`, han d'anar juntes).
2. A `Code.gs`, dins de `poolJugadores_()`, afegeix una línia just després de
   `const jugadores = sheetRows_(SH.JUGADORES)`:

   ```js
   .filter(j => !String(j.Origen || '').trim())
   ```

   Sense això l'app veuria la jugadora dos cops amb el mateix equip: un cop per la fila
   generada a `Jugadores` i un altre pel doblatge, que el pool ja hi afegeix a part.
3. Guarda. El trigger `onEdit` funciona sol i no cal tornar a desplegar el web app.
   Si el projecte ja tingués una altra funció `onEdit` o `onOpen`, cal fusionar-les:
   Apps Script només n'executa una de cada.

## `Calcul_puntuacio` estava trencat — menú «Reparar fórmules de puntuació»

Revisant el full del 24/09/2026: les columnes **A:E de `Calcul_puntuacio` són
`=IF(#REF!="","",#REF!)`**. En algun moment es va esborrar el rang de `Equips_usuari`
al qual apuntaven. Com que la columna C (Jugadora) sempre val `""`, les fórmules F:M
retornen `""` i `Classificacio.Punts_equip` dona **0 per a tothom**. Per això les
caselles `Classificacio!C2:D7` de la jornada 1 tenen números escrits a mà
(15, 15, 15, 10, 10, 20) i la fila de LF2, que encara conserva la fórmula, marca 0.

`reparaFormules()` (menú **Supermanager → Reparar fórmules de puntuació**) hi torna a
escriure les 13 columnes i, de passada, hi posa el criteri d'equip que calen els
doblatges:

| Col | Fórmula |
| --- | --- |
| A–D | `=IF(Equips_usuari!$A2="","",Equips_usuari!$A2)` … `$D2` |
| E | `=IF(Equips_usuari!$F2="","",Equips_usuari!$F2)` (Capitana és la F) |
| F | `=IF($C2="","",SUMIFS(Resultats_jugadores!$C:$C,Resultats_jugadores!$A:$A,$A2,Resultats_jugadores!$B:$B,$C2,Resultats_jugadores!$E:$E,$D2))` |
| G | igual que F però sobre `$D:$D` (Faltes) |
| H–M | com abans: base, resultat del partit, bonus 1,2 i x2 de capitana |

El tercer criteri de F i G (`Resultats_jugadores!$E:$E` = la columna `Equip` nova) és
el que fa que una jugadora que dobla puntuï **el partit que toca a cada equip**. Sense
això, el `SUMIFS` per nom sumaria els dos partits a tots dos equips.

També torna a posar les fórmules de `Classificacio` C i D allà on hi hagi un número
escrit a mà. **Això canvia la classificació de la jornada 1**: amb les dades que hi ha
ara al full, els punts d'equip passarien a ser U18+DE 87,6 · LF2 85,2 · U14 84,0 ·
U15 73,2 · U13 66,0 · U17+SFB 44,4 · U16 21,6, molt lluny dels 15/15/15/10/10/20
escrits a mà. Revisa-ho abans d'executar-ho.

Es fa amb `setFormulas()`, que sempre fa servir la sintaxi amb comes independentment
de l'idioma del full: així no cal decidir si toca escriure `,` o `;`.

## Entrada de resultats — `Entrada.gs`

`Resultats_jugadores` és una bona base de dades i una mala pantalla d'entrada: 87 files i
174 caselles, sense ordre, amb les dels doblatges enganxades al final. Però cada jornada
**només hi ha una vintena de jugadores que hagi triat algú**; la resta no les mira ningú.

`Entrada_resultats` és la llista curta. Es genera cada jornada amb només les jugadores
triades, agrupades per equip i en ordre B/A/P, amb les marques que l'equip que entra les
dades ja feia servir al seu full (`★` per estrella, `dobla de U16` per als doblatges) i
una columna que diu qui l'ha triat. Dues columnes per omplir: `PUNTS` i `FALTES`.

Sobre les dades de la jornada 1: **28 jugadores → 56 caselles**, en comptes de 174.

- `Supermanager → Preparar entrada de resultats` la genera. Les caselles surten amb el que
  ja hi hagi desat, o sigui que es pot repassar i corregir tantes vegades com calgui.
- `Supermanager → Desar resultats entrats` ho bolca a `Resultats_jugadores`, creant la
  fila si no hi era. Una jugadora que es deixa en blanc no es toca.

Les dues columnes per omplir surten amb fons groc; la resta és informació.

## Rutina de cada jornada

**Abans que les participants triïn equip**

1. **`Jornades`** — afegeix-hi una fila nova: el número de jornada, `si`/`no` a cada
   `Actiu_...` segons qui juga, les preguntes i, si ja les saps, les respostes correctes.
   Aquesta fila és el que «obre» la jornada: l'app i l'script sempre treballen amb el
   número més alt que hi hagi aquí.
2. **`Doblatges`** — una fila per cada jugadora que dobla: jornada, nom, equip d'origen,
   equip on dobla i posició. Sempre **després** del pas 1.
3. **Menú `Supermanager → Sincronitzar doblatges`** — obligatori si aquella jornada no hi
   ha cap doblatge (l'`onEdit` no s'hauria disparat mai). Si n'hi ha, ja s'haurà fet sol,
   però tornar-hi no fa cap mal.
4. **`Partits`** — afegeix una fila per cada equip que juga, amb la jornada i l'equip.
   El resultat es posa més tard; la columna `Clau` és una fórmula, arrossega-la avall.
5. Avisa les participants. Cadascuna entra a la seva pàgina, tria 9 jugadores, marca
   capitana i respon les preguntes.

**Un cop jugats els partits**

6. **`Partits`** — escriu `V` o `D` a cada equip.
7. **Menú `Supermanager → Preparar entrada de resultats`**, omplir `PUNTS` i `FALTES` a la
   pestanya `Entrada_resultats`, i **`Supermanager → Desar resultats entrats`**.
   Només hi surten les jugadores que ha triat algú, per equip i en ordre B/A/P.
8. **`Respostes_usuari`** — posa a mà la columna `Punts_preguntes` (5 o 20 segons la
   normativa).
9. Mira **`Classificacio`** i **`Classificacio_global`**: es calculen soles.

**Manteniment (rarament)**

- `Classificacio` només té files preparades fins a la jornada 10. A partir d'aquí, copia
  les 7 últimes files cap avall i canvia'ls el número de jornada.
- Si algun dia la classificació es queda encallada, executa
  `Supermanager → Reparar fórmules de puntuació`: torna a escriure `Calcul_puntuacio` amb
  prou files per a tot el que hi hagi a `Equips_usuari`.

## Migració de les jornades 1-3

Les tres primeres jornades es van portar a mà, en un full a part (`Equips i Classificació`).
Menú **`Supermanager → Migrar jornades 1-3 del full antic`**.

D'aquelles jornades només en tenim el total de cada participant: la pestanya
`EQUIPS JORNADA` d'aquell full **es reescriu cada setmana**, de manera que el detall de la
J2 i la J3 ja no existeix. La J1 no en té: va ser un qüestionari de 10 preguntes, sense
jugadores.

Per això els totals van a una columna pròpia, **`Punts_migrats`**, i no a `Punts_equip`:
les fórmules segueixen vives, i el dia que aparegui el detall només cal esborrar la casella
migrada perquè el càlcul torni a manar. `Punts_totals` passa a ser
`=N($C)+N($D)+N($F)`.

|  | U13 | U14 | U15 | U16 | U17+SFB | U18+DE | LF2 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| J1 (preguntes) | 15 | 15 | 15 | 10 | 10 | 20 | 5 |
| J2 | 87,6 | 105,6 | 78,6 | 81,4 | 76,0 | 145,4 | 106,0 |
| J3 | 88,6 | 81,2 | 86,6 | 90,0 | 100,2 | 108,8 | 101,2 |
| **Total** | **191,2** | **201,8** | **180,2** | **181,4** | **186,2** | **274,2** | **212,2** |

### La jornada 1 del nostre full era una ronda de proves

Les 63 tries desades com a jornada 1 són del 23 i 24/09/2026: la gent provant l'app, no una
jornada de debò. Si es deixessin, la J1 sumaria els 15 punts del qüestionari **més** uns 87
punts que no van existir. Per això la migració, a més d'escriure els totals:

- esborra les files de jornada 1 de `Equips_usuari` i `Respostes_usuari`,
- buida els punts i faltes de jornada 1 de `Resultats_jugadores` (les files es queden, ja
  les regenera la sincronització),
- i torna a posar la fórmula a `Punts_equip` i `Punts_preguntes` de les files migrades, que
  a la J1 tenien els punts del qüestionari escrits a mà. Sense això es comptarien dos cops.

La competició de debò continua, doncs, a la **jornada 4**: és la que s'ha d'afegir a
`Jornades` quan toqui.

### Nota sobre els noms dels equips

No és cap error que `Classificacio` i `Classificacio_global` facin servir `U17+SFB` i
`U18+DE` mentre `Jugadores`, `Doblatges` i `Partits` fan servir `U17` i `U18`: els
primers són el **participant** (qui juga al supermanager, fixat per `u17sfb.html` i
`u18de.html`) i els segons són l'**equip del roster**. `Equips_usuari` fa servir els
dos: `Usuari` = `U17+SFB`, `Equip_jugadora` = `U17`.

## Estructura del repo

- `index.html` + `app.js` + `style.css` — la PWA.
- `u13.html`, `u14.html`, … — pàgina d'instal·lació per categoria (fixen `CATEGORIA_FIXA`,
  perquè iOS no conserva el `?u=...` en instal·lar a la pantalla d'inici).
- `manifest-*.json` — un manifest per categoria.
- `Code.gs` — còpia **desfasada** del backend (vegeu l'avís de més amunt).
- `Doblatges.gs` — sincronització dels doblatges, reparació de fórmules i migració de J1-J3.
- `Entrada.gs` — la pestanya `Entrada_resultats`, la llista curta per entrar punts i faltes.
- `Supermanager MCBF 26-27 Dades.xlsx` — instantània del full baixada el 24/09/2026.
  És només una còpia de consulta. El full de debò és el Google Sheet, i **aquest .xlsx no
  s'hi ha de tornar a pujar mai a sobre**: es perdrien l'Apps Script i les fórmules.

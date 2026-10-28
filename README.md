<div align="center">
  <img src="build/logo.svg" width="128" height="128" alt="Logo PDF" />
  <h1>PDF</h1>
  <p><strong>Cititor PDF personal</strong> — fără reclame, fără conturi, fără telemetrie.</p>
</div>

Aplicația se numește pur și simplu **PDF** — un tool personal, fără branding.
Un singur renderer (React + PDF.js) rulează pe trei ținte:

| Țintă | Formă | Status |
| --- | --- | --- |
| **Windows** | instalator NSIS (`PDF-Setup-1.0.0.exe`) | gata |
| **Linux** | AppImage + `deb` | gata |
| **Android** | APK (Capacitor) + PWA instalabilă | gata |
| **Web** | PWA instalabilă, funcționează offline | gata |

Descărcările sunt în [Releases](https://github.com/anervalens-netizen/pdf-reader/releases).

---

## Funcționalități

**Citire**
- Randare cu Mozilla PDF.js (text, vectori, imagini, formulare)
- Strat de text real → selectare, copiere, căutare funcționale
- Zoom (Ctrl+wheel, Ctrl++/−), potrivire pe lățime/pagină, navigare pe pagini
- Panou lateral cu miniaturi, cuprins (bookmarks) și lista de adnotări
- Căutare în text cu lista de rezultate și navigare între potriviri
- Temă caldă deschisă și temă neagră, plus „urmărește sistemul"

**Adnotări**
- Evidențiere și subliniere pe text selectat (5 culori)
- Notițe cu comentariu, desen liber cu stylus-ul, semnătură desenată
- Adnotările se păstrează local (IndexedDB) între sesiuni
- „Salvează o copie" scrie adnotările într-un PDF nou — fișierul original nu e atins niciodată

**Sistem**
- Deschidere prin dialog, drag & drop, asociere de fișiere `.pdf` (dublu clic în Explorator)
- Documente deschise recent + sesiune de citire (pagina și zoomul)
- Fereastră cu title bar personalizat și controale native Windows
- Meniu nativ, scurtături de tastatură, tipărire
- Pe Android: selector de fișiere al sistemului (SAF), buton „înapoi" care închide documentul

## Scurtături de tastatură

| Comandă | Acțiune |
| --- | --- |
| `Ctrl+O` | Deschide document |
| `Ctrl+F` | Caută în document |
| `Ctrl+S` / `Ctrl+Shift+S` | Salvează o copie cu adnotări |
| `Ctrl+P` | Tipărește |
| `Ctrl+B` | Arată/ascunde panoul lateral |
| `Ctrl+0` / `Ctrl+1` / `Ctrl+2` | Zoom 100% / potrivire lățime / potrivire pagină |
| `Ctrl++` / `Ctrl+-` | Mărește / micșorează |
| `Ctrl+Shift+D` | Comută tema |
| `PageUp` / `PageDown` | Pagina anterioară / următoare |
| `F3` / `Shift+F3` | Rezultatul următor / anterior |
| `H` `U` `N` `D` | Unelte: evidențiere, subliniere, notiță, desen |
| `Esc` | Anulează unealta / închide căutarea |

## Developere

```bash
npm install
npm run dev         # pornește aplicația Electron cu hot reload
npm run dev:web     # pornește varianta web (PWA)
npm run typecheck   # verifică tipurile (main + renderer)
npm run build       # build de producție Electron în out/
```

### Scripturi auxiliare

```bash
npm run icons          # regenerează logo-ul și toate icoanele (desktop, PWA, Android)
npm run test:export    # test end-to-end pentru exportul de adnotări
npm run test:web       # QA end-to-end pentru build-ul web (randare + recente)
node scripts/make-sample-pdf.mjs   # creează samples/pdf-sample.pdf (12 pagini)
```

Capturile de QA se generează pornind aplicația cu:

```bash
PDF_CAPTURE_DIR=qa PDF_CAPTURE_PDF=samples/pdf-sample.pdf npx electron .
```

### Packaging

```bash
npm run dist:win     # instalator NSIS: release/PDF-Setup-1.0.0.exe
npm run dist:linux   # AppImage + deb
```

### Varianta web și Android

Rendererul e același; singura diferență e puntea `PdfApi`, care în browser
este implementată cu API-urile web (`<input type="file">`, File System Access
API, IndexedDB).

```bash
npm run build:web     # build static în dist-web/
npm run android:sync  # build web + copiere în proiectul Capacitor
npm run android:open  # deschide proiectul în Android Studio
```

APK-ul se construiește în CI (JDK 21 + Android SDK 36 + Gradle), fiindcă
toolchain-ul Android nu e instalat local.

## Structura proiectului

```
src/
  main/       procesul Electron: fereastră, meniu, IPC, asocieri de fișiere
  preload/    puntea contextBridge (window.pdf) + rezolvarea drop-ului
  renderer/   aplicația React: shell, PDF.js, adnotări, IndexedDB
    public/   manifest PWA, service worker, iconele web
  shared/     tipuri comune între main și renderer
android/      proiectul nativ Capacitor (WebView + SAF)
scripts/      generatoare de icon/sample, teste, capturi QA
build/        logo-ul vectorial și icoanele rasterizate
```

## Stack

Electron 45 · React 19 · TypeScript 7 · Vite 8 · PDF.js 6.4 · pdf-lib 1.17 ·
Capacitor 8 · IndexedDB

## Versiunea 1.0.3 — remedierea observațiilor Codex

Au fost citite review-urile automate din PR #1 și PR #2; corecțiile acestei versiuni țintesc defectele reproductibile identificate de Codex:

- Desktop: copiile salvate prin dialog sunt autorizate pentru redeschidere din „Recente”.
- IndexedDB: o listă de adnotări golită intenționat nu este repopulată din metadatele vechi; deschiderea așteaptă scrierile locale încă în curs înainte de citirea adnotărilor.
- Print: pentru maximum 35 de pagini, sunt montate și randate toate paginile înainte de apelarea dialogului; documentele mai mari cer salvarea unei copii și tipărirea din cititorul sistemului, în loc să printeze pagini goale. Pipeline-ul de tipărire rămâne dependent de zoom și va fi reproiectat în 1.1.0.
- Android: salvarea prin Storage Access Framework se execută în fir de fundal pentru a nu bloca interfața la furnizori de fișiere lenți.
- PWA: navigația cu HTTP 503 folosește interfața offline deja memorată în cache, cu test de regresie.
- Dependențe: `uuid` transitive actualizat prin override la ramura reparată 11.1.1+, cu audit npm curat.

Review-ul privind aparența vizuală Unicode a formularelor **nu este încă închis complet**. Valoarea este păstrată în PDF și există avertizare, dar pentru afișarea corectă în orice cititor trebuie folosit un font Unicode în aparențele formularului.

## Versiunea 1.0.2 — integritatea datelor și stabilitate

- **IndexedDB**: confirmăm tranzacțiile numai la `oncomplete`. Eșecul stocării unui document nu mai este mascat; erorile la adnotări sunt afișate și recomandă salvarea unei copii PDF.
- **Adnotări**: modificările rapide sunt serializate per document, evitând suprascrierea stării noi cu o versiune veche.
- **Migrare**: la reimportul unui PDF identic păstrat în v1.0.0 sub cheia `web:<nume>`, sesiunile și adnotările sunt copiate către cheia SHA-256 fără ștergerea originalului. Fișierele diferite cu același nume nu sunt amestecate.
- **Electron**: accesul la fișiere este permis numai după autorizarea implicită prin dialogul sistemului, deschiderea din sistemul de operare sau drag-and-drop. Permisiunile sunt păstrate într-un fișier local de metadate, fără a trimite documente pe server. Fișierele din „Recente” neautorizate anterior necesită reselectare.
- **Performanță**: pagina și stratul text sunt demontate când sunt la distanță de viewport, fără a pierde sloturile necesare navigării. Un test de 140 de pagini a păstrat doar 3 canvas-uri active la finalul documentului.
- **Android**: suport în cod pentru „Deschide cu” prin intentul `ACTION_VIEW` și `ContentResolver`. Importul extern prin bridge este limitat la 32 MB pentru a reduce riscul de epuizare a memoriei; nu înlocuiește testarea pe telefon fizic.
- **QA**: teste de migrare a notițelor, două PDF-uri cu același nume, PDF deteriorat, document mare, plus test desktop pentru respingerea unei citiri neautorizate.

## Versiunea 1.0.1 — corecții și verificări

- Android: salvarea PDF folosește selectorul nativ de documente (SAF), fără permisiuni largi de stocare.
- Web/Android: identitate SHA-256 pentru documente, pentru a evita coliziunea dintre fișiere cu același nume. Datele anterioare din IndexedDB rămân accesibile.
- Export: valorile de formular AcroForm (text, checkbox, radio, dropdown) sunt mapate corect între PDF.js și pdf-lib; comentariile se păstrează integral în adnotări PDF de tip Text, inclusiv cu diacritice.
- Desktop: sandbox Electron activ și deschiderea fișierelor din sistem sincronizată cu pornirea rendererului.
- PWA: navigațiile folosesc network-first cu fallback offline. Bara de instrumente mobilă are scroll fără indicator deranjant.
- Teste: generare automată PDF de probă, verificări de export și formular, UI Web/Electron și regresii.
- PDF deteriorat: explicație explicită și recomandare de re-descărcare. Aplicația nu pretinde că poate repara orice fișier incomplet.

## Limitări cunoscute

- **Tipărirea** folosește pipeline-ul de print al browserului: foaia de stil de print ascunde
  interfața și pune câte o pagină pe foaie. Rezoluția urmează zoomul curent, nu o rezoluție
  de tipărire dedicată.
- **Adnotările exportate** sunt desenate ca conținut de pagină (aspect vizual identic), nu ca
  obiecte de adnotare PDF interactive.
- **Actualizările automate** sunt cablate, dar inactive până când `PDF_UPDATE_FEED` indică un
  furnizor de release-uri. În repo sunt deja configurate release-urile GitHub.
- **Formularele** se completează interactiv (PDF.js), iar valorile sunt exportate în copia
  rezultată pe câmpurile care pot fi scrise.
- **Android**: deschiderea din managerul de fișiere prin „Deschide cu” este implementată în 1.0.2, dar trebuie validată pe dispozitiv fizic; pentru fișiere externe peste 32 MB trebuie folosită o cale de import diferită.
- **Android**: APK-ul din CI este semnat cu cheia de debug. Pentru un APK semnat cu o cheie
  personală, adaugă secretele `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` și
  `ANDROID_KEY_ALIAS` în repo — workflow-ul construiește automat și varianta de release.

## Licență

MIT

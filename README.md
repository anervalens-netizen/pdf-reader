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
- **Android**: documentele se deschid din selectorul de fișiere al aplicației. Deschiderea
  directă din managerul de fișiere („Deschide cu → PDF") nu este încă legată.
- **Android**: APK-ul din CI este semnat cu cheia de debug. Pentru un APK semnat cu o cheie
  personală, adaugă secretele `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` și
  `ANDROID_KEY_ALIAS` în repo — workflow-ul construiește automat și varianta de release.

## Licență

MIT

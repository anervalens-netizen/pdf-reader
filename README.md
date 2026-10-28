# PDF — cititor PDF personal

Cititor PDF pentru Windows, construit pentru citit liniștit: fără reclame, fără conturi,
fără telemetrie. Deschide, citește, caută, evidențiază, semnează, salvează.

Aplicația se numește pur și simplu **PDF** — un tool personal, fără branding.

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
- „Salvează o copie” scrie adnotările într-un PDF nou — fișierul original nu e atins niciodată

**Sistem**
- Deschidere prin dialog, drag & drop, asociere de fișiere `.pdf` (dublu clic în Explorator)
- Documente deschise recent + sesiune de citire (pagina și zoomul)
- Fereastră cu title bar personalizat și controale native Windows
- Meniu nativ, scurtături de tastatură, tipărire

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

## Developare

```bash
npm install
npm run dev        # pornește aplicația cu hot reload
npm run typecheck  # verifică tipurile (main + renderer)
npm run build      # build de producție în out/
```

### Scripturi auxiliare

```bash
npm run icons          # regenerează build/icon.png
npm run test:export    # test end-to-end pentru exportul de adnotări
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

## Structura proiectului

```
src/
  main/       procesul Electron: fereastră, meniu, IPC, asocieri de fișiere
  preload/    puntea contextBridge (window.pdf) + rezolvarea drop-ului
  renderer/   aplicația React: shell, PDF.js, adnotări, IndexedDB
  shared/     tipuri comune între main și renderer
scripts/      generatoare de icon/sample, teste, capturi QA
```

## Stack

Electron 45 · React 19 · TypeScript 5.9 · Vite 8 · PDF.js 6.4 · pdf-lib 1.17 · IndexedDB

## Limitări cunoscute

- **Tipărirea** folosește pipeline-ul de print al browserului: foaia de stil de print ascunde
  interfața și pune câte o pagină pe foaie. Rezoluția urmează zoomul curent, nu o rezoluție
  de tipărire dedicată.
- **Adnotările exportate** sunt desenate ca conținut de pagină (aspect vizual identic), nu ca
  obiecte de adnotare PDF interactive.
- **Actualizările automate** sunt cablate, dar inactive până când `PDF_UPDATE_FEED` indică un
  furnizor de release-uri (GitHub Releases sau similar).
- **Formularele** se completează interactiv (PDF.js), iar valorile sunt exportate în copia
  rezultată pe câmpurile care pot fi scrise.

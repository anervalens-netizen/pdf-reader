# PDF Reader 1.2.0 — Plan and quality gate

## P1 — security and long-document printing
- Render vector PDF print instead of mounting 35+ canvases.
- Authorize Electron IPC against the main frame; validate paths and bytes.
- Include missing MIT and Folio third-party attribution.

## P2 — editor
- Unicode textbox overlays with saved PDF export.
- Undo/Redo bounded to 60 steps and one document.
- Photograph or capture a handwritten signature; clean background locally.

## P3 — optional AI and distribution
- ChatGPT plan OAuth, opt-in document text, page citations.
- Desktop update check on opt-in and explicit update download.
- Windows/Linux/Android PR quality checks without Android signing secrets.

## Verification
- Typecheck, build, native Electron smoke, PWA/Android builds.
- Export and Unicode, Undo/Redo, 12/140-page vector printing,
  Web/mobile QA and npm audit.
- Remaining real-device gates: Windows native install and print, OAuth
  sign-in and AI response, physical Android upgrade and camera,
  published release update. Do not claim these were verified.


## Codex PR #6 — Seven P2 regressions (31 Oct 2026)

1. Cancel active AI request on document switch; events are bound to source document.
2. Limit historical chat to nine completed message pairs plus context and current prompt.
3. Print password-protected PDFs through a new rasterized temporary PDF generated
   from PDF.js's already-unlocked content, without altering the source.
4. Abort print preparation and iframe printing when the document changes.
5. Preserve original PNG/WebP alpha during signature-background removal.
6. Keep drawn-signature canvas mounted when switching between photo/draw modes.
7. Verify Unicode glyph coverage before export; block user save/print on missing
   text glyphs rather than silently corrupting a document.

Checks: test:ai, test:text, test:mobile, test:encrypted, test:web,
test:export, typecheck, build and npm audit. GitHub Codex re-review required.

## Codex PR #7 — Additional review corrections

- During file opening/password prompts, invalidate old PDF.js/document bytes,
  annotation state and print session immediately. The new PDF's filename never
  points at the previous document's content. Pending loads are epoch-checked.
- Correct Android/mobile QA selectors to use valid CSS attribute syntax.
- Regression verifies opening A then protected B and confirms Save/Print are
  disabled while B awaits its password; mobile QA exercises actual signatures.
- Pinned build metadata includes repository homepage, tested with a clean
  npm install and actual AppImage/DEB generation plus packaged MIT notices.

Release gate: latest GitHub CI and explicit Codex re-review on the final head.

- Codex PR #7 follow-up: protected PDF rasterization now uses PDF.js `intent: print` so print-only layers/annotations are respected.

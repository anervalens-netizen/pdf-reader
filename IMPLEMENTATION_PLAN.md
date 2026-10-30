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

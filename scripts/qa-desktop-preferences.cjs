const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  ipcMain.handle('pdf:app-info', () => ({ version: '1.2.1', platform: process.platform, updatesSupported: false }))
  ipcMain.handle('pdf:titlebar-theme', () => undefined)
  ipcMain.handle('pdf:is-maximized', () => false)
  ipcMain.handle('pdf:check-updates', () => ({ status: 'not-available' }))

  const win = new BrowserWindow({
    width: 1024, height: 768, show: true,
    webPreferences: {
      preload: path.join(root, 'out/preload/index.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false
    }
  })
  const evaluate = (js) => win.webContents.executeJavaScript(js, true)
  const ready = async (condition, message) => {
    for (let i = 0; i < 60; i++) {
      if (await evaluate(condition)) return
      await delay(100)
    }
    throw new Error(message)
  }
  const openPreferences = async () => {
    await evaluate("([...document.querySelectorAll('.app-menu__trigger')].find(x => x.textContent.trim() === 'Setări')).click()")
    await evaluate("([...document.querySelectorAll('.app-menu__item')].find(x => x.textContent.trim() === 'Preferințe…')).click()")
    await ready("!!document.querySelector('[aria-label=\"Preferințe PDF\"]')", 'Preferences did not open')
  }
  const closePreferences = async () => {
    await evaluate("document.querySelector('.app-menu__modal .btn--primary').click()")
    await ready("!document.querySelector('[aria-label=\"Preferințe PDF\"]')", 'Preferences did not close')
  }
  try {
    await win.loadFile(path.join(root, 'out/renderer/index.html'))
    await ready("!!document.querySelector('.app-menu--desktop') && !!document.querySelector('[aria-label=\"Actualizări\"]')", 'desktop menu did not render')
    assert.equal(await evaluate("typeof window.pdf"), 'object', 'Electron preload missing')
    await evaluate("localStorage.setItem('pdf.autoUpdateCheck','false')")
    await openPreferences()
    assert.equal(await evaluate("document.querySelector('.app-menu__checkbox input').checked"), false, 'initial auto-update is not false')
    await closePreferences()

    // Reproduce the original Codex finding through the real UpdateDialog.
    await evaluate("document.querySelector('[aria-label=\"Actualizări\"]').click()")
    await ready("!!document.querySelector('[aria-label=\"Actualizări PDF\"]')", 'Updates dialog missing')
    await evaluate("document.querySelector('.update-check-label input').click()")
    assert.equal(await evaluate("localStorage.getItem('pdf.autoUpdateCheck')"), 'true', 'Updates did not save true')
    await evaluate("document.querySelector('[aria-label=\"Actualizări PDF\"] .modal__footer .btn:last-child').click()")
    await openPreferences()
    assert.equal(await evaluate("document.querySelector('.app-menu__checkbox input').checked"), true, 'Preferences showed stale false after Updates enabled')
    await closePreferences()

    await evaluate("document.querySelector('[aria-label=\"Actualizări\"]').click()")
    await evaluate("document.querySelector('.update-check-label input').click()")
    assert.equal(await evaluate("localStorage.getItem('pdf.autoUpdateCheck')"), 'false', 'Updates did not save false')
    await evaluate("document.querySelector('[aria-label=\"Actualizări PDF\"] .modal__footer .btn:last-child').click()")
    // Also cover the Electron native menu path (rather than only the in-app menu).
    win.webContents.send('pdf:menu-action', 'settings')
    await ready("!!document.querySelector('[aria-label=\"Preferințe PDF\"]')", 'native Settings did not open')
    assert.equal(await evaluate("document.querySelector('.app-menu__checkbox input').checked"), false, 'native Settings showed stale true')
    console.log('OK — desktop Preferences reflects UpdateDialog true→false and native Settings event')
  } finally {
    win.destroy()
  }
}
app.whenReady().then(main).then(() => app.exit(0)).catch((error) => {
  console.error(error)
  app.exit(1)
})

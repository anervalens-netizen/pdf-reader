import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

export function buildApplicationMenu(getWindow: () => BrowserWindow | null): void {
  const send = (action: string): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('pdf:menu-action', action)
  }

  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.getName(),
            submenu: [
              { role: 'about', label: `Despre ${app.getName()}` },
              { type: 'separator' },
              { role: 'hide', label: 'Ascunde' },
              { role: 'hideOthers', label: 'Ascunde celelalte' },
              { role: 'unhide', label: 'Arată toate' },
              { type: 'separator' },
              { role: 'quit', label: 'Ieși' }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'Fișier',
      submenu: [
        { label: 'Deschide…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Deschise recent…', click: () => send('recent') },
        { type: 'separator' },
        { label: 'Salvează o copie…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { label: 'Tipărește…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
        { type: 'separator' },
        { label: 'Închide documentul', accelerator: 'CmdOrCtrl+W', click: () => send('close-document') },
        ...(isMac ? [] : ([{ type: 'separator' }, { role: 'quit', label: 'Ieși' }] as MenuItemConstructorOptions[]))
      ]
    },
    {
      label: 'Editare',
      submenu: [
        { label: 'Copiază', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Selectează tot', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        { label: 'Caută…', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { label: 'Caută următorul', accelerator: 'F3', click: () => send('find-next') },
        { label: 'Caută anteriorul', accelerator: 'Shift+F3', click: () => send('find-prev') }
      ]
    },
    {
      label: 'Vizualizare',
      submenu: [
        { label: 'Arată/ascunde panoul lateral', accelerator: 'CmdOrCtrl+B', click: () => send('toggle-sidebar') },
        { type: 'separator' },
        { label: 'Mărește', accelerator: 'CmdOrCtrl+Plus', click: () => send('zoom-in') },
        { label: 'Micșorează', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: 'Resetare zoom', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { type: 'separator' },
        { label: 'Potrivește lățimea', accelerator: 'CmdOrCtrl+1', click: () => send('fit-width') },
        { label: 'Potrivește pagina', accelerator: 'CmdOrCtrl+2', click: () => send('fit-page') },
        { type: 'separator' },
        { label: 'Comută tema', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('toggle-theme') },
        { label: 'Ecran complet', accelerator: 'F11', click: () => send('toggle-fullscreen') }
      ]
    },
    {
      label: 'Setări', submenu: [{ label: 'Preferințe…', click: () => send('settings') }]
    },
    {
      label: 'Ajutor',
      submenu: [
        {
          label: 'Despre PDF',
          click: () => send('about')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

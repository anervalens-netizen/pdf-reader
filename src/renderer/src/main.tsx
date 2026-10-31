import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './state/store'
import { isDesktop } from './lib/api'
import './styles/theme.css'
import './styles/app.css'
import './styles/menus.css'
import './styles/pdfjs.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
)

// The service worker only makes sense in the browser build; it keeps the app
// usable offline and makes the PWA installable.
if (!isDesktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('./sw.js')
      .catch((error) => console.warn('[sw] registration failed', error))
  })
}

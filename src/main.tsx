import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './lib/auth-context'
import { CloudSyncProvider } from './lib/cloud-sync-context'
import App from './App'
import { APP_VERSION } from './version'
import './index.css'

// 静默检查版本：CDN 缓存导致旧版时自动刷新
fetch('./version.json?t=' + Date.now()).then(r => r.json()).then(data => {
  if (data.version && data.version !== APP_VERSION) {
    window.location.reload()
  }
}).catch(() => {})

// 清除旧 PWA Service Worker（如有残留）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister())
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CloudSyncProvider>
        <App />
      </CloudSyncProvider>
    </AuthProvider>
  </StrictMode>,
)

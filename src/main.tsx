import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './lib/auth-context'
import { CloudSyncProvider } from './lib/cloud-sync-context'
import App from './App'
import './index.css'

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

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './lib/auth-context'
import { CloudSyncProvider } from './lib/cloud-sync-context'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CloudSyncProvider>
        <App />
      </CloudSyncProvider>
    </AuthProvider>
  </StrictMode>,
)

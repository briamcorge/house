import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './lib/auth-context'
import { CloudSyncProvider } from './lib/cloud-sync-context'
import ErrorBoundary from './components/ErrorBoundary'
import { installGlobalErrorHandlers } from './lib/bug-report/collector'
import { installBugActionObserver } from './lib/bug-report/actions'
import App from './App'
import './index.css'

// 在 React 渲染前安装：登录页、Provider、App 主体之外的原生错误也能进诊断队列。
installGlobalErrorHandlers()
installBugActionObserver()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <CloudSyncProvider>
          <App />
        </CloudSyncProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)

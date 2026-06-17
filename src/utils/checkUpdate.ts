import { APP_VERSION } from '../version'

export interface UpdateInfo {
  version: string
  apkUrl: string
  notes: string
}

/**
 * 在 Capacitor App 中通过原生插件（无 CORS 限制）获取版本信息，
 * 在 Web/PWA 中通过 fetch 获取。
 */
async function fetchRemoteVersion(): Promise<UpdateInfo | null> {
  // Capacitor App → 原生 HTTP 请求，无 CORS 限制
  if ((window as any).Capacitor?.isNativePlatform) {
    try {
      const { AppUpdate } = await import('./update')
      const result = await AppUpdate.checkVersion()
      return {
        version: result.version,
        apkUrl: result.apkUrl,
        notes: result.notes,
      }
    } catch {
      return null
    }
  }

  // Web/PWA → 同域 version.json（部署在 GitHub Pages，无 CORS 限制）
  try {
    const base = import.meta.env.BASE_URL || '/'
    const url = `${base}version.json`
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * 从远程拉取 version.json，对比当前版本号。
 * 有新版本则返回 UpdateInfo，否则返回 null。
 * 静默失败（网络问题等返回 null）。
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const info = await fetchRemoteVersion()
  if (!info) return null

  const current = APP_VERSION.split('.').map(Number)
  const latest = info.version.split('.').map(Number)

  for (let i = 0; i < Math.max(current.length, latest.length); i++) {
    const cur = current[i] || 0
    const lat = latest[i] || 0
    if (lat > cur) return info
    if (lat < cur) return null
  }

  return null
}

/**
 * 只获取最新版本信息（不比较），用于「关于」页面展示
 */
export async function fetchLatestVersion(): Promise<UpdateInfo | null> {
  return fetchRemoteVersion()
}

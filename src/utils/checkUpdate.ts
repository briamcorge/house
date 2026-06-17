import { APP_VERSION } from '../version'

export interface UpdateInfo {
  version: string
  apkUrl: string
  notes: string
}

// Capacitor App 内无 CORS 限制，直接请求 Gitee raw
// 网页版从同域取 version.json（已部署到 GitHub Pages/Gitee Pages）
const CHECK_URLS = [
  'https://gitee.com/c94138228/house/raw/master/version.json',
  './version.json',
]

async function fetchFromUrls(): Promise<UpdateInfo | null> {
  for (const url of CHECK_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (res.ok) return await res.json()
    } catch {
      // 当前 URL 失败，尝试下一个
    }
  }
  return null
}

/**
 * 从 Gitee 或同域拉取 version.json，对比当前版本号。
 * 有新版本则返回 UpdateInfo，否则返回 null。
 * 静默失败（网络问题等返回 null）。
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const info = await fetchFromUrls()
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
  return fetchFromUrls()
}

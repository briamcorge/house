import { APP_VERSION } from '../version'

export interface UpdateInfo {
  version: string
  apkUrl: string
  notes: string
}

const VERSION_CHECK_URL = 'https://gitee.com/c94138228/house/raw/master/version.json'

/**
 * 从 Gitee 拉取 version.json，对比当前版本号。
 * 有新版本则返回 UpdateInfo，否则返回 null。
 * 静默失败（网络问题等返回 null）。
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(VERSION_CHECK_URL, { cache: 'no-cache' })
    if (!res.ok) return null
    const info: UpdateInfo = await res.json()

    const current = APP_VERSION.split('.').map(Number)
    const latest = info.version.split('.').map(Number)

    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const cur = current[i] || 0
      const lat = latest[i] || 0
      if (lat > cur) return info
      if (lat < cur) return null
    }

    return null
  } catch {
    return null
  }
}

/**
 * 只获取最新版本信息（不比较），用于「关于」页面展示
 */
export async function fetchLatestVersion(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(VERSION_CHECK_URL, { cache: 'no-cache' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

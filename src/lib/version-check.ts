// 自动检测更新：从 GitHub 原始文件获取最新版本号
import { APP_VERSION } from '../version'

const RAW_URL = 'https://raw.githubusercontent.com/briamcorge/house/master/src/version.ts'
const RELEASES_URL = 'https://github.com/briamcorge/house/releases'

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  downloadUrl: string
}

/** 从 GitHub 获取最新版本号，与本地版本比较 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    const res = await fetch(RAW_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()
    const match = text.match(/APP_VERSION\s*=\s*'(\d+\.\d+)'/)
    if (!match) throw new Error('无法解析版本号')

    const latestVersion = match[1]
    const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0

    return {
      hasUpdate,
      currentVersion: APP_VERSION,
      latestVersion,
      downloadUrl: `${RELEASES_URL}/tag/v${latestVersion}`,
    }
  } catch {
    return {
      hasUpdate: false,
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      downloadUrl: RELEASES_URL,
    }
  }
}

/** 版本号比较：支持 1.52 或 1.0.52 两种格式 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const maxLen = Math.max(pa.length, pb.length)
  for (let i = 0; i < maxLen; i++) {
    const av = pa[i] || 0
    const bv = pb[i] || 0
    if (av !== bv) return av - bv
  }
  return 0
}

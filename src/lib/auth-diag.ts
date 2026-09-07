// ─── 登出/被踢诊断日志 ─────────────────────────────────────────────
// 记录每次登出、被踢的触发点与关键 token 指纹，便于排查"自动登出"问题。
// 独立于业务数据（不经 Zustand persist / 离线 guard），任何时刻都能写入；
// 数据只存 localStorage，不上云，最多保留 50 条。

const DIAG_KEY = 'auth_diag_log'
const MAX_ENTRIES = 50

export interface AuthDiagEntry {
  t: string           // ISO 时间
  reason: string      // 触发点标识（见下方常量）
  detail?: string     // 补充说明（邮箱等）
  localToken?: string // 本地 device_session_token 指纹
  dbToken?: string    // 云端 active_sessions token 指纹
}

// token 指纹：只取前 8 + 后 4 位，避免完整 token 落盘，同时能对比两次记录是否一致
export function tokenFingerprint(token: string | null | undefined): string | undefined {
  if (!token) return undefined
  if (token.length <= 12) return token
  return `${token.slice(0, 8)}…${token.slice(-4)}`
}

export function pushAuthDiag(entry: Omit<AuthDiagEntry, 't'>) {
  try {
    const raw = localStorage.getItem(DIAG_KEY)
    const list: AuthDiagEntry[] = raw ? JSON.parse(raw) : []
    list.push({ t: new Date().toISOString(), ...entry })
    localStorage.setItem(DIAG_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)))
  } catch {
    // 诊断日志写入失败不影响主流程
  }
}

export function getAuthDiag(): AuthDiagEntry[] {
  try {
    const raw = localStorage.getItem(DIAG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function clearAuthDiag() {
  try {
    localStorage.removeItem(DIAG_KEY)
  } catch {
    // ignore
  }
}

// ─── F3 诊断增强（2026-09-07 幽灵锁排查）─────────────────────────
// 背景：被踢流程 signOut({scope:'local'}) 依赖网络 /logout 成功后才清本地会话，
// 网络失败/异常时 sb-* 会话键残留 →「无锁 token 但会话仍在」的僵尸实例，
// 下次启动会生成新随机 token 静默抢走云端设备锁（9c1ad566 疑似来源）。
// 以下函数只做证据采集，不改任何主流程行为。

// 当前源下所有 sb-* 会话键名（signOut 后非空 = 僵尸状态实锤）
export function listSbSessionKeys(): string[] {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-')) keys.push(k)
    }
    return keys
  } catch {
    return []
  }
}

// 本机 auth 相关存储全景指纹（用于抢锁/登出场景留证）
export function scanAuthSnapshot(): string {
  const sbKeys = listSbSessionKeys()
  return `tab_active=${localStorage.getItem('tab_active') ? '1' : '0'} lockToken=${localStorage.getItem('device_session_token') ? '1' : '0'} sbKeys=${sbKeys.length ? sbKeys.join(',') : '无'}`
}
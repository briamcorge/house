import type { BugActionEntry } from './types'
import { redactText } from './redact'
import { getCurrentRoute } from './route'

const ACTION_LOG_KEY = 'bug_action_log_v1'
const MAX_ACTIONS = 30

let memoryActions: BugActionEntry[] = []

function isActionEntry(value: unknown): value is BugActionEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<BugActionEntry>
  return typeof entry.at === 'string'
    && typeof entry.action === 'string'
    && (entry.entity === undefined || typeof entry.entity === 'string')
}

function readActions(): BugActionEntry[] {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(ACTION_LOG_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          return parsed.filter(isActionEntry).slice(-MAX_ACTIONS)
        }
      }
    }
  } catch {
    /* use memory fallback */
  }
  return memoryActions.slice(-MAX_ACTIONS)
}

function writeActions(actions: BugActionEntry[]): void {
  memoryActions = actions.slice(-MAX_ACTIONS)
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(ACTION_LOG_KEY, JSON.stringify(memoryActions))
    }
  } catch {
    /* memory fallback is enough for the current session */
  }
}

/**
 * 只记录显式标记的动作（data-bug-action），不监听输入框、不记录键值。
 * 这是给“结果不对但没报错”的问题提供复现路径，不是键盘记录器。
 */
export function logBugAction(action: string, entity?: string): void {
  const label = redactText(action, 80).trim()
  if (!label) return
  const entry: BugActionEntry = {
    at: new Date().toISOString(),
    action: label,
    entity: entity ? redactText(entity, 64) : undefined,
  }
  writeActions([...readActions(), entry].slice(-MAX_ACTIONS))
}

export function getBugActions(): BugActionEntry[] {
  return readActions()
}

export function clearBugActions(): void {
  memoryActions = []
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ACTION_LOG_KEY)
  } catch {
    /* ignore */
  }
}

interface ObservableView {
  addEventListener(type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: string, listener: (event: Event) => void, options?: boolean | EventListenerOptions): void
}

const observedViews = new WeakSet<object>()

export function installBugActionObserver(target: ObservableView = window): () => void {
  if (observedViews.has(target)) return () => {}
  observedViews.add(target)

  const onClick = (event: Event) => {
    const element = (event.target as Element | null)?.closest?.('[data-bug-action]')
    if (!element) return
    const action = element.getAttribute('data-bug-action')
    if (!action) return
    logBugAction(action, element.getAttribute('data-bug-entity') || undefined)
  }

  const onRouteChange = () => {
    logBugAction('route.change', getCurrentRoute())
  }

  target.addEventListener('click', onClick, true)
  target.addEventListener('hashchange', onRouteChange)

  return () => {
    target.removeEventListener('click', onClick, true)
    target.removeEventListener('hashchange', onRouteChange)
    observedViews.delete(target)
  }
}

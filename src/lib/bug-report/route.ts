/**
 * 只保留路由形状，不保留完整 URL / query / hash 中的 token。
 * HashRouter 的路径在 location.hash 里；UUID/长 ID 归一化成 :id。
 */
export function normalizeRoute(raw: string | null | undefined): string {
  if (!raw) return '/'

  let route = raw.replace(/^#/, '')
  route = route.split('?')[0].split('#')[0]
  route = route.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/:id',
  )
  route = route.replace(/\/\d{4,}/g, '/:id')
  route = route.replace(/\/[A-Za-z0-9_-]{24,}/g, '/:id')

  if (route.length > 120) route = `${route.slice(0, 120)}…`
  return route || '/'
}

export function getCurrentRoute(): string {
  if (typeof window === 'undefined') return '/'
  const hash = window.location.hash
  if (hash) return normalizeRoute(hash)
  return normalizeRoute(window.location.pathname)
}

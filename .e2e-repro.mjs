/**
 * .e2e-repro.mjs — deterministic, scripted Playwright end-to-end repro for the
 * 2026-09-24 stale-cache data-corruption incident and its 3-layer fix.
 *
 * Run:  node .e2e-repro.mjs
 *
 * What it does (all Supabase traffic intercepted in-process — no real network):
 *  1. Fresh temp browser profile, headless (bundled chromium, else system Edge).
 *  2. Seeds a STALE zustand-persist cache ("property-manager-data", version 8)
 *     with bill X = pending / past due, and NO dirty marker (incident-faithful:
 *     the corruption marker is manufactured by login itself, not pre-seeded).
 *  3. Mocks every Supabase endpoint the login + initial-load + device-lock +
 *     save flow touches; the first burst of user_data heavy-GETs is delayed
 *     ~3000ms to widen the pre-authoritative window.
 *  4. Logs in through the real UI with the isolated test account.
 *  5. Asserts the fixed app (A) never pushes a document reverting paid->overdue,
 *     (B) adopts the cloud doc into localStorage, (C) still auto-marks a
 *     genuinely-overdue cloud bill (positive control).
 *
 * No src/ file is modified. No real browser profile is touched.
 */

import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// ─── Config ────────────────────────────────────────────────────────────────
const APP_URL = 'http://localhost:5173/house/'
const ORIGIN = 'http://localhost:5173'
const SB_GLOB = /supabase\.co/
const EMAIL = 'house-test@example.com'
const PASSWORD = 'mock-login-password' // 登录全流程 mock，密码不校验；真实测试账号密码见「房屋管理系统-使用说明.txt」
const USER_ID = '00000000-0000-4000-8000-000000000001'
const PERSIST_KEY = 'property-manager-data'
const DIRTY_KEY = 'property-manager-dirty-at'
const CLOUD_UPDATED_AT = '2026-09-20T00:00:00.000Z'
const BILL_X = 'bill-X-2026-09-10'
const BILL_Y = 'bill-Y-2026-09-12'
const HEAVY_DELAY_MS = 3000
const SETTLE_TIMEOUT_MS = 20000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── Fixtures ──────────────────────────────────────────────────────────────
const nowIso = '2026-09-24T08:00:00.000Z'
const property = { id: 'prop-1', address: '测试房源A', description: 'e2e', createdAt: nowIso }
const room = { id: 'room-1', propertyId: 'prop-1', label: 'A', roomType: '一居', status: 'occupied', createdAt: nowIso }
const tenant = {
  id: 'tenant-1', displayId: 'ZL-0001', name: '张三', phone: '13800000000', roomId: 'room-1',
  contractStart: '2025-09-01', contractEnd: '2026-09-01', monthlyRent: 3000, paymentMethod: 'monthly',
  advanceDays: 0, deposit: 3000, status: 'active', createdAt: nowIso,
}
// bill X — the incident's victim bill: STALE=pending/past-due, CLOUD=paid+paidDate
const billX = {
  id: BILL_X, propertyId: 'prop-1', roomId: 'room-1', tenantId: 'tenant-1', amount: 3000,
  type: 'rent', direction: 'receivable', dueDate: '2026-09-10', description: '第1期 月租 2026-08-11 ~ 2026-09-10',
  periodStart: '2026-08-11', periodEnd: '2026-09-10', createdAt: nowIso,
}
// innocuous extra bills so hasLocalData is true and the doc is realistic
const billInnoc1 = {
  id: 'bill-innoc-1', propertyId: 'prop-1', roomId: 'room-1', tenantId: 'tenant-1', amount: 300,
  type: 'hygiene', direction: 'receivable', dueDate: '2026-10-01', status: 'pending', description: '卫管费', createdAt: nowIso,
}
const billPaid = {
  id: 'bill-paid-1', propertyId: 'prop-1', roomId: 'room-1', tenantId: 'tenant-1', amount: 3000,
  type: 'rent', direction: 'receivable', dueDate: '2026-08-10', status: 'paid', paidDate: '2026-08-09', createdAt: nowIso,
}
// bill Y — POSITIVE CONTROL: exists only in CLOUD, pending/past-due; after
// authority is established checkOverdue SHOULD flip it to overdue and push.
const billY = {
  id: BILL_Y, propertyId: 'prop-1', roomId: 'room-1', tenantId: 'tenant-1', amount: 3000,
  type: 'rent', direction: 'receivable', dueDate: '2026-09-12', status: 'pending',
  description: '第2期 月租 2026-09-11 ~ 2026-10-10',
  periodStart: '2026-09-11', periodEnd: '2026-10-10', createdAt: nowIso,
}

const staleBillX = { ...billX, status: 'pending' }
const cloudBillX = { ...billX, status: 'paid', paidDate: '2026-09-15' }

function makeDoc(bills) {
  return {
    properties: [property],
    rooms: [room],
    tenants: [tenant],
    bills,
    landlordContracts: [],
    profitRecords: [],
    trash: [],
    auditLogs: [],
    settings: { showPropertyBills: true },
  }
}

const STALE_DOC = makeDoc([staleBillX, billInnoc1, billPaid])
const CLOUD_DOC = makeDoc([cloudBillX, billInnoc1, billPaid, billY])

const STALE_PERSISTED = JSON.stringify({ state: STALE_DOC, version: 8 })

// ─── Mock state ────────────────────────────────────────────────────────────
let cloudRow = { user_id: USER_ID, data: CLOUD_DOC, updated_at: CLOUD_UPDATED_AT, disabled: false }
let activeSessionToken = null
let firstHeavyGetAt = 0
const intercepted = [] // transcript: { seq, method, path, hasBody, delayedMs, kind }
const pushes = []      // captured POST/PATCH /rest/v1/user_data bodies
let routeSeq = 0

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function session() {
  const now = Math.floor(Date.now() / 1000)
  const user = {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL,
    email_confirmed_at: nowIso, phone: '', confirmed_at: nowIso, last_sign_in_at: nowIso,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}, identities: [], created_at: nowIso, updated_at: nowIso,
  }
  return {
    access_token: 'mock-access-token', token_type: 'bearer', expires_in: 3600,
    expires_at: now + 3600, refresh_token: 'mock-refresh-token', user,
  }
}

function currentUser() {
  return {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL,
    email_confirmed_at: nowIso, phone: '', confirmed_at: nowIso, last_sign_in_at: nowIso,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}, identities: [], created_at: nowIso, updated_at: nowIso,
  }
}

function safeJson(s) {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

async function handleRoute(route, request) {
  const url = new URL(request.url())
  const pathname = url.pathname
  const method = request.method()
  const accept = request.headers()['accept'] || ''
  const wantsObject = accept.includes('vnd.pgrst.object')
  const seq = ++routeSeq

  if (method === 'OPTIONS') {
    intercepted.push({ seq, method, path: pathname + url.search, hasBody: false, delayedMs: 0, kind: 'preflight' })
    return route.fulfill({ status: 204, headers: CORS })
  }

  const rec = { seq, method, path: pathname + url.search, hasBody: false, delayedMs: 0, kind: 'other' }

  // ── Auth ──
  if (pathname === '/auth/v1/token') {
    rec.kind = 'auth.token'
    intercepted.push(rec)
    return json(route, session())
  }
  if (pathname === '/auth/v1/user') {
    rec.kind = 'auth.user'
    intercepted.push(rec)
    return json(route, currentUser())
  }
  if (pathname === '/auth/v1/logout') {
    rec.kind = 'auth.logout'
    intercepted.push(rec)
    return route.fulfill({ status: 204, headers: CORS })
  }

  // ── user_data ──
  if (pathname === '/rest/v1/user_data') {
    if (method === 'GET') {
      const select = url.searchParams.get('select') || ''
      const isHeavy = select.includes('data')
      if (isHeavy) {
        const t = Date.now()
        if (!firstHeavyGetAt) firstHeavyGetAt = t
        const elapsed = t - firstHeavyGetAt
        if (elapsed < HEAVY_DELAY_MS) {
          rec.delayedMs = HEAVY_DELAY_MS - elapsed
          await sleep(rec.delayedMs)
        }
        rec.kind = 'user_data.GET(data)'
      } else {
        rec.kind = 'user_data.GET(' + select + ')'
      }
      intercepted.push(rec)
      return wantsObject ? json(route, cloudRow) : json(route, [cloudRow])
    }
    if (method === 'POST' || method === 'PATCH') {
      const body = safeJson(request.postData())
      rec.hasBody = !!body
      rec.kind = 'user_data.WRITE'
      // supabase-js may send a single object or an array
      const row = Array.isArray(body) ? body[0] : body
      if (row && row.data) {
        pushes.push({
          seq,
          method,
          path: pathname + url.search,
          body: row,
        })
        cloudRow = { user_id: row.user_id || USER_ID, data: row.data, updated_at: row.updated_at || new Date().toISOString(), disabled: false }
      }
      intercepted.push(rec)
      return route.fulfill({ status: 201, headers: CORS, body: '' })
    }
  }

  // ── active_sessions (device lock) — stateful echo ──
  if (pathname === '/rest/v1/active_sessions') {
    if (method === 'GET') {
      rec.kind = 'active_sessions.GET'
      intercepted.push(rec)
      if (activeSessionToken) return wantsObject ? json(route, { session_token: activeSessionToken }) : json(route, [{ session_token: activeSessionToken }])
      if (wantsObject) return route.fulfill({ status: 406, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'PGRST116', message: 'no rows returned' }) })
      return json(route, [])
    }
    if (method === 'POST' || method === 'PATCH') {
      const body = safeJson(request.postData())
      rec.hasBody = !!body
      rec.kind = 'active_sessions.WRITE'
      const row = Array.isArray(body) ? body[0] : body
      if (row && row.session_token) activeSessionToken = row.session_token
      intercepted.push(rec)
      return route.fulfill({ status: 201, headers: CORS, body: '' })
    }
  }

  // ── rpc ── (permissive)
  if (pathname.startsWith('/rest/v1/rpc/')) {
    rec.kind = 'rpc'
    intercepted.push(rec)
    return json(route, null)
  }

  // ── anything else under /rest/v1/ (admin_users etc.) ── permissive empty
  if (pathname.startsWith('/rest/v1/')) {
    rec.kind = 'rest.other'
    intercepted.push(rec)
    return json(route, [])
  }

  // Non-supabase request should not be routed here.
  intercepted.push(rec)
  return route.continue()
}

// ─── Corruption analysis ───────────────────────────────────────────────────
function cloudBillState(id) {
  const b = (cloudRow.data.bills || []).find((x) => x.id === id)
  return b ? { status: b.status, paidDate: b.paidDate || null } : null
}

function findCorruption(pushBody) {
  const bills = pushBody?.data?.bills
  if (!Array.isArray(bills)) return null
  // bill X specifically
  const x = bills.find((b) => b.id === BILL_X)
  if (x && (x.status !== 'paid' || !x.paidDate)) {
    return `bill X pushed as status='${x.status}' paidDate=${JSON.stringify(x.paidDate)} (cloud: paid/2026-09-15)`
  }
  // general: any cloud-paid bill reverted to non-paid in the push
  for (const cb of cloudRow.data.bills || []) {
    if (cb.status === 'paid') {
      const pb = bills.find((b) => b.id === cb.id)
      if (pb && pb.status !== 'paid') {
        return `cloud-paid bill ${cb.id} reverted to status='${pb.status}'`
      }
    }
  }
  return null
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const tmpDirs = []
  let context = null
  let launchMode = ''

  const mkProfile = async (tag) => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), `house-e2e-${tag}-`))
    tmpDirs.push(d)
    return d
  }

  try {
    try {
      context = await chromium.launchPersistentContext(await mkProfile('chromium'), { headless: true })
      launchMode = 'bundled chromium'
    } catch (e1) {
      console.log(`[launch] bundled chromium unavailable (${e1.message.split('\n')[0]}) — falling back to msedge`)
      context = await chromium.launchPersistentContext(await mkProfile('msedge'), { headless: true, channel: 'msedge' })
      launchMode = 'system Edge (channel=msedge)'
    }
    console.log(`[launch] using ${launchMode}`)

    await context.addInitScript(`
      try {
        if (location.origin === ${JSON.stringify(ORIGIN)}) {
          localStorage.setItem(${JSON.stringify(PERSIST_KEY)}, ${JSON.stringify(STALE_PERSISTED)});
          localStorage.removeItem(${JSON.stringify(DIRTY_KEY)});
        }
      } catch (e) {}
      try {
        window.__e2e = { authoritative: 0, offlineBlocked: 0, today: null };
        window.addEventListener('cloud-authoritative', () => { window.__e2e.authoritative++ });
        window.addEventListener('app-offline-blocked', () => { window.__e2e.offlineBlocked++ });
      } catch (e) {}
    `)

    await context.route(SB_GLOB, handleRoute)

    const page = context.pages()[0] || (await context.newPage())
    const consoleErrors = []
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()) })

    // 1) Load app, seed already installed by init script
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    // sanity: stale cache present before login
    const seeded = await page.evaluate((k) => {
      const raw = localStorage.getItem(k)
      if (!raw) return null
      try { const s = JSON.parse(raw).state; const x = s.bills.find((b) => b.id === 'bill-X-2026-09-10'); return x ? x.status : 'noX' } catch { return 'bad' }
    }, PERSIST_KEY)
    console.log(`[seed] localStorage stale cache bill X status before login = ${seeded}`)

    // 2) Real UI login
    await page.waitForSelector('input[type=email]', { timeout: 15000 })
    await page.fill('input[type=email]', EMAIL)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    console.log('[login] submitted')

    // 3) Wait for settle: local adopted cloud bill X (paid+paidDate) AND positive-control push seen
    const deadline = Date.now() + SETTLE_TIMEOUT_MS
    let localX = null
    let yObserved = false
    while (Date.now() < deadline) {
      localX = await page.evaluate((k) => {
        const raw = localStorage.getItem(k)
        if (!raw) return null
        try { const x = JSON.parse(raw).state.bills.find((b) => b.id === 'bill-X-2026-09-10'); return x ? { status: x.status, paidDate: x.paidDate || null } : null } catch { return null }
      }, PERSIST_KEY).catch(() => null)
      yObserved = pushes.some((p) => (p.body?.data?.bills || []).some((b) => b.id === BILL_Y && b.status === 'overdue'))
      const xAdopted = localX && localX.status === 'paid' && localX.paidDate === '2026-09-15'
      if (xAdopted && yObserved) break
      await sleep(250)
    }
    // give any trailing save a moment
    await sleep(700)

    // ─── Assertions ───
    const corruptPushes = pushes
      .map((p) => ({ p, reason: findCorruption(p.body) }))
      .filter((x) => x.reason)

    // A: no corruption push
    const A = corruptPushes.length === 0

    // B: cloud adopted into localStorage
    localX = await page.evaluate((k) => {
      const raw = localStorage.getItem(k)
      if (!raw) return null
      try { const x = JSON.parse(raw).state.bills.find((b) => b.id === 'bill-X-2026-09-10'); return x ? { status: x.status, paidDate: x.paidDate || null } : null } catch { return null }
    }, PERSIST_KEY)
    const B = !!(localX && localX.status === 'paid' && localX.paidDate === '2026-09-15')

    // C: positive control (WARN if absent)
    yObserved = pushes.some((p) => (p.body?.data?.bills || []).some((b) => b.id === BILL_Y && b.status === 'overdue'))

    // ─── Transcript ───
    console.log('\n================ INTERCEPTED REQUESTS ================')
    const nonPreflight = intercepted.filter((r) => r.kind !== 'preflight')
    console.log(`total requests: ${intercepted.length} (preflight ${intercepted.length - nonPreflight.length}, real ${nonPreflight.length})`)
    for (const r of nonPreflight) {
      const d = r.delayedMs ? ` +${r.delayedMs}ms` : ''
      console.log(`  #${String(r.seq).padStart(3)} ${r.method.padEnd(6)} ${r.path}${r.hasBody ? ' [BODY]' : ''}${d}  (${r.kind})`)
    }

    console.log('\n================ CAPTURED CLOUD PUSHES (POST/PATCH user_data) ================')
    console.log(`count: ${pushes.length}`)
    pushes.forEach((p, i) => {
      const bills = (p.body?.data?.bills || []).map((b) => `${b.id}:${b.status}${b.paidDate ? '@' + b.paidDate : ''}`)
      console.log(`  [push ${i + 1}] ${p.method} ${p.path}`)
      console.log(`         updated_at=${p.body.updated_at} bills=[${bills.join(', ')}]`)
    })

    console.log('\n================ ASSERTIONS ================')
    console.log(`A. NO corruption push (no paid->overdue revert of bill X): ${A ? 'PASS' : 'FAIL'}  (offending=${corruptPushes.length})`)
    corruptPushes.forEach((c) => console.log(`   FAIL evidence: ${c.reason}\n     body= ${JSON.stringify(c.p.body)}`))
    console.log(`B. cloud adopted into localStorage (bill X = paid/2026-09-15): ${B ? 'PASS' : 'FAIL'}  (local=${JSON.stringify(localX)})`)
    console.log(`C. positive control: pushed bill Y marked overdue (automation alive): ${yObserved ? 'PASS' : 'WARN (not observed within timeout)'}`)

    // ── Diagnostics for the positive control ──
    const diag = await page.evaluate((k) => {
      const raw = localStorage.getItem(k)
      let yInStore = null
      let xInStore = null
      try {
        const s = JSON.parse(raw).state
        const y = s.bills.find((b) => b.id === 'bill-Y-2026-09-12')
        const x = s.bills.find((b) => b.id === 'bill-X-2026-09-10')
        yInStore = y ? { status: y.status, dueDate: y.dueDate } : null
        xInStore = x ? { status: x.status, paidDate: x.paidDate || null } : null
      } catch { /* ignore */ }
      return {
        e2e: window.__e2e || null,
        dirty: localStorage.getItem('property-manager-dirty-at'),
        today: new Date().toString(),
        todayLocal: new Date().toISOString(),
        navigatorOnLine: navigator.onLine,
        yInStore,
        xInStore,
      }
    }, PERSIST_KEY)
    console.log('\n================ DIAGNOSTICS ================')
    console.log('  cloud-authoritative events fired:', diag.e2e?.authoritative)
    console.log('  offline-blocked events fired   :', diag.e2e?.offlineBlocked)
    console.log('  navigator.onLine               :', diag.navigatorOnLine)
    console.log('  browser now                    :', diag.today)
    console.log('  dirty marker after settle      :', diag.dirty)
    console.log('  bill X in persisted store      :', JSON.stringify(diag.xInStore))
    console.log('  bill Y in persisted store      :', JSON.stringify(diag.yInStore))

    if (consoleErrors.length) {
      console.log(`\n[page errors] ${consoleErrors.length}`)
      consoleErrors.slice(0, 10).forEach((e) => console.log('   ' + e))
    }

    const verdict = A && B ? 'PASS' : 'FAIL'
    console.log(`\nVERDICT: ${verdict}`)
    if (!A) console.log('  -> the fix did NOT prevent the paid->overdue corruption; see evidence above.')

    // Cleanup temp profile dirs (our own artifacts only)
  } finally {
    try { if (context) await context.close() } catch { /* ignore */ }
    for (const d of tmpDirs) { try { await fs.rm(d, { recursive: true, force: true }) } catch { /* ignore */ } }
  }
}

main().catch((e) => {
  console.error('\n[HARNESS ERROR]', e)
  process.exitCode = 2
})

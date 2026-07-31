import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import StatCard from '../components/StatCard'
import BillChart from '../components/BillChart'
import { Building2, Users, Search, ArrowUpRight, ArrowDownRight, AlertTriangle, Bell, X, FileText, Receipt } from 'lucide-react'
import { formatMoney } from '../lib/utils'
import { Property, Room, Tenant, Bill, LandlordContract } from '../types'

type AlertType = 'overdue' | 'expiring'

export default function Home() {
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, landlordContracts, updateBill } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<AlertType>>(new Set())
  const [loading, setLoading] = useState(true)
  useEffect(() => { requestAnimationFrame(() => setLoading(false)) }, [])

  const dismissAlert = (type: AlertType) => {
    setDismissedAlerts(prev => new Set(prev).add(type))
  }

  // 自动标记逾期账单（每分钟检测一次）
  useEffect(() => {
    const checkOverdue = () => {
      const today = new Date().toISOString().slice(0, 10)
      const currentBills = useStore.getState().bills
      for (const bill of currentBills) {
        if (bill.status === 'pending' && bill.dueDate < today) {
          updateBill(bill.id, { status: 'overdue' })
        }
      }
    }
    checkOverdue()
    const interval = setInterval(checkOverdue, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalProperties = properties.length
  const totalRooms = rooms.length
  const occupiedRooms = tenants.filter(t => t.status === 'active').length

  const cardOverdueReceivableTotal = useMemo(() =>
    bills.filter(b =>
      b.direction === 'receivable' &&
      b.status === 'overdue' &&
      !(b.tenantId && tenants.find(t => t.id === b.tenantId)?.status === 'ended')
    ).reduce((s, b) => s + b.amount, 0),
    [bills, tenants]
  )
  const cardOverduePayableTotal = useMemo(() =>
    bills.filter(b => b.direction === 'payable' && b.status === 'overdue').reduce((s, b) => s + b.amount, 0),
    [bills]
  )

  const expiringTenants = useMemo(() =>
    tenants.filter(t => {
      if (t.status !== 'active') return false
      const daysLeft = Math.ceil((new Date(t.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysLeft >= 0 && daysLeft <= 30
    }),
    [tenants]
  )

  const expiredTenants = useMemo(() =>
    tenants.filter(t => {
      if (t.status !== 'active') return false
      const daysLeft = Math.ceil((new Date(t.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysLeft < 0
    }),
    [tenants]
  )

  const expiringLandlords = useMemo(() =>
    landlordContracts.filter(c => {
      if (c.status !== 'active') return false
      const daysLeft = Math.ceil((new Date(c.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysLeft >= 0 && daysLeft <= 30
    }),
    [landlordContracts]
  )

  const expiredLandlords = useMemo(() =>
    landlordContracts.filter(c => {
      if (c.status !== 'active') return false
      const daysLeft = Math.ceil((new Date(c.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysLeft < 0
    }),
    [landlordContracts]
  )

  const overdueReceivable = useMemo(() =>
    bills.filter(b =>
      b.direction === 'receivable' &&
      !(b.tenantId && tenants.find(t => t.id === b.tenantId)?.status === 'ended') &&
      (b.status === 'overdue' || (b.status === 'pending' && b.dueDate < new Date().toISOString().slice(0, 10)))
    ),
    [bills, tenants]
  )
  const overdueReceivableTotal = overdueReceivable.reduce((s, b) => s + b.amount, 0)

  const expiringSoon = (expiringTenants.length + expiringLandlords.length) > 0
  const hasExpired = (expiredTenants.length + expiredLandlords.length) > 0

  const recentTransactions = useMemo(() =>
    bills.filter(b => b.status === 'paid' || b.status === 'refunded')
      .sort((a, b) => b.paidDate!.localeCompare(a.paidDate!))
      .slice(0, 6),
    [bills]
  )

  if (loading) {
    return <SkeletonHome />
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 px-4 pt-4 pb-8">
          <div className="max-w-md mx-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">房屋管理</h1>
                <p className="text-blue-200 text-sm">轻松管理您的物业</p>
              </div>
              <div className="relative mt-1 flex-shrink-0 w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="text"
                  placeholder="搜索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 bg-white/15 backdrop-blur border border-white/20 rounded-lg text-sm text-white placeholder-blue-300 focus:outline-none focus:bg-white/25 focus:border-white/40"
                />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white text-sm">✕</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 搜索结果 - 紧跟搜索框下方 */}
      {searchQuery.trim() && (
        <div className="px-4 -mt-3 mb-2">
          <div className="max-w-md mx-auto">
            <SearchResults
              query={searchQuery}
              properties={properties}
              rooms={rooms}
              tenants={tenants}
              bills={bills}
              landlordContracts={landlordContracts}
              navigate={navigate}
            />
          </div>
        </div>
      )}

      <div className="px-4 -mt-7">
        <div className="max-w-md mx-auto">
          {/* 告警横幅 */}
          <div className="mb-2 space-y-2">
            {!dismissedAlerts.has('overdue') && overdueReceivable.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-800">{overdueReceivable.length} 笔账单已逾期</p>
                    <p className="text-xs text-red-600 mt-0.5">合计 ¥{formatMoney(overdueReceivableTotal)}，请尽快处理</p>
                </div>
                <button type="button" onClick={() => dismissAlert('overdue')} className="text-red-400 hover:text-red-600 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {!dismissedAlerts.has('expiring') && (expiringSoon || hasExpired) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 space-y-2">
                {expiringSoon && (
                  <div className="flex items-start gap-3">
                    <Bell className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-yellow-800">
                        {expiringTenants.length > 0 && `${expiringTenants.length} 位租客`}
                        {expiringTenants.length > 0 && expiringLandlords.length > 0 && '、'}
                        {expiringLandlords.length > 0 && `${expiringLandlords.length} 份业主合同`}
                        {' '}30天内到期
                      </p>
                      <p className="text-xs text-yellow-600 mt-0.5">请提前准备续约或退租</p>
                    </div>
                    <button type="button" onClick={() => dismissAlert('expiring')} className="text-yellow-400 hover:text-yellow-600 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {hasExpired && (
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-800">
                        {expiredTenants.length > 0 && `${expiredTenants.length} 位租客`}
                        {expiredTenants.length > 0 && expiredLandlords.length > 0 && '、'}
                        {expiredLandlords.length > 0 && `${expiredLandlords.length} 份业主合同`}
                        {' '}已过期未处理
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">合同已到期，请尽快办理续约或退租</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatCard title="房源总数" value={totalProperties} icon={Building2} color="blue" onClick={() => navigate('/properties')} />
            <StatCard title="已出租" value={`${occupiedRooms}/${totalRooms}`} icon={Users} color="green" onClick={() => navigate('/properties')} />
          </div>

          {/* 待办事项汇总 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div onClick={() => navigate('/bills', { state: { direction: 'receivable', filterStatus: 'pending' } })} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-600">逾期账单（应收）</span>
              </div>
              <p className="text-xl font-bold text-red-700">¥{formatMoney(cardOverdueReceivableTotal)}</p>
            </div>
            <div onClick={() => navigate('/bills', { state: { direction: 'payable', filterStatus: 'pending' } })} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-orange-600">逾期账单（应付）</span>
              </div>
              <p className="text-xl font-bold text-orange-700">¥{formatMoney(cardOverduePayableTotal)}</p>
            </div>
            <div onClick={() => navigate('/contracts', { state: { filter: 'attention' } })} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-yellow-600">到期租客</span>
                <span className="text-xs text-gray-400">{expiredTenants.length > 0 ? '含已过期' : '30天内'}</span>
              </div>
              <p className="text-xl font-bold text-yellow-700">{expiringTenants.length + expiredTenants.length} 人</p>
            </div>
            <div onClick={() => navigate('/contracts', { state: { filter: 'attention' } })} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-yellow-600">到期业主</span>
                <span className="text-xs text-gray-400">{expiredLandlords.length > 0 ? '含已过期' : '30天内'}</span>
              </div>
              <p className="text-xl font-bold text-yellow-700">{expiringLandlords.length + expiredLandlords.length} 人</p>
            </div>
          </div>

          {/* 月度收支趋势图表 */}
          <BillChart bills={bills} />

          {/* 近期收支流水 */}
          <div className="mb-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">近期收支流水</h3>
              <button onClick={() => navigate('/bills', { state: { direction: 'receivable', filterStatus: 'pending' } })} className="text-xs text-blue-600 hover:underline">查看全部</button>
            </div>
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">暂无流水</p>
            ) : (
              <div className="space-y-2">
                {recentTransactions.map(b => {
                  const prop = b.propertyId ? properties.find(p => p.id === b.propertyId) : null
                  const room = b.roomId ? rooms.find(r => r.id === b.roomId) : null
                  const tenant = b.tenantId ? tenants.find(t => t.id === b.tenantId) : null
                  const isRefund = b.amount < 0
                  return (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isRefund ? 'bg-orange-100' :
                          b.direction === 'receivable' ? 'bg-green-100' : 'bg-blue-100'
                        }`}>
                          {isRefund
                            ? <ArrowUpRight className="w-4 h-4 text-orange-600" />
                            : b.direction === 'receivable'
                              ? <ArrowDownRight className="w-4 h-4 text-green-600" />
                              : <ArrowUpRight className="w-4 h-4 text-blue-600" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {b.direction === 'receivable' ? (tenant?.name || '租客') : (prop?.address || '业主')}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {isRefund ? '退款' : ({ rent: '房租', deposit: '押金', agency: '中介费', sublease: '转租费', hygiene: '卫管费', internet: '网费', utilities: '水电燃气费', other: '其他费用' } as Record<string, string>)[b.type] || '其他费用'}
                            {tenant && tenant.displayId && ` #${tenant.displayId}`}
                            {room && ` · ${room.label}室`}
                            {b.description && ` · ${b.description}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-sm font-bold ${isRefund ? 'text-orange-700' : b.direction === 'receivable' ? 'text-green-700' : 'text-blue-700'}`}>
                          {isRefund ? '-' : b.direction === 'receivable' ? '+' : '-'}¥{Math.abs(b.amount).toFixed(0)}
                        </p>
                        <p className="text-xs text-gray-400">{b.paidDate}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

function SkeletonHome() {
  return (
    <div className="min-h-screen bg-gray-50 pb-24 animate-pulse">
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 px-4 pt-4 pb-8">
        <div className="max-w-md mx-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-7 w-28 bg-white/20 rounded" />
              <div className="h-4 w-36 bg-white/20 rounded" />
            </div>
            <div className="h-9 w-[180px] bg-white/15 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="px-4 -mt-7">
        <div className="max-w-md mx-auto space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="h-24 bg-white rounded-2xl shadow-sm border border-gray-100" />
            <div className="h-24 bg-white rounded-2xl shadow-sm border border-gray-100" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-24 bg-white rounded-2xl shadow-sm border border-gray-100" />
            <div className="h-24 bg-white rounded-2xl shadow-sm border border-gray-100" />
          </div>
          <div className="h-48 bg-white rounded-2xl shadow-sm border border-gray-100" />
          <div className="h-52 bg-white rounded-2xl shadow-sm border border-gray-100" />
        </div>
      </div>
    </div>
  )
}

interface SearchResultsProps {
  query: string
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  bills: Bill[]
  landlordContracts: LandlordContract[]
  navigate: ReturnType<typeof useNavigate>
}

function SearchResults({ query, properties, rooms, tenants, bills, landlordContracts, navigate }: SearchResultsProps) {
  const q = query.toLowerCase()
  const typeLabelMap: Record<string, string> = { rent: '房租', deposit: '押金', agency: '中介费', sublease: '转租费', hygiene: '卫管费', internet: '网费', utilities: '水电燃气费', other: '其他费用' }

  // 判断租客是否为续约旧合同（endReason='renew' 或 被其他合同的 previousTenantId 指向）
  const isRenewedTenant = (t: { id: string; endReason?: 'renew' | 'checkout' }) =>
    t.endReason === 'renew' || tenants.some(x => x.previousTenantId === t.id)

  const matchedProps = properties.filter((p: Property) =>
    p.address.toLowerCase().includes(q) ||
    (p.description && p.description.toLowerCase().includes(q))
  )

  const matchedTenants = tenants.filter((t: Tenant) =>
    t.name.toLowerCase().includes(q) ||
    (t.phone && t.phone.includes(q)) ||
    (t.displayId && t.displayId.toLowerCase().includes(q))
  )

  const matchedRooms = rooms.filter((r: Room) =>
    r.label.toLowerCase().includes(q) ||
    r.roomType.toLowerCase().includes(q)
  )
  for (const mr of matchedRooms) {
    const ts = tenants.filter((t: Tenant) => t.roomId === mr.id)
    for (const t of ts) {
      if (!matchedTenants.find((mt: Tenant) => mt.id === t.id)) matchedTenants.push(t)
    }
  }

  const matchedBills = bills.filter((b: Bill) =>
    (b.description && b.description.toLowerCase().includes(q)) ||
    b.amount.toString().includes(q) ||
    (typeLabelMap[b.type] && typeLabelMap[b.type].includes(q))
  ).slice(0, 5)

  const matchedLandlords = landlordContracts.filter((c: LandlordContract) =>
    (c.landlordName && c.landlordName.toLowerCase().includes(q)) ||
    (c.landlordPhone && c.landlordPhone.includes(q)) ||
    (c.displayId && c.displayId.toLowerCase().includes(q))
  )

  const hasResults = matchedProps.length > 0 || matchedTenants.length > 0 || matchedBills.length > 0 || matchedLandlords.length > 0
  if (!hasResults) {
    return <div className="text-center py-6 text-sm text-gray-400 rounded-xl bg-white shadow-sm border border-gray-100">未找到匹配结果</div>
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-3 max-h-[60vh] overflow-y-auto">
      {matchedProps.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">房源 ({matchedProps.length})</span>
            <button onClick={() => navigate('/properties')} className="text-xs text-blue-600 hover:underline">查看全部</button>
          </div>
          <div className="space-y-1">
            {matchedProps.map((p: Property) => (
              <div key={p.id} onClick={() => navigate(`/properties/${p.id}`)} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center shrink-0"><Building2 className="w-3 h-3 text-blue-600" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate">{p.address}</p>
                  <p className="text-[10px] text-gray-400">{rooms.filter((r: Room) => r.propertyId === p.id).length} 间房</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {matchedTenants.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">租客 ({matchedTenants.length})</span>
            <button onClick={() => navigate('/tenants')} className="text-xs text-blue-600 hover:underline">查看全部</button>
          </div>
          <div className="space-y-1">
            {matchedTenants.slice(0, 5).map((t: Tenant) => {
              const room = rooms.find((r: Room) => r.id === t.roomId)
              const prop = room ? properties.find((p: Property) => p.id === room.propertyId) : null
              return (
                <div key={t.id} onClick={() => room && navigate(`/properties/${prop?.id}/rooms/${room.id}`)} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center shrink-0"><Users className="w-3 h-3 text-green-600" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 truncate">{t.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{prop?.address}{room ? ` - ${room.label}室` : ''}</p>
                  </div>
                  <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full ${t.status === 'active' ? 'bg-green-100 text-green-700' : isRenewedTenant(t) ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                    {t.status === 'active' ? '在租' : isRenewedTenant(t) ? '已续约' : '已退租'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {matchedBills.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">账单 ({matchedBills.length})</span>
            <button onClick={() => navigate('/bills')} className="text-xs text-blue-600 hover:underline">查看全部</button>
          </div>
          <div className="space-y-1">
            {matchedBills.map((b: Bill) => {
              const t = b.tenantId ? tenants.find((t: Tenant) => t.id === b.tenantId) : null
              return (
                <div key={b.id} onClick={() => { const r = b.roomId ? rooms.find((r: Room) => r.id === b.roomId) : null; const p = r ? properties.find((p: Property) => p.id === r.propertyId) : null; if (r) navigate(`/properties/${p?.id}/rooms/${r.id}`) }} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div className="w-6 h-6 bg-purple-100 rounded flex items-center justify-center shrink-0"><Receipt className="w-3 h-3 text-purple-600" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 truncate">{typeLabelMap[b.type] || b.type}{b.description ? ` - ${b.description}` : ''}</p>
                    <p className="text-[10px] text-gray-400 truncate">¥{b.amount.toFixed(0)} · {t?.name || ''} · {b.dueDate}</p>
                  </div>
                  <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full ${b.status === 'paid' ? 'bg-green-100 text-green-700' : b.status === 'overdue' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                    {b.status === 'paid' ? '已收' : b.status === 'overdue' ? '逾期' : '待收'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {matchedLandlords.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">业主合同 ({matchedLandlords.length})</span>
            <button onClick={() => navigate('/contracts')} className="text-xs text-blue-600 hover:underline">查看全部</button>
          </div>
          <div className="space-y-1">
            {matchedLandlords.slice(0, 5).map((c: LandlordContract) => {
              const prop = properties.find((p: Property) => p.id === c.propertyId)
              return (
                <div key={c.id} onClick={() => navigate('/contracts')} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div className="w-6 h-6 bg-orange-100 rounded flex items-center justify-center shrink-0"><FileText className="w-3 h-3 text-orange-600" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 truncate">{c.landlordName || '业主'} #{c.displayId}</p>
                    <p className="text-[10px] text-gray-400 truncate">{prop?.address || '未知房源'} · ¥{c.monthlyRent}/月</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

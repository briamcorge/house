import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import StatCard from '../components/StatCard'
import BillChart from '../components/BillChart'
import { Building2, Users, Search, ArrowUpRight, ArrowDownRight, AlertTriangle, Bell, X } from 'lucide-react'
import { formatMoney } from '../lib/utils'

type AlertType = 'overdue' | 'expiring'

export default function Home() {
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, landlordContracts, updateBill } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<AlertType>>(new Set())

  const dismissAlert = (type: AlertType) => {
    setDismissedAlerts(prev => new Set(prev).add(type))
  }

  // 自动标记逾期账单
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    for (const bill of bills) {
      if (bill.status === 'pending' && bill.dueDate < today) {
        updateBill(bill.id, { status: 'overdue' })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalProperties = properties.length
  const totalRooms = rooms.length
  const occupiedRooms = tenants.filter(t => t.status === 'active').length

  const cardOverdueReceivableTotal = useMemo(() =>
    bills.filter(b => b.direction === 'receivable' && b.status === 'overdue').reduce((s, b) => s + b.amount, 0),
    [bills]
  )
  const cardOverduePayableTotal = useMemo(() =>
    bills.filter(b => b.direction === 'payable' && b.status === 'overdue').reduce((s, b) => s + b.amount, 0),
    [bills]
  )

  const expiringTenants = useMemo(() =>
    tenants.filter(t => {
      if (t.status !== 'active') return false
      const daysLeft = Math.ceil((new Date(t.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysLeft <= 30
    }),
    [tenants]
  )

  const expiringLandlords = useMemo(() =>
    landlordContracts.filter(c => {
      if (c.status !== 'active') return false
      const daysLeft = Math.ceil((new Date(c.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysLeft <= 30
    }),
    [landlordContracts]
  )

  const overdueReceivable = useMemo(() =>
    bills.filter(b => b.direction === 'receivable' && (b.status === 'overdue' || (b.status === 'pending' && b.dueDate < new Date().toISOString().slice(0, 10)))),
    [bills]
  )
  const overdueReceivableTotal = overdueReceivable.reduce((s, b) => s + b.amount, 0)

  const expiringSoon = (expiringTenants.length + expiringLandlords.length) > 0

  const recentTransactions = useMemo(() =>
    bills.filter(b => b.status === 'paid')
      .sort((a, b) => b.paidDate!.localeCompare(a.paidDate!))
      .slice(0, 6),
    [bills]
  )

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
            {!dismissedAlerts.has('expiring') && expiringSoon && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-start gap-3">
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
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatCard title="房源总数" value={totalProperties} icon={Building2} color="blue" onClick={() => navigate('/properties')} />
            <StatCard title="已出租" value={`${occupiedRooms}/${totalRooms}`} icon={Users} color="green" onClick={() => navigate('/properties')} />
          </div>

          {/* 待办事项汇总 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div onClick={() => navigate('/bills')} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-600">逾期账单（应收）</span>
              </div>
              <p className="text-xl font-bold text-red-700">¥{formatMoney(cardOverdueReceivableTotal)}</p>
            </div>
            <div onClick={() => navigate('/bills')} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-orange-600">逾期账单（应付）</span>
              </div>
              <p className="text-xl font-bold text-orange-700">¥{formatMoney(cardOverduePayableTotal)}</p>
            </div>
            <div onClick={() => navigate('/tenants', { state: { filter: 'expiring' } })} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-yellow-600">到期租客</span>
                <span className="text-xs text-gray-400">30天内</span>
              </div>
              <p className="text-xl font-bold text-yellow-700">{expiringTenants.length} 人</p>
            </div>
            <div onClick={() => navigate('/contracts', { state: { filter: 'expiring' } })} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-yellow-600">到期业主</span>
                <span className="text-xs text-gray-400">30天内</span>
              </div>
              <p className="text-xl font-bold text-yellow-700">{expiringLandlords.length} 人</p>
            </div>
          </div>

          {/* 月度收支趋势图表 */}
          <BillChart bills={bills} />

          {/* 近期收支流水 */}
          <div className="mb-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">近期收支流水</h3>
              <button onClick={() => navigate('/bills')} className="text-xs text-blue-600 hover:underline">查看全部</button>
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
                            {isRefund ? (b.description || '退款') : (b.direction === 'receivable' ? (tenant?.name || '租客') : (prop?.address || '业主'))}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {isRefund ? '退款' : (b.type === 'rent' ? '房租' : b.type === 'water' ? '水费' : b.type === 'electric' ? '电费' : b.type === 'gas' ? '燃气费' : '其他')}
                            {tenant && tenant.displayId && ` #${tenant.displayId}`}
                            {!isRefund && room && ` · ${room.label}室`}
                            {!isRefund && b.description && ` · ${b.description}`}
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

          {/* 搜索结果 */}
          {searchQuery.trim() && (
            <div className="mb-4 space-y-2">
              {(() => {
                const q = searchQuery.toLowerCase()
                const matchedProps = properties.filter(p => p.address.toLowerCase().includes(q))
                const matchedTenants = tenants.filter(t =>
                  t.name.toLowerCase().includes(q) ||
                  (t.phone && t.phone.includes(q)) ||
                  (t.displayId && t.displayId.toLowerCase().includes(q))
                )
                // 搜索房间标签（如A/B/C）
                const matchedRoomLabels = rooms.filter(r => r.label.toLowerCase() === q)
                for (const mr of matchedRoomLabels) {
                  const ts = tenants.filter(t => t.roomId === mr.id)
                  for (const t of ts) {
                    if (!matchedTenants.find(mt => mt.id === t.id)) matchedTenants.push(t)
                  }
                }
                if (matchedProps.length === 0 && matchedTenants.length === 0) {
                  return <div className="text-center py-6 text-sm text-gray-400">未找到匹配结果</div>
                }
                return (
                  <>
                    {matchedProps.map(p => (
                      <div key={p.id} onClick={() => navigate(`/properties/${p.id}`)} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><Building2 className="w-4 h-4 text-blue-600" /></div>
                        <div><p className="text-sm font-medium text-gray-900">{p.address}</p><p className="text-xs text-gray-400">{rooms.filter(r => r.propertyId === p.id).length} 间房</p></div>
                      </div>
                    ))}
                    {matchedTenants.map(t => {
                      const room = rooms.find(r => r.id === t.roomId)
                      const prop = room ? properties.find(p => p.id === room.propertyId) : null
                      return (
                        <div key={t.id} onClick={() => room && navigate(`/properties/${prop?.id}/rooms/${room.id}`)} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow">
                          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center"><Users className="w-4 h-4 text-green-600" /></div>
                          <div><p className="text-sm font-medium text-gray-900">{t.name}</p><p className="text-xs text-gray-400">{prop?.address}{room ? ` - ${room.label}室` : ''}</p></div>
                        </div>
                      )
                    })}
                  </>
                )
              })()}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { ChevronLeft, FileText, User, Phone, Calendar, Home, Search, BarChart3 } from 'lucide-react'

type Filter = 'all' | 'active' | 'ended' | 'expiring' | 'expired'

export default function Contracts() {
  const navigate = useNavigate()
  const location = useLocation()
  const { landlordContracts, properties, tenants, rooms, bills } = useStore()
  const initState = (location.state as { filter?: Filter } | null)?.filter
  const [landlordFilter, setLandlordFilter] = useState<Filter>(initState || 'all')
  const [tenantFilter, setTenantFilter] = useState<Filter>(initState || 'all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (initState) {
      setLandlordFilter(initState)
      setTenantFilter(initState)
    }
  }, [initState])

  const isExpiringSoon = (endDate: string) => {
    const daysLeft = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return daysLeft >= 0 && daysLeft <= 30
  }
  const isExpired = (endDate: string) => {
    const daysLeft = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return daysLeft < 0
  }

  const getBillsForContract = (contract: { id: string; propertyId: string }, direction: 'payable' | 'receivable') => {
    return bills.filter(b => b.propertyId === contract.propertyId && b.direction === direction)
  }

  const getBillsForTenant = (tenantId: string, roomId: string) => {
    return bills.filter(b => b.tenantId === tenantId && b.roomId === roomId && b.direction === 'receivable')
  }

  const matchFilter = (status: 'active' | 'ended', endDate: string, filter: Filter) => {
    if (filter === 'all') return true
    if (filter === 'active') return status === 'active'
    if (filter === 'ended') return status === 'ended'
    if (filter === 'expiring') return status === 'active' && isExpiringSoon(endDate)
    if (filter === 'expired') return status === 'active' && isExpired(endDate)
    return true
  }

  const matchSearch = (text: string) => {
    if (!searchQuery.trim()) return true
    return text.toLowerCase().includes(searchQuery.toLowerCase())
  }

  const filteredLandlord = useMemo(() =>
    landlordContracts.filter(c => {
      if (!matchFilter(c.status, c.contractEnd, landlordFilter)) return false
      const prop = properties.find(p => p.id === c.propertyId)
      const text = `${c.landlordName || ''} ${c.displayId} ${c.landlordPhone || ''} ${prop?.address || ''}`
      return matchSearch(text)
    }),
    [landlordContracts, landlordFilter, searchQuery, properties]
  )

  const filteredTenants = useMemo(() =>
    tenants.filter(t => {
      if (!matchFilter(t.status, t.contractEnd, tenantFilter)) return false
      const room = rooms.find(r => r.id === t.roomId)
      const prop = room ? properties.find(p => p.id === room.propertyId) : null
      const text = `${t.name} ${t.displayId} ${t.phone || ''} ${prop?.address || ''} ${room?.label || ''}`
      return matchSearch(text)
    }),
    [tenants, tenantFilter, searchQuery, rooms, properties]
  )

  const FilterTabs = ({ current, onChange, counts }: { current: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number> }) => (
    <div className="flex gap-2 mb-3 overflow-x-auto">
      {([
        { key: 'all' as const, label: '全部' },
        { key: 'active' as const, label: '执行中' },
        { key: 'expiring' as const, label: '30天内到期' },
        { key: 'expired' as const, label: '已过期' },
        { key: 'ended' as const, label: '已结束' },
      ] as const).map(f => (
        <button key={f.key} onClick={() => onChange(f.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${current === f.key ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          {f.label} ({counts[f.key]})
        </button>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-6 pb-3">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => navigate('/more')} className="p-1 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">合同管理</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索合同编号、姓名、地址..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto space-y-6">
          {/* 房屋代理合同 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              房屋代理合同
            </h2>
            <FilterTabs
              current={landlordFilter}
              onChange={setLandlordFilter}
              counts={{
                all: landlordContracts.length,
                active: landlordContracts.filter(c => c.status === 'active').length,
                expiring: landlordContracts.filter(c => c.status === 'active' && isExpiringSoon(c.contractEnd)).length,
                expired: landlordContracts.filter(c => c.status === 'active' && isExpired(c.contractEnd)).length,
                ended: landlordContracts.filter(c => c.status === 'ended').length,
              }}
            />
            <div className="space-y-2">
              {filteredLandlord.length === 0 ? (
                <p className="text-sm text-gray-400">暂无房屋代理合同</p>
              ) : (
                filteredLandlord.map(c => {
                  const prop = properties.find(p => p.id === c.propertyId)
                  const cBills = getBillsForContract(c, 'payable')
                  const total = cBills.reduce((s, b) => s + b.amount, 0)
                  const paid = cBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0)
                  const unpaid = total - paid
                  const daysLeft = Math.ceil((new Date(c.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  return (
                    <div key={c.id} onClick={() => navigate('/bills', { state: { propertyId: c.propertyId, direction: 'payable', filterStatus: 'all', contractLabel: `${prop?.address || ''} #${c.displayId}` } })} className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.landlordName || '业主'}</span>
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-mono ml-1">#{c.displayId}</span>
                        <div className="flex items-center gap-1">
                          {c.status === 'active' && daysLeft >= 0 && daysLeft <= 30 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{daysLeft}天</span>
                          )}
                          {c.status === 'active' && daysLeft < 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">已过期{Math.abs(daysLeft)}天</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.status === 'active' ? '执行中' : '已结束'}</span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        <div className="flex items-center gap-1"><Home className="w-3 h-3" />{prop?.address || '未知房源'}</div>
                        {c.landlordPhone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.landlordPhone}</div>}
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.contractStart} ~ {c.contractEnd}</div>
                        <div>¥{c.monthlyRent}/月</div>
                      </div>
                      {cBills.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-3 text-xs">
                          <span className="text-gray-500"><BarChart3 className="w-3 h-3 inline mr-0.5" />{cBills.length}笔</span>
                          <span className="text-orange-600">未付 ¥{unpaid.toFixed(0)}</span>
                          <span className="text-blue-600">已付 ¥{paid.toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 房屋租赁合同 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              房屋租赁合同
            </h2>
            <FilterTabs
              current={tenantFilter}
              onChange={setTenantFilter}
              counts={{
                all: tenants.length,
                active: tenants.filter(t => t.status === 'active').length,
                expiring: tenants.filter(t => t.status === 'active' && isExpiringSoon(t.contractEnd)).length,
                expired: tenants.filter(t => t.status === 'active' && isExpired(t.contractEnd)).length,
                ended: tenants.filter(t => t.status === 'ended').length,
              }}
            />
            <div className="space-y-2">
              {filteredTenants.length === 0 ? (
                <p className="text-sm text-gray-400">暂无房屋租赁合同</p>
              ) : (
                filteredTenants.map(t => {
                  const room = rooms.find(r => r.id === t.roomId)
                  const prop = room ? properties.find(p => p.id === room.propertyId) : null
                  const tBills = getBillsForTenant(t.id, t.roomId)
                  const total = tBills.reduce((s, b) => s + b.amount, 0)
                  const paid = tBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0)
                  const unpaid = total - paid
                  const daysLeft = Math.ceil((new Date(t.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  return (
                    <div key={t.id} onClick={() => { const r = rooms.find(rm => rm.id === t.roomId); if (r) navigate(`/properties/${r.propertyId}/rooms/${t.roomId}`, { state: { selectedTenantId: t.id } }) }} className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{t.name}</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono ml-1">#{t.displayId}</span>
                        <div className="flex items-center gap-1">
                          {t.status === 'active' && daysLeft >= 0 && daysLeft <= 30 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{daysLeft}天</span>
                          )}
                          {t.status === 'active' && daysLeft < 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">已过期{Math.abs(daysLeft)}天</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t.status === 'active' ? '在租' : '已退租'}</span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        {prop && <div className="flex items-center gap-1"><Home className="w-3 h-3" />{prop.address} - {room?.label}室</div>}
                        {t.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{t.phone}</div>}
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t.contractStart} ~ {t.contractEnd}</div>
                        <div>¥{t.monthlyRent}/月</div>
                      </div>
                      {tBills.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-3 text-xs">
                          <span className="text-gray-500"><BarChart3 className="w-3 h-3 inline mr-0.5" />{tBills.length}笔</span>
                          <span className="text-red-600">未收 ¥{unpaid.toFixed(0)}</span>
                          <span className="text-green-600">已收 ¥{paid.toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

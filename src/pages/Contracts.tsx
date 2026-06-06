import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { ChevronLeft, FileText, User, Phone, Calendar, Home } from 'lucide-react'

type Filter = 'all' | 'active' | 'ended'

export default function Contracts() {
  const navigate = useNavigate()
  const { landlordContracts, properties, tenants, rooms } = useStore()
  const [landlordFilter, setLandlordFilter] = useState<Filter>('all')
  const [tenantFilter, setTenantFilter] = useState<Filter>('all')

  const filteredLandlord = landlordContracts.filter(c => landlordFilter === 'all' || c.status === landlordFilter)
  const filteredTenants = tenants.filter(t => tenantFilter === 'all' || t.status === tenantFilter)

  const FilterTabs = ({ current, onChange, counts }: { current: Filter; onChange: (f: Filter) => void; counts: Record<string, number> }) => (
    <div className="flex gap-2 mb-3">
      {(['all', 'active', 'ended'] as const).map(f => (
        <button key={f} onClick={() => onChange(f)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${current === f ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          {f === 'all' ? '全部' : f === 'active' ? '执行中' : '已结束'} ({counts[f]})
        </button>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/more')} className="p-1 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">合同管理</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pt-6">
        <div className="max-w-md mx-auto space-y-6">
          {/* 业主合同 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              业主合同
            </h2>
            <FilterTabs current={landlordFilter} onChange={setLandlordFilter} counts={{ all: landlordContracts.length, active: landlordContracts.filter(c => c.status === 'active').length, ended: landlordContracts.filter(c => c.status === 'ended').length }} />
            <div className="space-y-2">
              {filteredLandlord.length === 0 ? (
                <p className="text-sm text-gray-400">暂无业主合同</p>
              ) : (
                filteredLandlord.map(c => {
                  const prop = properties.find(p => p.id === c.propertyId)
                  return (
                    <div key={c.id} onClick={() => navigate(`/properties/${c.propertyId}`)} className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.landlordName || '业主'}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.status === 'active' ? '执行中' : '已结束'}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        <div className="flex items-center gap-1"><Home className="w-3 h-3" />{prop?.address || '未知房源'}</div>
                        {c.landlordPhone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.landlordPhone}</div>}
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.contractStart} ~ {c.contractEnd}</div>
                        <div>¥{c.monthlyRent}/月</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 租客合同 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              租客合同
            </h2>
            <FilterTabs current={tenantFilter} onChange={setTenantFilter} counts={{ all: tenants.length, active: tenants.filter(t => t.status === 'active').length, ended: tenants.filter(t => t.status === 'ended').length }} />
            <div className="space-y-2">
              {filteredTenants.length === 0 ? (
                <p className="text-sm text-gray-400">暂无租客合同</p>
              ) : (
                filteredTenants.map(t => {
                  const room = rooms.find(r => r.id === t.roomId)
                  const prop = room ? properties.find(p => p.id === room.propertyId) : null
                  return (
                    <div key={t.id} onClick={() => { const r = rooms.find(rm => rm.id === t.roomId); if (r) navigate(`/properties/${r.propertyId}/rooms/${t.roomId}`) }} className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{t.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t.status === 'active' ? '在租' : '已退租'}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        {prop && <div className="flex items-center gap-1"><Home className="w-3 h-3" />{prop.address} - {room?.label}室</div>}
                        {t.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{t.phone}</div>}
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t.contractStart} ~ {t.contractEnd}</div>
                        <div>¥{t.monthlyRent}/月</div>
                      </div>
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

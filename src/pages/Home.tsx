import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import StatCard from '../components/StatCard'
import PaymentModal from '../components/PaymentModal'
import BillChart from '../components/BillChart'
import { Building2, Users, DollarSign, AlertCircle, Calendar, Search } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentModal, setPaymentModal] = useState<{ direction: 'receivable' | 'payable' } | null>(null)

  const totalProperties = properties.length
  const totalRooms = rooms.length
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length
  const totalRentReceived = bills
    .filter(b => b.direction === 'receivable' && b.status === 'paid')
    .reduce((sum, b) => sum + b.amount, 0)
  const pendingBills = bills.filter(b => b.status === 'pending' || b.status === 'overdue')

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 px-4 pt-10 pb-16">
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

      <div className="px-4 -mt-10">
        <div className="max-w-md mx-auto">
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatCard title="房源总数" value={totalProperties} icon={Building2} color="blue" onClick={() => navigate('/properties')} />
            <StatCard title="已出租" value={`${occupiedRooms}/${totalRooms}`} icon={Users} color="green" onClick={() => navigate('/properties')} />
            <StatCard title="已收租金" value={`¥${totalRentReceived}`} icon={DollarSign} color="green" onClick={() => navigate('/bills')} />
            <StatCard title="待处理账单" value={pendingBills.length} icon={AlertCircle} color={pendingBills.length > 0 ? 'orange' : 'blue'} onClick={() => navigate('/bills')} />
          </div>

          {/* 提醒区域 */}
          {(() => {
            const unpaidReceivable = bills.filter(b => b.direction === 'receivable' && (b.status === 'pending' || b.status === 'overdue'))
            const unpaidPayable = bills.filter(b => b.direction === 'payable' && (b.status === 'pending' || b.status === 'overdue'))
            const expiringSoon = tenants.filter(t => {
              if (t.status !== 'active') return false
              const daysLeft = Math.ceil((new Date(t.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              return daysLeft >= 0 && daysLeft <= 30
            })
            const alerts: { icon: React.ComponentType<{ className?: string }>; color: string; text: string; dir?: 'receivable' | 'payable' }[] = []
            if (unpaidReceivable.length > 0) alerts.push({ icon: AlertCircle, color: 'text-red-600 bg-red-50', text: `${unpaidReceivable.length} 笔租客账单未收`, dir: 'receivable' })
            if (unpaidPayable.length > 0) alerts.push({ icon: AlertCircle, color: 'text-orange-600 bg-orange-50', text: `${unpaidPayable.length} 笔房东账单未付`, dir: 'payable' })
            if (expiringSoon.length > 0) alerts.push({ icon: Calendar, color: 'text-yellow-600 bg-yellow-50', text: `${expiringSoon.length} 份合同即将到期` })
            return alerts.length > 0 ? (
              <div className="mb-6 space-y-2">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    onClick={() => alert.dir ? setPaymentModal({ direction: alert.dir }) : navigate('/tenants')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity ${alert.color}`}
                  >
                    <alert.icon className="w-5 h-5" />
                    <span>{alert.text}</span>
                  </div>
                ))}
              </div>
            ) : null
          })()}

          {/* 月度收支趋势图表 */}
          <BillChart bills={bills} />

          {/* 搜索结果 */}
          {searchQuery.trim() && (
            <div className="mb-6 space-y-2">
              {(() => {
                const q = searchQuery.toLowerCase()
                const matchedProps = properties.filter(p => p.address.toLowerCase().includes(q))
                const matchedTenants = tenants.filter(t => t.name.toLowerCase().includes(q))
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

      <PaymentModal
        isOpen={paymentModal !== null}
        onClose={() => setPaymentModal(null)}
        direction={paymentModal?.direction || 'receivable'}
      />
    </div>
  )
}

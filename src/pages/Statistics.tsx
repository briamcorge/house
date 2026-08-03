import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { ChevronLeft, ChevronDown, TrendingUp, TrendingDown, BarChart3, CalendarX2, HelpCircle, Building2, Search, X, Check } from 'lucide-react'
import { calculatePropertyVacancy } from '../utils/vacancy'
import { formatRoomLabel } from '../lib/utils'
import AlertModal from '../components/AlertModal'

export default function Statistics() {
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, landlordContracts } = useStore()

  // 默认显示当前年份
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  // 房源筛选：'' = 全部房源
  const [selectedPropId, setSelectedPropId] = useState('')
  const [showPropPicker, setShowPropPicker] = useState(false)
  const [propSearch, setPropSearch] = useState('')

  // 提取所有出现过的年份（按 paidDate 或 dueDate）
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    years.add(currentYear)
    years.add(currentYear - 1)
    for (const b of bills) {
      if (b.paidDate) years.add(parseInt(b.paidDate.slice(0, 4)))
      years.add(parseInt(b.dueDate.slice(0, 4)))
    }
    return Array.from(years).sort((a, b) => b - a)
  }, [bills, currentYear])

  // 该年已收 (租客已付，排除押金相关)
  const yearlyReceivablePaid = useMemo(() => {
    return bills
      .filter(b => b.direction === 'receivable' && b.status === 'paid' && b.paidDate?.startsWith(selectedYear.toString()))
      .filter(b => b.type !== 'deposit')
      .reduce((s, b) => s + b.amount, 0)
  }, [bills, selectedYear])

  // 该年已付 (业主已付)
  const yearlyPayablePaid = useMemo(() => {
    return bills
      .filter(b => b.direction === 'payable' && b.status === 'paid' && b.paidDate?.startsWith(selectedYear.toString()))
      .reduce((s, b) => s + b.amount, 0)
  }, [bills, selectedYear])

  // 该年退款 (负数账单)
  const yearlyRefund = useMemo(() => {
    return bills
      .filter(b => (b.status === 'refunded' || (b.status === 'paid' && b.amount < 0)) && b.paidDate?.startsWith(selectedYear.toString()))
      .reduce((s, b) => s + Math.abs(b.amount), 0)
  }, [bills, selectedYear])

  // 净收入（负数账单已自然体现在 income 中，不重复扣减）
  const netIncome = yearlyReceivablePaid - yearlyPayablePaid

  // 按房源统计
  const propertyStats = useMemo(() => {
    return properties.map(p => {
      const propRooms = rooms.filter(r => r.propertyId === p.id)
      const propTenants = tenants.filter(t => propRooms.some(r => r.id === t.roomId) && t.status === 'active')

      const propBills = bills.filter(b => {
        if (b.paidDate && !b.paidDate.startsWith(selectedYear.toString())) return false
        if (b.propertyId === p.id) return true
        if (b.roomId && propRooms.some(r => r.id === b.roomId)) return true
        return false
      })

      const income = propBills
        .filter(b => b.direction === 'receivable' && b.status === 'paid')
        .filter(b => b.type !== 'deposit')
        .reduce((s, b) => s + b.amount, 0)
      const expense = propBills
        .filter(b => b.direction === 'payable' && b.status === 'paid')
        .reduce((s, b) => s + b.amount, 0)
      const refund = propBills
        .filter(b => (b.status === 'refunded' || (b.status === 'paid' && b.amount < 0)))
        .reduce((s, b) => s + Math.abs(b.amount), 0)

      return {
        property: p,
        totalRooms: propRooms.length,
        occupiedRooms: propTenants.length,
        income,
        expense,
        refund,
        net: income - expense,  // refund 已自然体现在 income 中，不重复扣
      }
    }).sort((a, b) => b.net - a.net)
  }, [properties, rooms, tenants, bills, selectedYear])

  // 空置统计（按房源，展开房间明细）
  const vacancyStats = useMemo(() => {
    return properties
      .map(p => calculatePropertyVacancy(
        p.id,
        p.address,
        selectedYear,
        rooms.filter(r => r.propertyId === p.id),
        tenants.filter(t => rooms.some(r => r.id === t.roomId && r.propertyId === p.id)),
        landlordContracts,
      ))
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.totalVacancyDays - a.totalVacancyDays)
  }, [properties, rooms, tenants, landlordContracts, selectedYear])
  const [expandedPropId, setExpandedPropId] = useState<string | null>(null)
  const [showAvailableHelp, setShowAvailableHelp] = useState(false)

  // 按选中房源过滤
  const filteredPropertyStats = selectedPropId
    ? propertyStats.filter(s => s.property.id === selectedPropId)
    : propertyStats
  const filteredVacancyStats = selectedPropId
    ? vacancyStats.filter(v => v.propertyId === selectedPropId)
    : vacancyStats
  const selectedProp = properties.find(p => p.id === selectedPropId)

  // 选中单个房源时，财务概览显示该房源数据；否则显示全局
  const viewReceivable = selectedProp ? filteredPropertyStats[0]?.income ?? 0 : yearlyReceivablePaid
  const viewPayable = selectedProp ? filteredPropertyStats[0]?.expense ?? 0 : yearlyPayablePaid
  const viewRefund = selectedProp ? filteredPropertyStats[0]?.refund ?? 0 : yearlyRefund
  const viewNet = selectedProp ? (filteredPropertyStats[0]?.net ?? 0) : netIncome

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-2">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button type="button" onClick={() => navigate('/more')} className="p-1 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">统计报表</h1>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${selectedYear === y ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {y}年
              </button>
            ))}
          </div>
          {/* 房源筛选 */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => { setPropSearch(''); setShowPropPicker(true) }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm flex items-center justify-between"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="truncate font-medium text-gray-700">
                  {selectedProp ? selectedProp.address : '全部房源'}
                </span>
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto space-y-4">
          {/* 年度概览 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {selectedProp ? `${selectedProp.address} ` : ''}{selectedYear}年 财务概览
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-1 text-green-100 text-xs mb-1">
                  <TrendingUp className="w-3 h-3" />
                  租客收入
                </div>
                <p className="text-xl font-bold">¥{viewReceivable.toFixed(0)}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-1 text-blue-100 text-xs mb-1">
                  <TrendingDown className="w-3 h-3" />
                  业主支出
                </div>
                <p className="text-xl font-bold">¥{viewPayable.toFixed(0)}</p>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-1 text-orange-100 text-xs mb-1">
                  <TrendingDown className="w-3 h-3" />
                  退款
                </div>
                <p className="text-xl font-bold">¥{viewRefund.toFixed(0)}</p>
              </div>
              <div className={`bg-gradient-to-br ${viewNet >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600'} rounded-2xl p-4 text-white`}>
                <div className="flex items-center gap-1 text-white text-opacity-80 text-xs mb-1">
                  <BarChart3 className="w-3 h-3" />
                  净收入
                </div>
                <p className="text-xl font-bold">¥{viewNet.toFixed(0)}</p>
              </div>
            </div>
          </div>

          {/* 空置统计 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
              <CalendarX2 className="w-5 h-5" />
              {selectedProp ? `${selectedProp.address} ` : ''}{selectedYear}年 空置统计
            </h2>
            {filteredVacancyStats.length === 0 ? (
              <p className="text-sm text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">暂无房源（需有业主合同）</p>
            ) : (
              <div className="space-y-2">
                {/* 汇总卡片（全部房源时显示总累计，单个房源时显示该房源累计） */}
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white flex items-center justify-between">
                  <div>
                    <p className="text-indigo-100 text-xs mb-1">{selectedProp ? '空置' : '累计空置'}</p>
                    <p className="text-xl font-bold">{filteredVacancyStats.reduce((s, v) => s + v.totalVacancyDays, 0)} 天</p>
                  </div>
                  <div className="text-right">
                    <p className="text-indigo-100 text-xs mb-1">空置率</p>
                    <p className="text-xl font-bold">
                      {filteredVacancyStats.reduce((s, v) => s + v.totalAvailableDays, 0) > 0
                        ? `${(filteredVacancyStats.reduce((s, v) => s + v.totalVacancyDays, 0) / filteredVacancyStats.reduce((s, v) => s + v.totalAvailableDays, 0) * 100).toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                </div>

                {filteredVacancyStats.map(v => (
                  <div key={v.propertyId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedPropId(expandedPropId === v.propertyId ? null : v.propertyId)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${(expandedPropId === v.propertyId || selectedPropId === v.propertyId) ? 'rotate-180' : ''}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{v.propertyAddress}</p>
                          <p className="text-xs text-gray-400">自 {v.startDate} 起租 · 空置率 {(v.vacancyRate * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className={`text-lg font-bold shrink-0 ml-2 ${v.totalVacancyDays > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {v.totalVacancyDays} 天
                      </div>
                    </button>

                    {(expandedPropId === v.propertyId || selectedPropId === v.propertyId) && (
                      <div className="px-3 pb-3 pt-0 border-t border-gray-50">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400">
                              <th className="text-left py-2 font-normal">房间</th>
                              <th className="text-right py-2 font-normal">空置</th>
                              <th className="text-right py-2 font-normal">
                                <span className="inline-flex items-center gap-0.5">
                                  可出租
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setShowAvailableHelp(true) }}
                                    className="p-0.5 rounded-full hover:bg-gray-100 text-gray-300"
                                    title="可出租天数说明"
                                  >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              </th>
                              <th className="text-right py-2 font-normal">空置率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.rooms.map(r => (
                              <tr key={r.roomId} className="border-t border-gray-50">
                                <td className="py-2">
                                  <span className="font-medium text-gray-800">{formatRoomLabel(r.roomLabel)}</span>
                                  <span className="text-xs text-gray-400 ml-1">{r.roomType}</span>
                                </td>
                                <td className={`py-2 text-right font-medium ${r.vacancyDays > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {r.vacancyDays} 天
                                </td>
                                <td className="py-2 text-right text-gray-500">{r.availableDays} 天</td>
                                <td className="py-2 text-right text-gray-500">{(r.vacancyRate * 100).toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <AlertModal
        isOpen={showAvailableHelp}
        onClose={() => setShowAvailableHelp(false)}
        title="可出租天数"
        message={'从业主起租日起至今日，该房间可出租的总天数。\n\n空置率 = 空置天数 ÷ 可出租天数'}
      />

      {/* 房源选择弹窗 */}
      {showPropPicker && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowPropPicker(false) }}>
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold">选择房源</h3>
              <button type="button" onClick={() => setShowPropPicker(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-3 border-b border-gray-50">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={propSearch}
                  onChange={(e) => setPropSearch(e.target.value)}
                  placeholder="搜索房源地址..."
                  className="flex-1 bg-transparent outline-none text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => { setSelectedPropId(''); setShowPropPicker(false) }}
                className={`w-full px-3 py-3 rounded-xl text-sm text-left flex items-center justify-between ${selectedPropId === '' ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <span>全部房源</span>
                {selectedPropId === '' && <Check className="w-4 h-4 text-blue-600" />}
              </button>
              {properties
                .filter(p => p.address.includes(propSearch.trim()))
                .map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedPropId(p.id); setShowPropPicker(false) }}
                    className={`w-full px-3 py-3 rounded-xl text-sm text-left flex items-center justify-between ${selectedPropId === p.id ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <span className="truncate">{p.address}</span>
                    {selectedPropId === p.id && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                ))}
              {properties.filter(p => p.address.includes(propSearch.trim())).length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">未找到匹配房源</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

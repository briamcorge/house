import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { ChevronLeft, ChevronDown, TrendingUp, TrendingDown, Building2, BarChart3, CalendarX2 } from 'lucide-react'
import { calculatePropertyVacancy } from '../utils/vacancy'

export default function Statistics() {
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, landlordContracts } = useStore()

  // 默认显示当前年份
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

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

  // 全部房源空置汇总
  const totalVacancyDays = vacancyStats.reduce((s, v) => s + v.totalVacancyDays, 0)
  const totalAvailableDays = vacancyStats.reduce((s, v) => s + v.totalAvailableDays, 0)

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
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto space-y-4">
          {/* 年度概览 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {selectedYear}年 财务概览
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-1 text-green-100 text-xs mb-1">
                  <TrendingUp className="w-3 h-3" />
                  租客收入
                </div>
                <p className="text-xl font-bold">¥{yearlyReceivablePaid.toFixed(0)}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-1 text-blue-100 text-xs mb-1">
                  <TrendingDown className="w-3 h-3" />
                  业主支出
                </div>
                <p className="text-xl font-bold">¥{yearlyPayablePaid.toFixed(0)}</p>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-1 text-orange-100 text-xs mb-1">
                  <TrendingDown className="w-3 h-3" />
                  退款
                </div>
                <p className="text-xl font-bold">¥{yearlyRefund.toFixed(0)}</p>
              </div>
              <div className={`bg-gradient-to-br ${netIncome >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600'} rounded-2xl p-4 text-white`}>
                <div className="flex items-center gap-1 text-white text-opacity-80 text-xs mb-1">
                  <BarChart3 className="w-3 h-3" />
                  净收入
                </div>
                <p className="text-xl font-bold">¥{netIncome.toFixed(0)}</p>
              </div>
            </div>
          </div>

          {/* 各房源收益对比 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              房源收益对比
            </h2>
            {propertyStats.length === 0 ? (
              <p className="text-sm text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">暂无房源</p>
            ) : (
              <div className="space-y-2">
                {propertyStats.map(s => (
                  <div
                    key={s.property.id}
                    onClick={() => navigate(`/properties/${s.property.id}`)}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm text-gray-900">{s.property.address}</p>
                        <p className="text-xs text-gray-400">{s.occupiedRooms}/{s.totalRooms} 出租中</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${s.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {s.net >= 0 ? '+' : ''}¥{s.net.toFixed(0)}
                        </p>
                        <p className="text-[10px] text-gray-400">净收入</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-green-50 rounded p-1.5">
                        <p className="text-green-600">收入</p>
                        <p className="font-medium text-green-700">¥{s.income.toFixed(0)}</p>
                      </div>
                      <div className="bg-blue-50 rounded p-1.5">
                        <p className="text-blue-600">支出</p>
                        <p className="font-medium text-blue-700">¥{s.expense.toFixed(0)}</p>
                      </div>
                      <div className="bg-orange-50 rounded p-1.5">
                        <p className="text-orange-600">退款</p>
                        <p className="font-medium text-orange-700">¥{s.refund.toFixed(0)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 空置统计 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
              <CalendarX2 className="w-5 h-5" />
              {selectedYear}年 空置统计
            </h2>
            {vacancyStats.length === 0 ? (
              <p className="text-sm text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">暂无房源（需有业主合同）</p>
            ) : (
              <div className="space-y-2">
                {/* 汇总卡片 */}
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white flex items-center justify-between">
                  <div>
                    <p className="text-indigo-100 text-xs mb-1">累计空置</p>
                    <p className="text-xl font-bold">{totalVacancyDays} 天</p>
                  </div>
                  <div className="text-right">
                    <p className="text-indigo-100 text-xs mb-1">平均空置率</p>
                    <p className="text-xl font-bold">
                      {totalAvailableDays > 0 ? `${(totalVacancyDays / totalAvailableDays * 100).toFixed(1)}%` : '—'}
                    </p>
                  </div>
                </div>

                {vacancyStats.map(v => (
                  <div key={v.propertyId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedPropId(expandedPropId === v.propertyId ? null : v.propertyId)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expandedPropId === v.propertyId ? 'rotate-180' : ''}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{v.propertyAddress}</p>
                          <p className="text-xs text-gray-400">自 {v.startDate} 起租 · 空置率 {(v.vacancyRate * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className={`text-lg font-bold shrink-0 ml-2 ${v.totalVacancyDays > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {v.totalVacancyDays} 天
                      </div>
                    </button>

                    {expandedPropId === v.propertyId && (
                      <div className="px-3 pb-3 pt-0 border-t border-gray-50">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400">
                              <th className="text-left py-2 font-normal">房间</th>
                              <th className="text-right py-2 font-normal">空置</th>
                              <th className="text-right py-2 font-normal">可出租</th>
                              <th className="text-right py-2 font-normal">空置率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.rooms.map(r => (
                              <tr key={r.roomId} className="border-t border-gray-50">
                                <td className="py-2">
                                  <span className="font-medium text-gray-800">{r.roomLabel}室</span>
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
    </div>
  )
}

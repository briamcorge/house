import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Building2, BarChart3 } from 'lucide-react'

export default function Statistics() {
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills } = useStore()

  // 默认显示当前年份
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // 月度房源净收益：月份列表
  const [monthlyPropId, setMonthlyPropId] = useState<string | null>(null) // null = 全部房源
  const allPropMonthKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const b of bills) {
      if (b.paidDate) keys.add(b.paidDate.slice(0, 7))
      if (b.dueDate) keys.add(b.dueDate.slice(0, 7))
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b))
  }, [bills])
  const [propMonthIdx, setPropMonthIdx] = useState(0)
  const currentPropMonth = allPropMonthKeys[propMonthIdx] || ''

  useEffect(() => {
    if (allPropMonthKeys.length > 0 && propMonthIdx === 0) {
      // 默认跳转到本月
      const todayStr = new Date().toISOString().slice(0, 7)
      const idx = allPropMonthKeys.indexOf(todayStr)
      setPropMonthIdx(idx >= 0 ? idx : allPropMonthKeys.length - 1)
    }
  }, [allPropMonthKeys])

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
      .filter(b => !b.description?.includes('押金'))
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
      .filter(b => b.status === 'paid' && b.amount < 0 && b.paidDate?.startsWith(selectedYear.toString()))
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
        .filter(b => !b.description?.includes('押金'))
        .reduce((s, b) => s + b.amount, 0)
      const expense = propBills
        .filter(b => b.direction === 'payable' && b.status === 'paid')
        .reduce((s, b) => s + b.amount, 0)
      const refund = propBills
        .filter(b => b.amount < 0 && b.status === 'paid')
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

  // 去年数据（用于对比）
  const prevYear = selectedYear - 1
  const prevYearIncome = useMemo(() =>
    bills.filter(b => b.direction === 'receivable' && b.status === 'paid' && b.paidDate?.startsWith(prevYear.toString()))
      .filter(b => b.description !== '押金')
      .reduce((s, b) => s + b.amount, 0), [bills, prevYear])
  const prevYearExpense = useMemo(() =>
    bills.filter(b => b.direction === 'payable' && b.status === 'paid' && b.paidDate?.startsWith(prevYear.toString()))
      .reduce((s, b) => s + b.amount, 0), [bills, prevYear])
  const prevYearNet = prevYearIncome - prevYearExpense
  const incomeChange = prevYearIncome > 0 ? ((yearlyReceivablePaid - prevYearIncome) / prevYearIncome * 100) : 0
  const expenseChange = prevYearExpense > 0 ? ((yearlyPayablePaid - prevYearExpense) / prevYearExpense * 100) : 0

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

          {/* 年度对比 */}
          {prevYearIncome > 0 || prevYearExpense > 0 ? (
            <div>
              <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                与{prevYear}年对比
              </h2>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">收入</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">¥{prevYearIncome.toFixed(0)}</span>
                    <span className="text-xs">→</span>
                    <span className="text-sm font-bold text-green-700">¥{yearlyReceivablePaid.toFixed(0)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${incomeChange >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {incomeChange >= 0 ? '+' : ''}{incomeChange.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">支出</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">¥{prevYearExpense.toFixed(0)}</span>
                    <span className="text-xs">→</span>
                    <span className="text-sm font-bold text-blue-700">¥{yearlyPayablePaid.toFixed(0)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${expenseChange <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {expenseChange >= 0 ? '+' : ''}{expenseChange.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                  <span className="text-sm text-gray-500">净收入</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">¥{prevYearNet.toFixed(0)}</span>
                    <span className="text-xs">→</span>
                    <span className={`text-sm font-bold ${netIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>¥{netIncome.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

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

          {/* 月度房源净收益 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              月度房源净收益
            </h2>

            {/* 房源选择 */}
            <div className="mb-2">
              <select
                value={monthlyPropId ?? ''}
                onChange={(e) => setMonthlyPropId(e.target.value || null)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm appearance-none"
              >
                <option value="">全部房源</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.address}</option>
                ))}
              </select>
            </div>

            {/* 月份导航 */}
            {allPropMonthKeys.length > 0 && (
              <div className="flex items-center justify-between mb-2 bg-white rounded-xl shadow-sm border border-gray-100 p-3">
                <button
                  type="button"
                  onClick={() => propMonthIdx > 0 && setPropMonthIdx(propMonthIdx - 1)}
                  className={`p-2 rounded-lg ${propMonthIdx > 0 ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-default'}`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-base font-bold text-gray-800">
                  {currentPropMonth ? `${currentPropMonth.slice(0, 4)}年${parseInt(currentPropMonth.slice(5, 7))}月` : ''}
                </h3>
                <button
                  type="button"
                  onClick={() => propMonthIdx < allPropMonthKeys.length - 1 && setPropMonthIdx(propMonthIdx + 1)}
                  className={`p-2 rounded-lg ${propMonthIdx < allPropMonthKeys.length - 1 ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-default'}`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* 月度收益计算 */}
            {(() => {
              if (!currentPropMonth) return <p className="text-sm text-gray-400 text-center py-4">暂无数据</p>

              const monthBills = bills.filter(b => {
                if (b.status !== 'paid' || !b.paidDate) return false
                if (!b.paidDate.startsWith(currentPropMonth)) return false
                if (monthlyPropId !== null) {
                  // Check if bill belongs to this property
                  if (b.propertyId === monthlyPropId) return true
                  // Also check via room property
                  if (b.roomId) {
                    const room = rooms.find(r => r.id === b.roomId)
                    if (room && room.propertyId === monthlyPropId) return true
                  }
                  return false
                }
                return true
              })

              const income = monthBills
                .filter(b => b.direction === 'receivable')
                .filter(b => b.description !== '押金')
                .reduce((s, b) => s + b.amount, 0)
              const expense = monthBills
                .filter(b => b.direction === 'payable')
                .reduce((s, b) => s + Math.abs(b.amount), 0)
              const refund = monthBills
                .filter(b => b.amount < 0)
                .reduce((s, b) => s + Math.abs(b.amount), 0)
              const net = income - expense - refund

              return (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white">
                    <p className="text-green-100 text-xs mb-1">收入</p>
                    <p className="text-lg font-bold">¥{income.toFixed(0)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
                    <p className="text-blue-100 text-xs mb-1">支出</p>
                    <p className="text-lg font-bold">¥{expense.toFixed(0)}</p>
                  </div>
                  <div className={`bg-gradient-to-br ${net >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600'} rounded-2xl p-4 text-white`}>
                    <p className="text-white text-opacity-80 text-xs mb-1">净收益</p>
                    <p className="text-lg font-bold">{net >= 0 ? '+' : ''}¥{net.toFixed(0)}</p>
                  </div>
                </div>
              )
            })()}
          </div>

        </div>
      </div>
    </div>
  )
}

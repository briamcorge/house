import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { ChevronLeft, TrendingUp, TrendingDown, Home, Building2, BarChart3, Wallet, DollarSign } from 'lucide-react'

export default function Statistics() {
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, landlordContracts, profitRecords } = useStore()

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

  // 该年已收 (租客已付)
  const yearlyReceivablePaid = useMemo(() => {
    return bills
      .filter(b => b.direction === 'receivable' && b.status === 'paid' && b.paidDate?.startsWith(selectedYear.toString()))
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

  // 净收入
  const netIncome = yearlyReceivablePaid - yearlyPayablePaid - yearlyRefund

  // 入住率统计
  const occupancyStats = useMemo(() => {
    const totalRooms = rooms.length
    const activeTenants = tenants.filter(t => t.status === 'active').length
    return {
      totalRooms,
      occupiedRooms: activeTenants,
      occupancyRate: totalRooms > 0 ? Math.round((activeTenants / totalRooms) * 100) : 0,
    }
  }, [rooms, tenants])

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
        .reduce((s, b) => s + b.amount, 0)
      const expense = propBills
        .filter(b => b.direction === 'payable' && b.status === 'paid')
        .reduce((s, b) => s + Math.abs(b.amount), 0)
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
        net: income - expense - refund,
      }
    }).sort((a, b) => b.net - a.net)
  }, [properties, rooms, tenants, bills, selectedYear])

  // 月度趋势数据
  const monthlyData = useMemo(() => {
    const months: { month: string; income: number; expense: number; refund: number }[] = []
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${selectedYear}-${String(m).padStart(2, '0')}`
      const income = bills
        .filter(b => b.direction === 'receivable' && b.status === 'paid' && b.paidDate?.startsWith(monthKey))
        .reduce((s, b) => s + b.amount, 0)
      const expense = bills
        .filter(b => b.direction === 'payable' && b.status === 'paid' && b.paidDate?.startsWith(monthKey))
        .reduce((s, b) => s + b.amount, 0)
      const refund = bills
        .filter(b => b.amount < 0 && b.status === 'paid' && b.paidDate?.startsWith(monthKey))
        .reduce((s, b) => s + Math.abs(b.amount), 0)
      months.push({ month: `${m}月`, income, expense, refund })
    }
    return months
  }, [bills, selectedYear])

  const maxMonthlyValue = Math.max(1, ...monthlyData.flatMap(m => [m.income, m.expense]))

  // 去年数据（用于对比）
  const prevYear = selectedYear - 1
  const prevYearIncome = useMemo(() =>
    bills.filter(b => b.direction === 'receivable' && b.status === 'paid' && b.paidDate?.startsWith(prevYear.toString()))
      .reduce((s, b) => s + b.amount, 0), [bills, prevYear])
  const prevYearExpense = useMemo(() =>
    bills.filter(b => b.direction === 'payable' && b.status === 'paid' && b.paidDate?.startsWith(prevYear.toString()))
      .reduce((s, b) => s + b.amount, 0), [bills, prevYear])
  const prevYearNet = prevYearIncome - prevYearExpense
  const incomeChange = prevYearIncome > 0 ? ((yearlyReceivablePaid - prevYearIncome) / prevYearIncome * 100) : 0
  const expenseChange = prevYearExpense > 0 ? ((yearlyPayablePaid - prevYearExpense) / prevYearExpense * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-6 pb-3">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-4">
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
        <div className="max-w-md mx-auto space-y-6">
          {/* 年度概览 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5" />
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
              <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
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

          {/* 月度趋势 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3">月度趋势</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-end gap-1 h-48">
                {monthlyData.map(m => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                    {m.income > 0 && (
                      <span className="text-[8px] text-green-600 font-medium">{m.income >= 1000 ? `${(m.income / 1000).toFixed(1)}k` : m.income.toFixed(0)}</span>
                    )}
                    <div className="w-full flex flex-col items-stretch justify-end h-32 gap-0.5">
                      <div
                        className="bg-green-400 rounded-t"
                        style={{ height: `${(m.income / maxMonthlyValue) * 100}%`, minHeight: m.income > 0 ? '2px' : '0' }}
                        title={`收入 ¥${m.income.toFixed(0)}`}
                      />
                      <div
                        className="bg-blue-400 rounded-t"
                        style={{ height: `${(m.expense / maxMonthlyValue) * 100}%`, minHeight: m.expense > 0 ? '2px' : '0' }}
                        title={`支出 ¥${m.expense.toFixed(0)}`}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400">{m.month}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-4 mt-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-400 rounded" />
                  <span>收入</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-400 rounded" />
                  <span>支出</span>
                </div>
              </div>
            </div>
          </div>

          {/* 入住率 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Home className="w-5 h-5" />
              入住率
            </h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">当前入住</span>
                <span className="text-2xl font-bold text-gray-900">{occupancyStats.occupancyRate}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                  style={{ width: `${occupancyStats.occupancyRate}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">{occupancyStats.occupiedRooms} / {occupancyStats.totalRooms} 间</p>
            </div>
          </div>

          {/* 各房源收益对比 */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
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

          {/* 利润提取汇总 */}
          {profitRecords.length > 0 && (
            <div>
              <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                利润提取记录
              </h2>
              <div className="space-y-2">
                {(() => {
                  const withdrawn = profitRecords.filter(r => r.status === 'withdrawn').reduce((s, r) => s + r.profitAmount, 0)
                  const available = profitRecords.filter(r => r.status === 'available').reduce((s, r) => s + r.profitAmount, 0)
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-blue-50 rounded-xl p-3">
                          <p className="text-xs text-blue-600">已提取利润</p>
                          <p className="text-lg font-bold text-blue-700">¥{withdrawn.toFixed(0)}</p>
                        </div>
                        <div className="bg-yellow-50 rounded-xl p-3">
                          <p className="text-xs text-yellow-600">可提取利润</p>
                          <p className="text-lg font-bold text-yellow-700">¥{available.toFixed(0)}</p>
                        </div>
                      </div>
                      {[...profitRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10).map(r => {
                        const prop = properties.find(p => p.id === r.propertyId)
                        return (
                          <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">
                                {r.profitAmount >= 0 ? '+' : ''}¥{r.profitAmount.toFixed(0)}
                              </p>
                              <p className="text-xs text-gray-400">
                                {prop?.address || '未知房源'}
                                {r.cycleStart && ` · ${r.cycleStart}~${r.cycleEnd}`}
                                {r.isManual && ' · 手动'}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'withdrawn' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {r.status === 'withdrawn' ? `已提取${r.withdrawnAt ? ` ${r.withdrawnAt}` : ''}` : '可提取'}
                            </span>
                          </div>
                        )
                      })}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

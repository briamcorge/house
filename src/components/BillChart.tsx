import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Bill } from '../types'

interface BillChartProps {
  bills: Bill[]
}

export default function BillChart({ bills }: BillChartProps) {
  const chartData = useMemo(() => {
    // 按月统计收入和支出
    const monthlyMap = new Map<string, { income: number; expense: number }>()

    bills.forEach(bill => {
      // 已收/已付账单按实收日(paidDate)归月；fallback dueDate 仅防御
      const key = (bill.paidDate || bill.dueDate).substring(0, 7) // "YYYY-MM"
      const entry = monthlyMap.get(key) || { income: 0, expense: 0 }
      if (bill.direction === 'receivable' && bill.status === 'paid') {
        // 押金不计入收入（与 More.tsx 押金余额口径一致：type=deposit 或 description 含「押金」）
        const isDeposit = bill.type === 'deposit' || bill.description?.includes('押金')
        if (!isDeposit) entry.income += bill.amount
      } else if (bill.direction === 'payable' && bill.status === 'paid') {
        entry.expense -= bill.amount
      }
      monthlyMap.set(key, entry)
    })

    // 排序并取最近12个月
    const sorted = Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    const last12 = sorted.slice(-12)

    if (last12.length === 0) return []

    return last12.map(([key, val]) => ({
      month: key.replace('-', '年') + '月',
      收入: Math.round(val.income),
      支出: Math.round(Math.abs(val.expense)),
    }))
  }, [bills])

  if (chartData.length === 0) return null

  return (
    <div className="mb-6 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">月度收支趋势</h3>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
            formatter={(value: number) => [`¥${value.toLocaleString()}`, undefined]}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Bar dataKey="收入" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="支出" fill="#f97316" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2 text-center">近12个月已收租金与已付支出</p>
    </div>
  )
}

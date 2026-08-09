import { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  color?: 'blue' | 'green' | 'orange' | 'red'
  onClick?: () => void
}

export default function StatCard({ title, value, icon: Icon, color = 'blue', onClick }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-600 to-blue-700',
    green: 'from-green-500 to-emerald-600',
    orange: 'from-orange-400 to-orange-600',
    red: 'from-red-500 to-rose-600'
  }

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={cn('p-3 rounded-xl bg-gradient-to-br', colorClasses[color])}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}
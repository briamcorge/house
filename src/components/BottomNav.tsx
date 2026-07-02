import { Link, useLocation } from 'react-router-dom'
import { Home, Building2, FileText, BarChart3, MoreHorizontal, Cloud, CloudOff, Cloudy } from 'lucide-react'
import { cn } from '../lib/utils'
import { useCloudSync } from '../lib/cloud-sync-context'

export default function BottomNav() {
  const location = useLocation()
  const { status } = useCloudSync()

  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/properties', label: '房屋', icon: Building2 },
    { path: '/bills', label: '账单', icon: FileText },
    { path: '/statistics', label: '统计', icon: BarChart3 },
    { path: '/more', label: '更多', icon: MoreHorizontal }
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 pb-8 z-50">
      <div className="flex justify-around items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path)
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center py-2 px-4 rounded-xl transition-all',
                isActive
                  ? 'text-blue-900'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon
                className={cn(
                  'w-6 h-6 mb-1',
                  isActive && 'fill-blue-900/10'
                )}
              />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
      {/* 同步状态指示器（小圆点，不碍眼） */}
      {status !== 'idle' && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2" title={
          status === 'syncing' ? '同步中...' :
          status === 'synced' ? '已同步' : '同步失败'
        }>
          {status === 'syncing' && <Cloudy className="w-3.5 h-3.5 text-blue-400 animate-pulse" />}
          {status === 'synced' && <Cloud className="w-3.5 h-3.5 text-green-400" />}
          {status === 'error' && <CloudOff className="w-3.5 h-3.5 text-red-400" />}
        </div>
      )}
    </nav>
  )
}

import { useStore } from '../store/useStore'
import { Settings, Database, Trash2, UserPlus, Calendar, FileSpreadsheet, Cloud, Users, DollarSign, X, LogOut, LogIn, Shield, Download, Smartphone } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { APP_VERSION } from '../version'
import { fetchLatestVersion } from '../utils/checkUpdate'
import type { UpdateInfo } from '../utils/checkUpdate'
import { useAuth } from '../lib/auth-context'
import { isSupabaseConfigured, signOut, checkIsAdmin, saveCloudData } from '../lib/supabase'

type MenuColor = 'blue' | 'green' | 'purple' | 'gray' | 'orange'

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  color: MenuColor
  path?: string
}

const colorClasses: Record<MenuColor, string> = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
  gray: 'bg-gray-100 text-gray-600',
  orange: 'bg-orange-100 text-orange-600',
}

const menuItems: MenuItem[] = [
  {
    icon: Calendar,
    label: '合同管理',
    description: '管理所有合同',
    color: 'green',
    path: '/contracts'
  },
  {
    icon: Users,
    label: '租客管理',
    description: '查看所有租客信息',
    color: 'orange',
    path: '/tenants'
  },
  {
    icon: DollarSign,
    label: '利润提取',
    description: '记录和查看利润提取',
    color: 'purple'
  },
  {
    icon: Trash2,
    label: '回收站',
    description: '恢复已删除的数据',
    color: 'gray',
    path: '/trash'
  },
  {
    icon: Database,
    label: '数据备份',
    description: '备份您的数据',
    color: 'purple'
  },
  {
    icon: Settings,
    label: '关于',
    description: '版本信息',
    color: 'gray'
  },
]

export default function More() {
  const { properties, rooms, tenants, bills, landlordContracts, clearAllData, addProfitRecord } = useStore()
  const navigate = useNavigate()
  const excelInputRef = useRef<HTMLInputElement>(null)
  const [showBackup, setShowBackup] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showDepositList, setShowDepositList] = useState(false)
  const [latestVersion, setLatestVersion] = useState<UpdateInfo | null>(null)
  const { user: currentUser, ready: supabaseReady } = useAuth()
  // 利润提取
  const [showProfitForm, setShowProfitForm] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profitPropertyId, setProfitPropertyId] = useState('')
  const [profitAmount, setProfitAmount] = useState('')
  const [profitBillId, setProfitBillId] = useState('')
  const [profitCycleStart, setProfitCycleStart] = useState('')
  const [profitCycleEnd, setProfitCycleEnd] = useState('')
  const landlordPayableBills = profitPropertyId
    ? bills.filter(b => b.propertyId === profitPropertyId && b.direction === 'payable' && b.description?.includes('期'))
    : []

  const activeTenants = tenants.filter(t => t.status === 'active')
  const pendingBills = bills.filter(b => b.status !== 'paid')
  const depositBalance = bills.filter(b => b.description?.includes('押金') && b.status === 'paid').reduce((s, b) => s + Number(b.amount), 0)
  const depositBills = bills.filter(b => b.description?.includes('押金') && b.status === 'paid')

  // 通过 Supabase RPC 判断管理员权限（服务端校验）
  useEffect(() => {
    if (currentUser?.id) {
      checkIsAdmin(currentUser.id).then(setIsAdmin)
    } else {
      setIsAdmin(false)
    }
  }, [currentUser])

  // 展开「关于」时检查最新版本
  useEffect(() => {
    if (showAbout) {
      fetchLatestVersion().then(setLatestVersion)
    }
  }, [showAbout])

  const handleSignOut = async () => {
    // 尝试服务端退出（不等待）
    signOut().catch(() => {})
    // 清除本地 Supabase session + 业务数据（避免跳转后残留）
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('sb-') || key === 'property-manager-data' || key === 'device_session_token')) keysToRemove.push(key)
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    // 清除云同步标记，确保下次登录重新拉取云端数据
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith('cloud_init_loaded_')) sessionStorage.removeItem(k)
    }
    // 跳转到 App 根路径（处理子路径部署，如 /house/）
    window.location.href = import.meta.env.BASE_URL
  }

  const handleExportExcel = async () => {
    const wb = XLSX.utils.book_new()

    const sheets: [string, Record<string, unknown>[], Record<string, string>][] = [
      ['房源', properties as unknown as Record<string, unknown>[], { id: 'ID', address: '地址', description: '备注', createdAt: '创建时间' }],
      ['房间', rooms as unknown as Record<string, unknown>[], { id: 'ID', propertyId: '房源ID', label: '编号', roomType: '类型', status: '状态', createdAt: '创建时间' }],
      ['代理合同', landlordContracts.map(c => ({ ...c, landlordPhone: c.landlordPhone ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', displayId: '合同编号', propertyId: '房源ID', landlordName: '业主姓名', landlordPhone: '业主电话', monthlyRent: '月租金', paymentMethod: '付款方式', contractStart: '合同开始', contractEnd: '合同结束', status: '状态', createdAt: '创建时间' }],
      ['租客', tenants.map(t => ({ ...t, deposit: t.deposit ?? '', otherFeeAmount: t.otherFeeAmount ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', displayId: '合同编号', name: '姓名', phone: '电话', roomId: '房间ID', contractStart: '合同开始', contractEnd: '合同结束', monthlyRent: '月租金', paymentMethod: '付款方式', advanceDays: '提前天数', deposit: '押金', otherFeeName: '其他费用', otherFeeAmount: '其他金额', status: '状态', createdAt: '创建时间' }],
      ['账单', bills.map(b => ({ ...b, paidAmount: b.paidAmount ?? '', propertyId: b.propertyId ?? '', roomId: b.roomId ?? '', tenantId: b.tenantId ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', propertyId: '房源ID', roomId: '房间ID', tenantId: '租客ID', amount: '金额', paidAmount: '已付金额', type: '类型', status: '状态', direction: '方向', dueDate: '到期日', paidDate: '实付日', description: '描述', createdAt: '创建时间' }],
    ]

    for (const [name, data, headers] of sheets) {
      const rows = data.map((item: Record<string, unknown>) => {
        const row: Record<string, unknown> = {}
        for (const [key, label] of Object.entries(headers)) {
          row[label] = item[key] ?? ''
        }
        return row
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.sheet_add_aoa(ws, [Object.values(headers)], { origin: 'A1' })
      const colWidths = Object.values(headers).map((h: string) => ({ wch: Math.max(h.length * 2, 12) }))
      ws['!cols'] = colWidths
      XLSX.utils.book_append_sheet(wb, ws, name)
    }

    // 生成文件 blob
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const fileName = `房屋管理数据_${new Date().toISOString().slice(0, 10)}.xlsx`

    // 检测是否在 Capacitor 环境
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform

    if (isCapacitor) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        const { Share } = await import('@capacitor/share')
        // 写入临时文件
        const base64 = btoa(String.fromCharCode(...new Uint8Array(wbout)))
        await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
        })
        // 分享文件（弹保存/分享菜单）
        await Share.share({
          title: fileName,
          text: '房屋管理数据导出',
          url: (await Filesystem.getUri({ path: fileName, directory: Directory.Cache })).uri,
        })
        // 清理临时文件
        await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {})
        return
      } catch (e) {
        console.warn('Capacitor 导出失败，降级到 Web API:', e)
      }
    }

    // 降级：Blob URL 下载（桌面浏览器 / 备用）
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    // 操作日志
    const s = useStore.getState()
    useStore.setState({ auditLogs: [...s.auditLogs, { id: Date.now().toString(), timestamp: new Date().toISOString(), action: 'export', entity: 'excel', details: `导出Excel (${sheets.length}个表)`, createdAt: new Date().toISOString() }] })
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // 检查是否已登录
    if (!currentUser) {
      alert('请先登录，再导入 Excel 数据，否则数据无法同步到云端。')
      window.dispatchEvent(new CustomEvent('open-auth'))
      e.target.value = ''
      return
    }
    
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        // 按 sheet 类型分别映射字段，避免同名字段冲突（如'类型'→roomType vs type）
        const sheetHeaders: Record<string, Record<string, string>> = {
          '房源': { 'ID': 'id', '地址': 'address', '备注': 'description', '创建时间': 'createdAt' },
          '房间': { 'ID': 'id', '房源ID': 'propertyId', '编号': 'label', '类型': 'roomType', '状态': 'status', '创建时间': 'createdAt' },
          '代理合同': { 'ID': 'id', '合同编号': 'displayId', '房源ID': 'propertyId', '业主姓名': 'landlordName', '业主电话': 'landlordPhone', '月租金': 'monthlyRent', '付款方式': 'paymentMethod', '合同开始': 'contractStart', '合同结束': 'contractEnd', '状态': 'status', '创建时间': 'createdAt' },
          '租客': { 'ID': 'id', '合同编号': 'displayId', '姓名': 'name', '电话': 'phone', '房间ID': 'roomId', '合同开始': 'contractStart', '合同结束': 'contractEnd', '月租金': 'monthlyRent', '付款方式': 'paymentMethod', '提前天数': 'advanceDays', '押金': 'deposit', '其他费用': 'otherFeeName', '其他金额': 'otherFeeAmount', '状态': 'status', '创建时间': 'createdAt' },
          '账单': { 'ID': 'id', '房源ID': 'propertyId', '房间ID': 'roomId', '租客ID': 'tenantId', '金额': 'amount', '已付金额': 'paidAmount', '类型': 'type', '状态': 'status', '方向': 'direction', '到期日': 'dueDate', '实付日': 'paidDate', '描述': 'description', '创建时间': 'createdAt' },
        }

        // 需要转换为数字的字段
        const numericFields = new Set(['amount', 'paidAmount', 'monthlyRent', 'deposit', 'otherFeeAmount', 'advanceDays'])

        const parseSheet = (sheetName: string): Record<string, unknown>[] => {
          const sheet = wb.Sheets[sheetName]
          if (!sheet) return []
          const headerMap = sheetHeaders[sheetName]
          if (!headerMap) return []
          const json = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]
          return json.map(row => {
            const obj: Record<string, unknown> = {}
            for (const [cn, en] of Object.entries(headerMap)) {
              if (row[cn] !== undefined) {
                // 数字字段：确保转换为 number 类型
                obj[en] = numericFields.has(en) ? Number(row[cn]) || 0 : row[cn]
              }
            }
            return obj
          })
        }

        const props = parseSheet('房源')
        const roomList = parseSheet('房间')
        const contractList = parseSheet('代理合同')
        const tenantList = parseSheet('租客')
        const billList = parseSheet('账单')

        const state = { properties: props, rooms: roomList, landlordContracts: contractList, tenants: tenantList, bills: billList }
        localStorage.setItem('property-manager-data', JSON.stringify({ state, version: 1 }))
        // 操作日志
        const s2 = useStore.getState()
        useStore.setState({ auditLogs: [...s2.auditLogs, { id: Date.now().toString(), timestamp: new Date().toISOString(), action: 'import', entity: 'excel', details: `导入Excel (${props.length}房源 ${roomList.length}房间 ${tenantList.length}租客 ${billList.length}账单)`, createdAt: new Date().toISOString() }] })

        // 同步保存到 Supabase（等完成再刷新）
        try {
            const saved = await saveCloudData({
              properties: props as any[],
              rooms: roomList as any[],
              tenants: tenantList as any[],
              bills: billList as any[],
              landlordContracts: contractList as any[],
              profitRecords: [],
            trash: [],
          })
          console.log('Excel 导入后云端保存结果:', saved ? '成功' : '失败')
          if (!saved) {
            // 打开控制台查看详细错误日志
            console.error('❌ 云端保存失败，请检查控制台 [saveCloudData] 日志')
            alert('Excel 数据已保存到本地，但云端同步失败。\n\n可能原因：\n1. 网络连接问题\n2. Supabase 数据库权限不足\n\n请打开浏览器控制台（F12）查看详细错误。')
          } else {
            console.log('✅ Excel 数据已成功保存到云端')
            // 关键修复：设置 sessionStorage 标记，防止刷新后 loadNow() 覆盖刚导入的数据
            if (currentUser?.id) {
              const flagKey = `cloud_init_loaded_${currentUser.id}`
              sessionStorage.setItem(flagKey, '1')
              console.log('✅ 已设置 sessionStorage 标记:', flagKey)
            }
          }
        } catch (e) {
          console.error('云端保存异常', e)
          alert('Excel 数据已保存到本地，但云端同步失败：' + (e as Error).message)
        }

        window.location.reload()
      } catch (err) {
        alert('Excel 格式错误，请检查文件')
        console.error(err)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-6 pb-3">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-3">更多</h1>

          <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-4">
            {/* 已登录用户信息（在蓝色卡片内） */}
            {isSupabaseConfigured() && currentUser && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/20">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-medium">
                    {(currentUser.user_metadata?.name || currentUser.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {currentUser.user_metadata?.name || currentUser.email}
                  </p>
                  <p className="text-xs text-blue-200 truncate">{currentUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4 text-blue-200" />
                </button>
              </div>
            )}

            {isSupabaseConfigured() && !currentUser && supabaseReady && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-auth'))}
                className="w-full flex items-center gap-2 mb-3 pb-3 border-b border-white/20 hover:bg-white/5 rounded-lg transition-colors"
              >
                <LogIn className="w-4 h-4 text-blue-200" />
                <span className="text-sm text-blue-200 font-medium">登录或注册以同步数据</span>
              </button>
            )}

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">您的管理概览</h2>
                <p className="text-blue-200 text-xs">轻松管理您的房产</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => navigate('/properties')} className="bg-white/10 rounded-xl p-2 text-center hover:bg-white/20 transition-colors">
                <p className="text-lg font-bold text-white">{properties.length}</p>
                <p className="text-blue-200 text-xs">房屋</p>
              </button>
              <button type="button" onClick={() => navigate('/tenants')} className="bg-white/10 rounded-xl p-2 text-center hover:bg-white/20 transition-colors">
                <p className="text-lg font-bold text-white">{activeTenants.length}</p>
                <p className="text-blue-200 text-xs">在租租客</p>
              </button>
              <button type="button" onClick={() => navigate('/bills')} className="bg-white/10 rounded-xl p-2 text-center hover:bg-white/20 transition-colors">
                <p className="text-lg font-bold text-white">{pendingBills.length}</p>
                <p className="text-blue-200 text-xs">待处理账单</p>
              </button>
            </div>
            <button type="button" onClick={() => setShowDepositList(true)} className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between w-full hover:bg-white/5 rounded-lg px-1 transition-colors">
              <span className="text-blue-200 text-sm">押金余额</span>
              <span className="text-lg font-bold text-white">¥{depositBalance.toFixed(0)}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto space-y-3">
          {menuItems.map((item, index) => {
            const Icon = item.icon
              const isBackup = item.label === '数据备份'
              const isAbout = item.label === '关于'
              const isProfit = item.label === '利润提取'
              
              return (
                <div key={index}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (item.path) navigate(item.path)
                    else if (isBackup) setShowBackup(!showBackup)
                    else if (isProfit) setShowProfitForm(!showProfitForm)
                    else if (isAbout) setShowAbout(!showAbout)
                    else alert(`${item.label}功能开发中...`)
                  }}
                  className={`w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer ${isBackup && showBackup || isProfit && showProfitForm || isAbout && showAbout ? 'rounded-b-none border-b-0' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[item.color]}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900">{item.label}</p>
                    <p className="text-sm text-gray-500">{item.description}</p>
                  </div>
                  <div className={`w-5 h-5 text-gray-300 transition-transform ${isBackup && showBackup || isProfit && showProfitForm || isAbout && showAbout ? 'rotate-90' : ''}`}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
                {isBackup && showBackup && (
                  <div className="bg-white border border-gray-100 rounded-b-2xl shadow-sm px-4 pb-4 pt-2 -mt-px">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <button type="button" onClick={handleExportExcel} className="py-3 px-4 bg-emerald-50 text-emerald-700 rounded-xl font-medium hover:bg-emerald-100 transition-colors flex flex-col items-center gap-1">
                        <FileSpreadsheet className="w-5 h-5" />
                        <span className="text-xs">导出Excel</span>
                      </button>
                      <button type="button" onClick={() => excelInputRef.current?.click()} className="py-3 px-4 bg-orange-50 text-orange-700 rounded-xl font-medium hover:bg-orange-100 transition-colors flex flex-col items-center gap-1">
                        <FileSpreadsheet className="w-5 h-5" />
                        <span className="text-xs">导入Excel</span>
                      </button>
                    </div>

                    {isSupabaseConfigured() && (
                      <div className="border-t border-gray-100 pt-3 mt-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Cloud className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-gray-900">云端同步</span>
                          {currentUser && (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-auto">已登录</span>
                          )}
                        </div>
                        {currentUser ? (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
                            <p className="text-xs text-gray-400">数据已自动同步到云端</p>
                            <button
                              type="button"
                              onClick={handleSignOut}
                              className="w-full py-2 px-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5 text-sm"
                            >
                              <LogOut className="w-4 h-4" />
                              <span>退出登录</span>
                            </button>
                          </div>
                        ) : (
                            <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('open-auth'))}
                            className="w-full py-2.5 px-3 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5 text-sm"
                          >
                            <LogIn className="w-4 h-4" />
                            <span>登录以同步数据</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {isAbout && showAbout && (
                  <div className="bg-white border border-gray-100 rounded-b-2xl shadow-sm px-4 pb-4 pt-2 -mt-px">
                    <div className="text-center">
                      <p className="text-sm text-gray-500">房屋管理系统 v{APP_VERSION}</p>
                      <p className="text-xs text-gray-400 mt-1">用于二房东房源/租客/账单管理</p>
                      
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => navigate('/admin')}
                          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>管理后台</span>
                        </button>
                      )}
                    </div>

                    {/* 下载 Android 版 */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      {latestVersion && latestVersion.version !== APP_VERSION && (
                        <div className="flex items-center justify-center gap-1.5 text-xs mb-2">
                          <span className="text-gray-400">最新版本 v{latestVersion.version}</span>
                          <span className="text-orange-500 font-medium">可更新</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const info = latestVersion || await fetchLatestVersion()
                          if (!info) { alert('获取下载信息失败'); return }
                          const isCapacitor = !!(window as any).Capacitor?.isNativePlatform
                          if (isCapacitor) {
                            try {
                              const { AppUpdate } = await import('../utils/update')
                              await AppUpdate.downloadAndInstall({ url: info.apkUrl })
                              return
                            } catch {
                              // 降级到浏览器下载
                            }
                          }
                          window.open(info.apkUrl, '_blank')
                        }}
                        className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Smartphone className="w-4 h-4" />
                        <span>下载 Android 安装包</span>
                      </button>
                    </div>
                  </div>
                )}
                {isProfit && showProfitForm && (
                  <div className="bg-white border border-gray-100 rounded-b-2xl shadow-sm px-4 pb-4 pt-2 -mt-px space-y-3">
                    <select
                      value={profitPropertyId}
                      onChange={(e) => {
                        setProfitPropertyId(e.target.value)
                        setProfitBillId('')
                        setProfitCycleStart('')
                        setProfitCycleEnd('')
                      }}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    >
                      <option value="">选择房源</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>{p.address}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={profitAmount}
                      onChange={(e) => setProfitAmount(e.target.value)}
                      placeholder="利润金额（元）"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    />
                    <select
                      value={profitBillId}
                      onChange={(e) => {
                        const billId = e.target.value
                        setProfitBillId(billId)
                        if (billId) {
                          const bill = bills.find(b => b.id === billId)
                          if (bill?.description) {
                            const m = bill.description.match(/第\d+期 .+? (\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})/)
                            if (m) {
                              setProfitCycleStart(m[1])
                              setProfitCycleEnd(m[2])
                            }
                          }
                        } else {
                          setProfitCycleStart('')
                          setProfitCycleEnd('')
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    >
                      <option value="">选择业主账单期数</option>
                      {landlordPayableBills.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.description} — ¥{b.amount}
                        </option>
                      ))}
                    </select>
                    {profitCycleStart && profitCycleEnd && (
                      <div className="text-xs text-gray-500 text-center bg-gray-50 py-1.5 rounded-lg">
                        周期：{profitCycleStart} ~ {profitCycleEnd}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfitForm(false)
                          setProfitPropertyId('')
                          setProfitAmount('')
                          setProfitBillId('')
                          setProfitCycleStart('')
                          setProfitCycleEnd('')
                        }}
                        className="py-2.5 px-3 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const amount = parseFloat(profitAmount)
                          if (!profitPropertyId || isNaN(amount) || amount <= 0) {
                            alert('请选择房源并输入有效金额')
                            return
                          }
                          addProfitRecord({
                            propertyId: profitPropertyId,
                            tenantIncome: amount,
                            landlordExpense: 0,
                            profitAmount: amount,
                            cycleStart: profitCycleStart || '',
                            cycleEnd: profitCycleEnd || '',
                            isManual: true,
                            status: 'available',
                          })
                          setShowProfitForm(false)
                          setProfitPropertyId('')
                          setProfitAmount('')
                          setProfitBillId('')
                          setProfitCycleStart('')
                          setProfitCycleEnd('')
                          alert('利润提取记录已添加')
                        }}
                        className="py-2.5 px-3 bg-purple-600 text-white rounded-xl font-medium text-sm hover:bg-purple-700 transition-colors"
                      >
                        提交
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <input ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />

        <div className="max-w-md mx-auto mt-8">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (confirm('确定要清除本机数据吗？此操作不可恢复！')) {
                clearAllData()
              }
            }}
            className="w-full bg-white rounded-2xl shadow-sm border border-red-100 p-4 flex items-center justify-center gap-3 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-5 h-5" />
            <span className="font-medium">清除本机数据</span>
          </button>
        </div>
      </div>

      {/* 押金明细弹窗 */}
      {showDepositList && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowDepositList(false) }}>
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold">押金明细</h3>
              <button type="button" onClick={() => setShowDepositList(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="flex items-center justify-between bg-blue-50 rounded-xl p-3 mb-3">
                <span className="text-sm font-medium text-blue-700">合计</span>
                <span className="text-lg font-bold text-blue-700">¥{depositBalance.toFixed(0)}</span>
              </div>
              {depositBills.map((b) => {
                const room = rooms.find(r => r.id === b.roomId)
                const prop = room ? properties.find(p => p.id === room.propertyId) : null
                const tenant = tenants.find(t => t.id === b.tenantId)
                return (
                  <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{prop?.address || ''} {room ? `- ${room.label}` : ''}</p>
                      <p className="text-xs text-gray-500">{tenant?.name || ''}{b.amount < 0 ? '（退押金）' : ''}</p>
                    </div>
                    <span className={`text-sm font-bold ml-2 ${b.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>{b.amount < 0 ? '-' : ''}¥{Math.abs(b.amount).toFixed(0)}</span>
                  </div>
                )
              })}
              {depositBills.length === 0 && (
                <p className="text-center text-gray-400 py-8">暂无押金记录</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

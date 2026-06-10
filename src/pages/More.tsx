import { useStore } from '../store/useStore'
import { Settings, Database, Trash2, UserPlus, Calendar, FileSpreadsheet, BarChart3, Cloud, Upload, Download } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { getToken, setToken, hasToken, getLastSyncTimestamp, uploadData, downloadData } from '../lib/cloud-sync'

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
    icon: BarChart3,
    label: '统计报表',
    description: '收支/入住率/房源收益',
    color: 'blue',
    path: '/statistics'
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
  const { properties, rooms, tenants, bills, landlordContracts, clearAllData } = useStore()
  const navigate = useNavigate()
  const excelInputRef = useRef<HTMLInputElement>(null)
  const [showBackup, setShowBackup] = useState(false)

  const activeTenants = tenants.filter(t => t.status === 'active')
  const pendingBills = bills.filter(b => b.status !== 'paid')

  // Cloud sync state
  const [showSync, setShowSync] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [syncMsg, setSyncMsg] = useState('')
  const [lastSync, setLastSync] = useState(getLastSyncTimestamp())

  const handleSaveToken = () => {
    if (!tokenInput.trim()) return
    setToken(tokenInput.trim())
    setTokenInput('')
    setSyncMsg('同步密钥已保存，开始自动同步')
    setSyncStatus('idle')
  }

  const handleClearToken = () => {
    if (confirm('清除同步密钥后，云同步将停止。确定吗？')) {
      setToken('')
      setSyncMsg('已清除同步密钥')
    }
  }

  const handleUpload = async () => {
    const token = getToken()
    if (!token) return
    setSyncStatus('syncing')
    setSyncMsg('正在上传...')
    try {
      const state = useStore.getState()
      await uploadData({
        properties: state.properties,
        rooms: state.rooms,
        tenants: state.tenants,
        bills: state.bills,
        landlordContracts: state.landlordContracts,
        profitRecords: state.profitRecords,
        trash: state.trash,
        syncTimestamp: new Date().toISOString(),
      }, token)
      setSyncStatus('idle')
      setSyncMsg('上传成功')
      setLastSync(getLastSyncTimestamp())
    } catch (err) {
      setSyncStatus('error')
      setSyncMsg('上传失败: ' + (err instanceof Error ? err.message : '网络错误'))
    }
  }

  const handleDownload = async () => {
    setSyncStatus('syncing')
    setSyncMsg('正在下载...')
    try {
      const data = await downloadData()
      if (!data) {
        setSyncStatus('idle')
        setSyncMsg('云端暂无数据')
        return
      }

      // Show preview and confirm
      const preview = [
        data.properties ? `${data.properties.length} 个房源` : '',
        data.rooms ? `${data.rooms.length} 个房间` : '',
        data.tenants ? `${data.tenants.length} 个租客` : '',
        data.bills ? `${data.bills.length} 个账单` : '',
      ].filter(Boolean).join('\n')

      if (!confirm(`从云端下载数据将替换本机所有数据。\n\n云端数据包含:\n${preview}\n\n本机当前有 ${properties.length} 个房源, ${tenants.length} 个租客\n\n确定要下载并覆盖吗？`)) {
        setSyncStatus('idle')
        setSyncMsg('已取消')
        return
      }

      // Save to localStorage and reload
      const state = {
        properties: data.properties || [],
        rooms: data.rooms || [],
        tenants: data.tenants || [],
        bills: data.bills || [],
        landlordContracts: data.landlordContracts || [],
        profitRecords: data.profitRecords || [],
        trash: data.trash || [],
      }
      localStorage.setItem('property-manager-data', JSON.stringify({ state, version: 0 }))
      setSyncStatus('idle')
      window.location.reload()
    } catch (err) {
      setSyncStatus('error')
      setSyncMsg('下载失败: ' + (err instanceof Error ? err.message : '网络错误'))
    }
  }

  const handleExportExcel = () => {
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

    XLSX.writeFile(wb, `房屋管理数据_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        const headerMap: Record<string, string> = {
          'ID': 'id', '地址': 'address', '备注': 'description', '创建时间': 'createdAt',
          '房源ID': 'propertyId', '编号': 'label', '类型': 'roomType', '状态': 'status',
          '合同编号': 'displayId', '业主姓名': 'landlordName', '业主电话': 'landlordPhone',
          '姓名': 'name', '电话': 'phone', '房间ID': 'roomId', '合同开始': 'contractStart',
          '合同结束': 'contractEnd', '月租金': 'monthlyRent', '付款方式': 'paymentMethod',
          '提前天数': 'advanceDays', '押金': 'deposit', '其他费用': 'otherFeeName', '其他金额': 'otherFeeAmount',
          '金额': 'amount', '已付金额': 'paidAmount', '方向': 'direction',
          '到期日': 'dueDate', '实付日': 'paidDate', '描述': 'description',
        }

        const parseSheet = (sheetName: string): Record<string, unknown>[] => {
          const sheet = wb.Sheets[sheetName]
          if (!sheet) return []
          const json = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]
          return json.map(row => {
            const obj: Record<string, unknown> = {}
            for (const [cn, en] of Object.entries(headerMap)) {
              if (row[cn] !== undefined) obj[en] = row[cn]
            }
            return obj
          })
        }

        const props = parseSheet('房源')
        const roomList = parseSheet('房间')
        const tenantList = parseSheet('租客')
        const billList = parseSheet('账单')

        const state = { properties: props, rooms: roomList, tenants: tenantList, bills: billList }
        localStorage.setItem('property-manager-data', JSON.stringify({ state, version: 0 }))
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
          <h1 className="text-xl font-bold text-gray-900 mb-6">更多</h1>
          
          <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                <UserPlus className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">您的管理概览</h2>
                <p className="text-blue-200 text-sm">轻松管理您的房产</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{properties.length}</p>
                <p className="text-blue-200 text-xs">房屋</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{activeTenants.length}</p>
                <p className="text-blue-200 text-xs">在租租客</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{pendingBills.length}</p>
                <p className="text-blue-200 text-xs">待处理账单</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto space-y-3">
          {menuItems.map((item, index) => {
            const Icon = item.icon
              const isBackup = item.label === '数据备份'
              const isAbout = item.label === '关于'
              
              return (
                <div key={index}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (item.path) navigate(item.path)
                    else if (isBackup) setShowBackup(!showBackup)
                    else if (isAbout) alert('房屋管理系统 v1.0.0\n用于二房东日常房源/租客/账单管理\n数据存储于当前浏览器中')
                    else alert(`${item.label}功能开发中...`)
                  }}
                  className={`w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer ${isBackup && showBackup ? 'rounded-b-none border-b-0' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[item.color]}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900">{item.label}</p>
                    <p className="text-sm text-gray-500">{item.description}</p>
                  </div>
                  <div className={`w-5 h-5 text-gray-300 transition-transform ${isBackup && showBackup ? 'rotate-90' : ''}`}>
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

                    <div className="border-t border-gray-100 pt-3 mt-1">
                      <button type="button" onClick={() => setShowSync(!showSync)} className="w-full flex items-center justify-between py-2">
                        <div className="flex items-center gap-2">
                          <Cloud className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-gray-900">云同步</span>
                        </div>
                        {hasToken() && (
                          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">已开启</span>
                        )}
                      </button>

                      {showSync && (
                        <div className="mt-2 space-y-2">
                          {!hasToken() ? (
                            <>
                              <p className="text-xs text-gray-500">输入你的 GitHub Personal Access Token（需 repo 权限）开启云同步</p>
                              <div className="flex gap-2">
                                <input
                                  type="password"
                                  value={tokenInput}
                                  onChange={(e) => setTokenInput(e.target.value)}
                                  placeholder="输入令牌"
                                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveToken}
                                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                                >保存</button>
                              </div>
                              <p className="text-xs text-gray-400">令牌只在本地保存，不会上传</p>
                            </>
                          ) : (
                            <>
                              {syncMsg && (
                                <p className={`text-xs ${syncStatus === 'error' ? 'text-red-500' : 'text-gray-600'}`}>{syncMsg}</p>
                              )}
                              {lastSync && (
                                <p className="text-xs text-gray-400">上次同步: {lastSync.slice(0, 16).replace('T', ' ')}</p>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={handleUpload}
                                  disabled={syncStatus === 'syncing'}
                                  className="py-2.5 px-3 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
                                >
                                  <Upload className="w-4 h-4" />
                                  <span>立即上传</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleDownload}
                                  disabled={syncStatus === 'syncing'}
                                  className="py-2.5 px-3 bg-purple-50 text-purple-700 rounded-xl font-medium hover:bg-purple-100 transition-colors flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
                                >
                                  <Download className="w-4 h-4" />
                                  <span>从云下载</span>
                                </button>
                              </div>
                              <button type="button" onClick={handleClearToken} className="text-xs text-gray-400 hover:text-red-500 transition-colors">清除密钥</button>
                            </>
                          )}
                        </div>
                      )}
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
              if (confirm('确定要清除所有数据吗？此操作不可恢复！')) {
                clearAllData()
              }
            }}
            className="w-full bg-white rounded-2xl shadow-sm border border-red-100 p-4 flex items-center justify-center gap-3 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-5 h-5" />
            <span className="font-medium">清除所有数据</span>
          </button>
        </div>

        <div className="max-w-md mx-auto mt-8 text-center">
          <p className="text-sm text-gray-400">房屋管理 v1.0.0</p>
        </div>
      </div>
    </div>
  )
}

import { useStore } from '../store/useStore'
import { Settings, Database, Trash2, UserPlus, Calendar, FileSpreadsheet, FileText } from 'lucide-react'
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'

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
    icon: Database,
    label: '数据备份',
    description: '备份您的数据',
    color: 'purple'
  },
  {
    icon: Settings,
    label: '设置',
    description: '应用设置',
    color: 'gray'
  },
]

export default function More() {
  const { properties, rooms, tenants, bills, clearAllData } = useStore()
  const navigate = useNavigate()
  const excelInputRef = useRef<HTMLInputElement>(null)

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()

    const sheets: [string, Record<string, unknown>[], Record<string, string>][] = [
      ['房源', properties as unknown as Record<string, unknown>[], { id: 'ID', address: '地址', description: '备注', createdAt: '创建时间' }],
      ['房间', rooms as unknown as Record<string, unknown>[], { id: 'ID', propertyId: '房源ID', label: '编号', roomType: '类型', status: '状态', createdAt: '创建时间' }],
      ['租客', tenants.map(t => ({ ...t, deposit: t.deposit ?? '', otherFeeAmount: t.otherFeeAmount ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', name: '姓名', phone: '电话', roomId: '房间ID', contractStart: '合同开始', contractEnd: '合同结束', monthlyRent: '月租金', paymentMethod: '付款方式', advanceDays: '提前天数', deposit: '押金', otherFeeName: '其他费用', otherFeeAmount: '其他金额', status: '状态', createdAt: '创建时间' }],
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
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-6">
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
                <p className="text-2xl font-bold text-white">{tenants.length}</p>
                <p className="text-blue-200 text-xs">租客</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{bills.length}</p>
                <p className="text-blue-200 text-xs">账单</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-6">
        <div className="max-w-md mx-auto space-y-3">
          {menuItems.map((item, index) => {
            const Icon = item.icon
            
            return (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (item.path) navigate(item.path)
                  else alert(`${item.label}功能开发中...`)
                }}
                className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[item.color]}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                <div className="w-5 h-5 text-gray-300">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            )
          })}
        </div>

        {/* 数据导入导出 */}
        <div className="max-w-md mx-auto mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={handleExportExcel} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md transition-colors cursor-pointer">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            <span className="text-sm font-medium text-gray-700">导出Excel</span>
          </button>
          <button type="button" onClick={() => excelInputRef.current?.click()} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md transition-colors cursor-pointer">
            <FileSpreadsheet className="w-6 h-6 text-orange-600" />
            <span className="text-sm font-medium text-gray-700">导入Excel</span>
          </button>
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

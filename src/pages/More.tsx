import { useStore } from '../store/useStore'
import { Settings, Database, Trash2, UserPlus, Calendar, FileSpreadsheet, Cloud, Users, DollarSign, X, LogOut, LogIn, Shield, TrendingUp, TrendingDown, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmModal from '../components/ConfirmModal'
import AlertModal from '../components/AlertModal'
import * as XLSX from 'xlsx'
import { APP_VERSION } from '../version'
import { useAuth } from '../lib/auth-context'
import { isSupabaseConfigured, signOut, checkIsAdmin, saveCloudData } from '../lib/supabase'
import { calculatePeriodProfit, PeriodProfitResult } from '../utils/profit'

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
  const { properties, rooms, tenants, bills, landlordContracts, profitRecords, clearAllData, addProfitRecord, deleteProfitRecord } = useStore()
;(window as any).__store = useStore
  const navigate = useNavigate()
  const excelInputRef = useRef<HTMLInputElement>(null)
  const [showBackup, setShowBackup] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showDepositList, setShowDepositList] = useState(false)
  const [showPaidDepositList, setShowPaidDepositList] = useState(false)
  const { user: currentUser, ready: supabaseReady } = useAuth()
  // 利润提取
  const [showProfitForm, setShowProfitForm] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profitPropertyId, setProfitPropertyId] = useState('')
  const [profitAmount, setProfitAmount] = useState('')
  const [profitBillId, setProfitBillId] = useState('')
  const [profitCycleStart, setProfitCycleStart] = useState('')
  const [profitCycleEnd, setProfitCycleEnd] = useState('')
  const [profitResult, setProfitResult] = useState<PeriodProfitResult | null>(null)
  const [profitExtracted, setProfitExtracted] = useState(false)
  const [profitExtractionDate, setProfitExtractionDate] = useState(new Date().toISOString().slice(0, 10))
  const landlordPayableBills = profitPropertyId
    ? bills.filter(b => b.propertyId === profitPropertyId && b.direction === 'payable' && b.description?.includes('期'))
    : []
  const propertyProfitRecords = profitPropertyId
    ? profitRecords.filter(r => r.propertyId === profitPropertyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []

  interface ConfirmAction {
    title: string
    message: string
    variant?: 'danger' | 'default'
    confirmText?: string
    cancelText?: string
    onAction: () => void
  }
  const [alertState, setAlertState] = useState<{ title: string; message: string; variant?: 'info' | 'success' | 'error' } | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const resetProfitForm = () => {
    setShowProfitForm(false)
    setProfitPropertyId('')
    setProfitAmount('')
    setProfitBillId('')
    setProfitCycleStart('')
    setProfitCycleEnd('')
    setProfitResult(null)
  }

  const activeTenants = tenants.filter(t => t.status === 'active')
  const pendingBills = bills.filter(b => b.status !== 'paid')
  const depositBalance = bills.filter(b => (b.type === 'deposit' || (b.description as string)?.includes('押金')) && b.direction === 'receivable').reduce((s, b) => s + Number(b.amount), 0)
  const paidDeposit = bills.filter(b => (b.type === 'deposit' || (b.description as string)?.includes('押金')) && b.direction === 'payable').reduce((s, b) => s + Number(b.amount), 0)
  const depositBills = bills.filter(b => (b.type === 'deposit' || (b.description as string)?.includes('押金')) && b.direction === 'receivable')
  const paidDepositBills = bills.filter(b => (b.type === 'deposit' || (b.description as string)?.includes('押金')) && b.direction === 'payable')

  // 通过 Supabase RPC 判断管理员权限（服务端校验）
  useEffect(() => {
    if (currentUser?.id) {
      checkIsAdmin(currentUser.id).then(setIsAdmin)
    } else {
      setIsAdmin(false)
    }
  }, [currentUser])

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
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k?.startsWith('cloud_init_loaded_')) sessionStorage.removeItem(k)
    }
    // 跳转到 App 根路径（处理子路径部署，如 /house/）
    window.location.href = import.meta.env.BASE_URL
  }

  // 从描述中提取账单起止日（格式：第N期 xxx YYYY-MM-DD ~ YYYY-MM-DD）
  const extractPeriod = (desc?: string): { startDate: string; endDate: string } => {
    if (!desc) return { startDate: '', endDate: '' }
    const match = desc.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
    if (match) return { startDate: match[1], endDate: match[2] }
    return { startDate: '', endDate: '' }
  }

  const handleExportExcel = async () => {
    const wb = XLSX.utils.book_new()

    const sheets: [string, Record<string, unknown>[], Record<string, string>][] = [
      ['房源', properties as unknown as Record<string, unknown>[], { id: 'ID', address: '地址', description: '备注', createdAt: '创建时间' }],
      ['房间', rooms as unknown as Record<string, unknown>[], { id: 'ID', propertyId: '房源ID', label: '编号', roomType: '类型', status: '状态', createdAt: '创建时间' }],
      ['代理合同', landlordContracts.map(c => ({ ...c, landlordPhone: c.landlordPhone ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', displayId: '合同编号', propertyId: '房源ID', landlordName: '业主姓名', landlordPhone: '业主电话', monthlyRent: '月租金', paymentMethod: '付款方式', contractStart: '合同开始', contractEnd: '合同结束', status: '状态', createdAt: '创建时间' }],
      ['租客', tenants.map(t => ({ ...t, deposit: t.deposit ?? '', otherFeeAmount: t.otherFeeAmount ?? '', effectiveEnd: t.effectiveEnd ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', displayId: '合同编号', name: '姓名', phone: '电话', roomId: '房间ID', contractStart: '合同开始', contractEnd: '合同结束', effectiveEnd: '退租日', monthlyRent: '月租金', paymentMethod: '付款方式', advanceDays: '提前天数', deposit: '押金', otherFeeName: '其他费用', otherFeeAmount: '其他金额', status: '状态', createdAt: '创建时间' }],
      ['账单', bills.map(b => {
        const { startDate, endDate } = extractPeriod(b.description)
        return {
          ...b,
          paidAmount: b.paidAmount ?? '',
          propertyId: b.propertyId ?? '',
          roomId: b.roomId ?? '',
          tenantId: b.tenantId ?? '',
          // 方向特定列
          收款日: b.direction === 'receivable' ? b.dueDate : '',
          付款日: b.direction === 'payable' ? b.dueDate : '',
          实收日: b.direction === 'receivable' && b.paidDate ? b.paidDate : '',
           实付日: b.direction === 'payable' && b.paidDate ? b.paidDate : '',
           startDate,
           endDate,
           periodStart: b.periodStart || (b.description?.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? ''),
           periodEnd: b.periodEnd || (b.description?.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)?.[2] ?? ''),
         }
       }) as unknown as Record<string, unknown>[], {
         id: 'ID', propertyId: '房源ID', roomId: '房间ID', tenantId: '租客ID',
         amount: '金额', paidAmount: '已付金额', type: '类型', status: '状态',
         direction: '方向',
         收款日: '收款日', 付款日: '付款日',
         startDate: '开始日', endDate: '结束日',
         periodStart: '覆盖开始', periodEnd: '覆盖结束',
         实收日: '实收日', 实付日: '实付日',
         description: '期间描述', createdAt: '创建时间',
        }],
       ['利润提取', profitRecords.map(r => ({ ...r, extractedAt: r.extractedAt ?? '', isManual: r.isManual ? '是' : '', remark: r.remark ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', propertyId: '房源ID', cycleStart: '周期开始', cycleEnd: '周期结束', tenantIncome: '租客收入', landlordExpense: '业主支出', profitAmount: '利润', status: '状态', extractedAt: '提取日期', isManual: '手动', remark: '备注', createdAt: '创建时间' }],
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

    // 检测是否在 Capacitor 原生环境
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.()

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
    try {
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      // 延迟释放 URL，确保浏览器有时间启动下载（尤其手机浏览器/PWA）
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 5000)
    } catch (e) {
      console.error('Excel 导出失败:', e)
      setAlertState({ title: '导出失败', message: '导出失败，请重试。如果问题持续，请查看控制台错误信息。', variant: 'error' })
      return
    }
    // 操作日志
    const s = useStore.getState()
    useStore.setState({ auditLogs: [...s.auditLogs, { id: Date.now().toString(), timestamp: new Date().toISOString(), action: 'export', entity: 'excel', details: `导出Excel (${sheets.length}个表)`, createdAt: new Date().toISOString() }] })
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // 检查是否已登录
    if (!currentUser) {
      setAlertState({ title: '提示', message: '请先登录，再导入 Excel 数据，否则数据无法同步到云端。', variant: 'info' })
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
          '租客': { 'ID': 'id', '合同编号': 'displayId', '姓名': 'name', '电话': 'phone', '房间ID': 'roomId', '合同开始': 'contractStart', '合同结束': 'contractEnd', '退租日': 'effectiveEnd', '月租金': 'monthlyRent', '付款方式': 'paymentMethod', '提前天数': 'advanceDays', '押金': 'deposit', '其他费用': 'otherFeeName', '其他金额': 'otherFeeAmount', '状态': 'status', '创建时间': 'createdAt' },
          '账单': { 'ID': 'id', '房源ID': 'propertyId', '房间ID': 'roomId', '租客ID': 'tenantId', '金额': 'amount', '已付金额': 'paidAmount', '类型': 'type', '状态': 'status', '方向': 'direction', '到期日': 'dueDate', '收款日': '_dueDateR', '付款日': '_dueDateP', '实收日': '_paidDateR', '实付日': 'paidDate', '描述': 'description', '期间描述': 'description', '开始日': '_startDate', '结束日': '_endDate', '覆盖开始': 'periodStart', '覆盖结束': 'periodEnd', '创建时间': 'createdAt' },
          '利润提取': { 'ID': 'id', '房源ID': 'propertyId', '周期开始': 'cycleStart', '周期结束': 'cycleEnd', '租客收入': 'tenantIncome', '业主支出': 'landlordExpense', '利润': 'profitAmount', '状态': 'status', '提取日期': 'extractedAt', '手动': 'isManual', '备注': 'remark', '创建时间': 'createdAt' },
        }

        // 需要转换为数字的字段
        const numericFields = new Set(['amount', 'paidAmount', 'monthlyRent', 'deposit', 'otherFeeAmount', 'advanceDays'])

        const validBillTypes = new Set(['rent', 'deposit', 'agency', 'sublease', 'hygiene', 'internet', 'utilities', 'other'])

        function validateImportRow(sheetName: string, row: Record<string, unknown>, index: number): string[] {
          const errors: string[] = []
          const prefix = `[${sheetName} 第${index + 1}行]`
          switch (sheetName) {
            case '房源':
              if (!row.address || String(row.address).trim() === '') errors.push(`${prefix} 地址不能为空`)
              break
            case '房间':
              if (!row.propertyId || String(row.propertyId).trim() === '') errors.push(`${prefix} 房源ID不能为空`)
              if (!row.label || String(row.label).trim() === '') errors.push(`${prefix} 编号不能为空`)
              if (!row.roomType || String(row.roomType).trim() === '') errors.push(`${prefix} 类型不能为空`)
              break
            case '代理合同':
              if (!row.propertyId || String(row.propertyId).trim() === '') errors.push(`${prefix} 房源ID不能为空`)
              if (row.monthlyRent === undefined || Number(row.monthlyRent) <= 0) errors.push(`${prefix} 月租金必须大于0`)
              if (!row.contractStart || String(row.contractStart).trim() === '') errors.push(`${prefix} 合同开始日期不能为空`)
              if (!row.contractEnd || String(row.contractEnd).trim() === '') errors.push(`${prefix} 合同结束日期不能为空`)
              break
            case '租客':
              if (!row.name || String(row.name).trim() === '') errors.push(`${prefix} 姓名不能为空`)
              if (!row.roomId || String(row.roomId).trim() === '') errors.push(`${prefix} 房间ID不能为空`)
              if (!row.contractStart || String(row.contractStart).trim() === '') errors.push(`${prefix} 合同开始日期不能为空`)
              if (!row.contractEnd || String(row.contractEnd).trim() === '') errors.push(`${prefix} 合同结束日期不能为空`)
              if (row.monthlyRent === undefined || Number(row.monthlyRent) <= 0) errors.push(`${prefix} 月租金必须大于0`)
              break
            case '账单':
              if (row.amount === undefined || isNaN(Number(row.amount))) errors.push(`${prefix} 金额必须为有效数字`)
              if (row.type && !validBillTypes.has(String(row.type))) errors.push(`${prefix} 类型必须为 rent/deposit/agency/sublease/hygiene/internet/utilities/other 之一`)
              if (!row.dueDate || String(row.dueDate).trim() === '') errors.push(`${prefix} 到期日不能为空`)
              break
          }
          return errors
        }

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

        const rawProps = parseSheet('房源')
        const rawRooms = parseSheet('房间')
        const rawContracts = parseSheet('代理合同')
        const rawTenants = parseSheet('租客')
        const rawBills = parseSheet('账单').map(b => {
          // 合并方向特定列：新格式的收款日/付款日 → dueDate，实收日 → paidDate
          if (!b.dueDate) {
            b.dueDate = String((b as any)._dueDateR || (b as any)._dueDateP || '')
          }
          if (!b.paidDate) {
            b.paidDate = String((b as any)._paidDateR || b.paidDate || '')
          }
          delete (b as any)._dueDateR; delete (b as any)._dueDateP
          delete (b as any)._paidDateR; delete (b as any)._startDate; delete (b as any)._endDate
          return b
        })
        const rawProfitRecords = parseSheet('利润提取').map(r => ({
          ...r,
          tenantIncome: Number(r.tenantIncome) || 0,
          landlordExpense: Number(r.landlordExpense) || 0,
          profitAmount: Number(r.profitAmount) || 0,
          extractedAt: String(r.extractedAt || ''),
          isManual: r.isManual === '是' ? true as any : undefined,
          remark: String(r.remark || ''),
        }))

        // ─── 行级校验 ───
        const allErrors: string[] = []
        const validProps = rawProps.filter((row, i) => { const e = validateImportRow('房源', row, i); allErrors.push(...e); return e.length === 0 })
        const validRooms = rawRooms.filter((row, i) => { const e = validateImportRow('房间', row, i); allErrors.push(...e); return e.length === 0 })
        const validContracts = rawContracts.filter((row, i) => { const e = validateImportRow('代理合同', row, i); allErrors.push(...e); return e.length === 0 })
        const validTenants = rawTenants.filter((row, i) => { const e = validateImportRow('租客', row, i); allErrors.push(...e); return e.length === 0 })
        const validBills = rawBills.filter((row, i) => { const e = validateImportRow('账单', row, i); allErrors.push(...e); return e.length === 0 })

        const totalInvalid = allErrors.length
        if (totalInvalid > 0) {
          const summary = [
            `📋 导入校验结果：`,
            `  房源: ${validProps.length}/${rawProps.length}`,
            `  房间: ${validRooms.length}/${rawRooms.length}`,
            `  代理合同: ${validContracts.length}/${rawContracts.length}`,
            `  租客: ${validTenants.length}/${rawTenants.length}`,
            `  账单: ${validBills.length}/${rawBills.length}`,
            `  共 ${totalInvalid} 条错误（仅显示前10条）：`,
            ...allErrors.slice(0, 10),
          ].join('\n')
          console.warn(summary)
          const doImportAll = async () => {
            const props = validProps
            const roomList = validRooms
            const contractList = validContracts
            const tenantList = validTenants
            const billList = validBills
            const profitList = rawProfitRecords

            const s2 = useStore.getState()
            useStore.setState({
              properties: props as any[],
              rooms: roomList as any[],
              landlordContracts: contractList as any[],
              tenants: tenantList as any[],
              bills: billList as any[],
              profitRecords: profitList as any[],
              trash: s2.trash,
              auditLogs: [...s2.auditLogs, { id: Date.now().toString(), timestamp: new Date().toISOString(), action: 'import', entity: 'excel', details: `导入Excel (${props.length}房源 ${roomList.length}房间 ${tenantList.length}租客 ${billList.length}账单)`, createdAt: new Date().toISOString() }],
            })

            try {
              const saved = await saveCloudData({
                properties: props as any[],
                rooms: roomList as any[],
                tenants: tenantList as any[],
                bills: billList as any[],
                landlordContracts: contractList as any[],
                profitRecords: profitList as any[],
                trash: [],
              })
              console.log('Excel 导入后云端保存结果:', saved ? '成功' : '失败')
              if (!saved) {
                console.error('❌ 云端保存失败，请检查控制台 [saveCloudData] 日志')
                setAlertState({ title: '云端同步失败', message: 'Excel 数据已保存到本地，但云端同步失败。\n\n可能原因：\n1. 网络连接问题\n2. Supabase 数据库权限不足\n\n请打开浏览器控制台（F12）查看详细错误。', variant: 'error' })
              } else {
                console.log('✅ Excel 数据已成功保存到云端')
                if (currentUser?.id) {
                  const flagKey = `cloud_init_loaded_${currentUser.id}`
                  sessionStorage.setItem(flagKey, '1')
                  console.log('✅ 已设置 sessionStorage 标记:', flagKey)
                }
              }
            } catch (err) {
              console.error('云端保存异常', err)
              setAlertState({ title: '云端同步失败', message: 'Excel 数据已保存到本地，但云端同步失败：' + (err as Error).message, variant: 'error' })
            }

            window.location.reload()
          }
          setConfirmAction({
            title: '导入数据',
            message: `共 ${allErrors.length} 行数据校验不通过（已跳过），确定导入 ${validProps.length + validRooms.length + validContracts.length + validTenants.length + validBills.length + rawProfitRecords.length} 条有效数据？\n\n详细错误请查看控制台 (F12)`,
            variant: 'default',
            confirmText: '导入',
            cancelText: '取消',
            onAction: doImportAll,
          })
          e.target.value = ''
          return
        }

        // 无校验错误，直接导入
        (async () => {
          const props = validProps
          const roomList = validRooms
          const contractList = validContracts
          const tenantList = validTenants
          const billList = validBills
          const profitList = rawProfitRecords

          const s2 = useStore.getState()
          useStore.setState({
            properties: props as any[],
            rooms: roomList as any[],
            landlordContracts: contractList as any[],
            tenants: tenantList as any[],
            bills: billList as any[],
            profitRecords: profitList as any[],
            trash: s2.trash,
            auditLogs: [...s2.auditLogs, { id: Date.now().toString(), timestamp: new Date().toISOString(), action: 'import', entity: 'excel', details: `导入Excel (${props.length}房源 ${roomList.length}房间 ${tenantList.length}租客 ${billList.length}账单)`, createdAt: new Date().toISOString() }],
          })

          try {
            const saved = await saveCloudData({
              properties: props as any[],
              rooms: roomList as any[],
              tenants: tenantList as any[],
              bills: billList as any[],
              landlordContracts: contractList as any[],
              profitRecords: profitList as any[],
              trash: [],
            })
            console.log('Excel 导入后云端保存结果:', saved ? '成功' : '失败')
            if (!saved) {
              console.error('❌ 云端保存失败，请检查控制台 [saveCloudData] 日志')
              setAlertState({ title: '云端同步失败', message: 'Excel 数据已保存到本地，但云端同步失败。\n\n可能原因：\n1. 网络连接问题\n2. Supabase 数据库权限不足\n\n请打开浏览器控制台（F12）查看详细错误。', variant: 'error' })
            } else {
              console.log('✅ Excel 数据已成功保存到云端')
              if (currentUser?.id) {
                const flagKey = `cloud_init_loaded_${currentUser.id}`
                sessionStorage.setItem(flagKey, '1')
                console.log('✅ 已设置 sessionStorage 标记:', flagKey)
              }
            }
          } catch (err) {
            console.error('云端保存异常', err)
            setAlertState({ title: '云端同步失败', message: 'Excel 数据已保存到本地，但云端同步失败：' + (err as Error).message, variant: 'error' })
          }

          window.location.reload()
        })()
      } catch (err) {
        setAlertState({ title: '格式错误', message: 'Excel 格式错误，请检查文件', variant: 'error' })
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
            <div className="mt-2 pt-2 border-t border-white/20 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowDepositList(true)} className="hover:bg-white/5 rounded-xl p-2 text-center transition-colors">
                <p className="text-lg font-bold text-white">¥{depositBalance.toFixed(0)}</p>
                <p className="text-blue-200 text-xs">已收租户押金</p>
              </button>
              <button type="button" onClick={() => setShowPaidDepositList(true)} className="hover:bg-white/5 rounded-xl p-2 text-center transition-colors">
                <p className="text-lg font-bold text-white">¥{paidDeposit.toFixed(0)}</p>
                <p className="text-blue-200 text-xs">已付业主押金</p>
              </button>
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
                    else setAlertState({ title: '提示', message: `${item.label}功能开发中...`, variant: 'info' })
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
                        setProfitResult(null)
                        setProfitAmount('')
                        setProfitExtracted(false)
                      }}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    >
                      <option value="">选择房源</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>{p.address}</option>
                      ))}
                    </select>

                    <select
                      value={profitBillId}
                      onChange={(e) => {
                        const billId = e.target.value
                        setProfitBillId(billId)
                        setProfitExtracted(false)
                        if (billId) {
                          const bill = bills.find(b => b.id === billId)
                          if (bill?.description) {
                            const m = bill.description.match(/第\d+期 .+? (\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})/)
                            if (m) {
                              const start = m[1], end = m[2]
                              setProfitCycleStart(start)
                              setProfitCycleEnd(end)
                              // 检查该周期是否已提取过利润
                              const alreadyExtracted = profitRecords.some(r =>
                                r.propertyId === profitPropertyId &&
                                r.cycleStart === start &&
                                r.cycleEnd === end
                              )
                              setProfitExtracted(alreadyExtracted)
                              // 自动计算该周期利润
                              const propRooms = rooms.filter(r => r.propertyId === profitPropertyId)
                              const propTenants = tenants.filter(t => propRooms.some(r => r.id === t.roomId))
                              const result = calculatePeriodProfit(start, end, bill.amount, propTenants, propRooms, bills)
                              setProfitResult(result)
                              if (!alreadyExtracted) {
                                setProfitAmount(String(Math.round(result.profitAmount)))
                              }
                            }
                          }
                        } else {
                          setProfitCycleStart('')
                          setProfitCycleEnd('')
                          setProfitResult(null)
                          setProfitAmount('')
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    >
                      <option value="">选择业主账单期数</option>
                      {landlordPayableBills.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.description} — ¥{b.amount.toFixed(0)}
                        </option>
                      ))}
                    </select>

                    {profitCycleStart && profitCycleEnd && (
                      <>
                        {/* 期间 */}
                        <div className="text-xs text-gray-500 text-center bg-gray-50 py-1.5 rounded-lg">
                          周期：{profitCycleStart} ~ {profitCycleEnd}
                        </div>

                        {/* 自动计算结果 */}
                        {profitResult && (
                          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500 flex items-center gap-1">
                                <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                                租客收入
                              </span>
                              <span className="font-medium text-green-600">¥{profitResult.tenantIncome.toFixed(0)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500 flex items-center gap-1">
                                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                                业主支出
                              </span>
                              <span className="font-medium text-red-600">-¥{profitResult.landlordExpense.toFixed(0)}</span>
                            </div>
                            <div className="border-t border-gray-200 pt-2 flex items-center justify-between text-sm font-bold">
                              <span className="text-gray-700">净收益</span>
                              <span className={profitResult.profitAmount >= 0 ? 'text-green-600' : 'text-red-600'}>
                                ¥{profitResult.profitAmount.toFixed(0)}
                              </span>
                            </div>

                            {/* 租客明细 */}
                            {profitResult.tenants.length > 0 && (
                              <div className="border-t border-gray-200 pt-2 mt-1 space-y-0.5">
                                <p className="text-[10px] text-gray-400 font-medium mb-0.5">租客分摊明细</p>
                                {profitResult.tenants.map(t => (
                                  <div key={t.tenantId} className="text-[11px] leading-5 text-gray-600">
                                    <span className="text-gray-700 font-medium">{t.roomLabel} {t.tenantName}</span>
                                    <span>：</span>
                                    {t.overlapDays > 0 && (
                                      <span><b>{t.overlapDays}天</b>¥{t.proratedRent.toFixed(0)}</span>
                                    )}
                                    {t.adjustment !== 0 && (
                                      <span><span className="text-gray-400">+</span>退租金¥{t.adjustment.toFixed(0)}</span>
                                    )}
                                    {t.feeBreakdown.filter(f => f.type !== 'rent').map((f, fi) => (
                                      <span key={fi}>
                                        <span className="text-gray-400">+</span>{f.label}¥{f.amount.toFixed(0)}
                                      </span>
                                    ))}
                                    <span className="text-gray-400">=</span>
                                    <span className="text-gray-700 font-medium">
                                      ¥{(t.proratedRent + t.adjustment + t.otherFeeIncome).toFixed(0)}
                                    </span>
                                    {!t.rentPaid && t.expectedRent > 0 && (
                                      <span className="text-orange-500 font-medium ml-0.5">未齐</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {!profitResult.allPaid && (
                              <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 rounded-lg px-2 py-1.5 mt-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>该周期部分租客房租未交齐，利润可能不准确</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 手动输入/确认金额 */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">提取金额（元）</label>
                            <input
                              type="number"
                              value={profitAmount}
                              onChange={(e) => setProfitAmount(e.target.value)}
                              placeholder="利润金额"
                              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">提取日期</label>
                            <input
                              type="date"
                              value={profitExtractionDate}
                              onChange={(e) => setProfitExtractionDate(e.target.value)}
                              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* 已有提取记录 */}
                    {profitPropertyId && propertyProfitRecords.length > 0 && (
                      <div className="border-t border-gray-100 pt-3">
                        <p className="text-xs text-gray-400 font-medium mb-2">已有提取记录</p>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {propertyProfitRecords.map(r => (
                            <div key={r.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                              <div className="flex items-center gap-1.5 text-gray-500 min-w-0">
                                {r.status === 'withdrawn' ? (
                                  <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                                ) : (
                                  <Clock className="w-3 h-3 text-blue-500 shrink-0" />
                                )}
                                <span className="truncate">{r.cycleStart}~{r.cycleEnd}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {r.extractedAt && <span className="text-gray-400">{r.extractedAt}</span>}
                                <span className="font-medium text-gray-700">¥{r.profitAmount.toFixed(0)}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmAction({
                                      title: '删除确认',
                                      message: '确定删除这笔提取记录？',
                                      variant: 'danger',
                                      onAction: () => deleteProfitRecord(r.id),
                                    })
                                  }}
                                  className="text-gray-300 hover:text-red-500 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={resetProfitForm}
                        className="py-2.5 px-3 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={profitExtracted}
                        onClick={() => {
                          const amount = parseFloat(profitAmount)
                          if (!profitPropertyId || isNaN(amount) || amount <= 0) {
                            setAlertState({ title: '提示', message: '请选择房源并输入有效金额', variant: 'error' })
                            return
                          }
                          if (!profitCycleStart || !profitCycleEnd) {
                            setAlertState({ title: '提示', message: '请选择利润提取的账单周期', variant: 'error' })
                            return
                          }
                           addProfitRecord({
                             propertyId: profitPropertyId,
                             tenantIncome: profitResult?.tenantIncome || amount,
                             landlordExpense: profitResult?.landlordExpense || 0,
                             profitAmount: amount,
                             cycleStart: profitCycleStart,
                             cycleEnd: profitCycleEnd,
                             isManual: true,
                             status: 'available',
                             extractedAt: profitExtractionDate,
                           })
                          setProfitExtracted(true)
                          setAlertState({ title: '成功', message: '利润提取记录已添加', variant: 'success' })
                        }}
                        className={`py-2.5 px-3 rounded-xl font-medium text-sm transition-colors ${
                          profitExtracted
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                        }`}
                      >
                        {profitExtracted ? '已提取' : '提交'}
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
              setConfirmAction({
                title: '清除数据',
                message: '确定要清除本机数据吗？此操作不可恢复！',
                variant: 'danger',
                onAction: () => clearAllData(),
              })
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

      {/* 已付押金明细弹窗 */}
      {showPaidDepositList && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowPaidDepositList(false) }}>
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold">已付押金明细</h3>
              <button type="button" onClick={() => setShowPaidDepositList(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="flex items-center justify-between bg-blue-50 rounded-xl p-3 mb-3">
                <span className="text-sm font-medium text-blue-700">合计</span>
                <span className="text-lg font-bold text-blue-700">¥{paidDeposit.toFixed(0)}</span>
              </div>
              {paidDepositBills.map((b) => {
                const room = rooms.find(r => r.id === b.roomId)
                const prop = room ? properties.find(p => p.id === room.propertyId) : (b.propertyId ? properties.find(p => p.id === b.propertyId) : null)
                return (
                  <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{prop?.address || ''} {room ? `- ${room.label}` : ''}</p>
                      <p className="text-xs text-gray-500">业主押金</p>
                    </div>
                    <span className="text-sm font-bold ml-2 text-gray-900">¥{Math.abs(b.amount).toFixed(0)}</span>
                  </div>
                )
              })}
              {depositBills.filter(b => b.direction === 'payable').length === 0 && (
                <p className="text-center text-gray-400 py-8">暂无已付押金记录</p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction) confirmAction.onAction()
        }}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        variant={confirmAction?.variant || 'danger'}
        confirmText={confirmAction?.confirmText}
        cancelText={confirmAction?.cancelText}
      />

      <AlertModal
        isOpen={alertState !== null}
        onClose={() => setAlertState(null)}
        title={alertState?.title || ''}
        message={alertState?.message || ''}
        variant={alertState?.variant || 'info'}
      />
    </div>
  )
}

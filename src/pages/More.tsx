import { useStore } from '../store/useStore'
import { Settings, Database, Trash2, UserPlus, Calendar, FileSpreadsheet, Cloud, Users, DollarSign, X, LogOut, LogIn, Shield, TrendingUp, TrendingDown, CheckCircle, Clock, AlertTriangle, History, ChevronDown, Info, Copy } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmModal from '../components/ConfirmModal'
import AlertModal from '../components/AlertModal'
import * as XLSX from 'xlsx'
import { APP_VERSION } from '../version'
import { useAuth } from '../lib/auth-context'
import { isSupabaseConfigured, signOut, checkIsAdmin, saveCloudData } from '../lib/supabase'
import { useCloudSync } from '../lib/cloud-sync-context'
import { pushAuthDiag, getAuthDiag, clearAuthDiag, AuthDiagEntry } from '../lib/auth-diag'
import { calculatePeriodProfit, PeriodProfitResult } from '../utils/profit'
import { calculateBalance } from '../utils/balance'
import { todayLocal } from '../lib/utils'

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
    icon: History,
    label: '诊断日志',
    description: '查看登出/登录记录',
    color: 'gray'
  },
  {
    icon: Settings,
    label: '设置',
    description: '应用设置',
    color: 'gray'
  },
  {
    icon: Info,
    label: '关于',
    description: '版本信息',
    color: 'gray'
  },
]

export default function More() {
  const { properties, rooms, tenants, bills, landlordContracts, profitRecords, clearAllData, addProfitRecord, deleteProfitRecord, settings, setSettings } = useStore()
;(window as any).__store = useStore
  const navigate = useNavigate()
  const excelInputRef = useRef<HTMLInputElement>(null)
  const [showBackup, setShowBackup] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDiag, setShowDiag] = useState(false)
  const [diagList, setDiagList] = useState<AuthDiagEntry[]>(() => getAuthDiag())
  const [diagCopied, setDiagCopied] = useState(false)
  const [showDepositList, setShowDepositList] = useState(false)
  const [showPaidDepositList, setShowPaidDepositList] = useState(false)
  const { user: currentUser, ready: supabaseReady } = useAuth()
  // 利润提取
  const [showProfitForm, setShowProfitForm] = useState(false)
  const [showProfitRecords, setShowProfitRecords] = useState(false)
  const [showBillPicker, setShowBillPicker] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profitPropertyId, setProfitPropertyId] = useState('')
  const [profitAmount, setProfitAmount] = useState('')
  const [profitBillId, setProfitBillId] = useState('')
  const [profitCycleStart, setProfitCycleStart] = useState('')
  const [profitCycleEnd, setProfitCycleEnd] = useState('')
  const [profitResult, setProfitResult] = useState<PeriodProfitResult | null>(null)
  const [profitExtracted, setProfitExtracted] = useState(false)
  const [profitCopied, setProfitCopied] = useState(false)
  const [profitExtractionDate, setProfitExtractionDate] = useState(todayLocal())
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

  // 已收租户押金：仅统计已收(paid)与已退(refunded 负数抵减)的押金账单；pending/overdue 未收的不计入
  const depositPaidStatuses = new Set(['paid', 'refunded'])
  const depositBalance = bills.filter(b => (b.type === 'deposit' || (b.description as string)?.includes('押金')) && b.direction === 'receivable' && depositPaidStatuses.has(b.status)).reduce((s, b) => s + Number(b.amount), 0)
  const paidDeposit = bills.filter(b => (b.type === 'deposit' || (b.description as string)?.includes('押金')) && b.direction === 'payable' && depositPaidStatuses.has(b.status)).reduce((s, b) => s + Number(b.amount), 0)
  const depositBills = bills.filter(b => (b.type === 'deposit' || (b.description as string)?.includes('押金')) && b.direction === 'receivable' && depositPaidStatuses.has(b.status))
  const paidDepositBills = bills.filter(b => (b.type === 'deposit' || (b.description as string)?.includes('押金')) && b.direction === 'payable' && depositPaidStatuses.has(b.status))
  // 实时可支配余额：已收剩余（不含押金）− 已付剩余（不含押金），负数 = 垫钱
  const { tenantRemain, landlordRemain, balance } = calculateBalance(bills, todayLocal())

  // 通过 Supabase RPC 判断管理员权限（服务端校验）
  const { saveNow } = useCloudSync()
  useEffect(() => {
    if (currentUser?.id) {
      checkIsAdmin(currentUser.id).then(setIsAdmin).catch(err => {
        console.error('检查管理员权限失败:', err)
        setIsAdmin(false)
      })
    } else {
      setIsAdmin(false)
    }
  }, [currentUser])

  const handleSignOut = async () => {
    // 诊断日志：记录手动退出
    pushAuthDiag({ reason: '用户手动退出', detail: currentUser?.email })
    // 在线强制：先把未同步的改动推上云端再登出（本地不留未同步数据）
    try { await saveNow() } catch { /* 失败不阻断登出 */ }
    // 服务端退出（supabase.ts 内已改为 local scope：只登出本设备，不影响其他设备）
    signOut().catch(() => {})
    // 清除本地 Supabase session 与设备标识。
    // 业务数据（property-manager-data）与 tab_active 保留：
    // 云端为准（重登后云端覆盖），且避免下次冷启动被误判为"新浏览器会话"再次被踢
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('sb-') || key === 'device_session_token')) keysToRemove.push(key)
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
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

  // 业主账单描述简化显示：只保留期数和日期，去掉付款方式（月租/季租/半年付/年付等）
  const formatBillDesc = (desc?: string): string => {
    if (!desc) return ''
    const periodMatch = desc.match(/(第\d+期)/)
    const { startDate, endDate } = extractPeriod(desc)
    // 先剥离日期范围，避免 base 残留日期导致重复显示
    const noDates = desc.replace(/\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}/, '').trim()
    const base = periodMatch?.[1] || noDates.slice(0, 30)
    return startDate ? `${base} ${startDate} ~ ${endDate}` : base
  }

  const handleExportExcel = async () => {
    const wb = XLSX.utils.book_new()

    // 账单排序：应收在前、应付在后；同方向按房源聚合；再按应收日升序（便于人工查阅）
    const sortedBills = [...bills].sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === 'receivable' ? -1 : 1
      if ((a.propertyId || '') !== (b.propertyId || '')) return (a.propertyId || '') < (b.propertyId || '') ? -1 : 1
      return (a.dueDate || '').localeCompare(b.dueDate || '')
    })

    const sheets: [string, Record<string, unknown>[], Record<string, string>][] = [
      ['房源', properties.map(p => ({ ...p, houseType: p.houseType ?? '', area: p.area ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', address: '地址', houseType: '户型', area: '面积', description: '备注', createdAt: '创建时间' }],
      ['房间', rooms as unknown as Record<string, unknown>[], { id: 'ID', propertyId: '房源ID', label: '编号', roomType: '类型', status: '状态', createdAt: '创建时间' }],
      ['代理合同', landlordContracts.map(c => ({ ...c, landlordPhone: c.landlordPhone ?? '', endReason: c.endReason ?? '', previousContractId: c.previousContractId ?? '', deposit: c.deposit ?? '', vacancyAllowance: Array.isArray(c.vacancyAllowance) ? c.vacancyAllowance.join(',') : (c.vacancyAllowance ?? ''), pendingBills: c.pendingBills?.length ? JSON.stringify(c.pendingBills) : '' })) as unknown as Record<string, unknown>[], { id: 'ID', displayId: '合同编号', propertyId: '房源ID', landlordName: '业主姓名', landlordPhone: '业主电话', monthlyRent: '月租金', paymentMethod: '付款方式', deposit: '押金', vacancyAllowance: '免租期', contractStart: '合同开始', contractEnd: '合同结束', status: '状态', endReason: '结束原因', previousContractId: '上一合同ID', pendingBills: '暂存账单', createdAt: '创建时间' }],
      ['租客', tenants.map(t => ({ ...t, billSplit: t.billSplit ?? '', deposit: t.deposit ?? '', otherFeeAmount: t.otherFeeAmount ?? '', effectiveEnd: t.effectiveEnd ?? '', endReason: t.endReason ?? '', previousTenantId: t.previousTenantId ?? '', pendingBills: t.pendingBills?.length ? JSON.stringify(t.pendingBills) : '' })) as unknown as Record<string, unknown>[], { id: 'ID', displayId: '合同编号', name: '姓名', phone: '电话', roomId: '房间ID', contractStart: '合同开始', contractEnd: '合同结束', effectiveEnd: '退租日', monthlyRent: '月租金', paymentMethod: '付款方式', advanceDays: '提前天数', billSplit: '切分方式', deposit: '押金', otherFeeName: '其他费用', otherFeeAmount: '其他金额', status: '状态', endReason: '结束原因', previousTenantId: '上一合同ID', pendingBills: '暂存账单', createdAt: '创建时间' }],
      ['账单', sortedBills.map(b => {
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
          landlordContractId: '业主合同ID',
          description: '期间描述', createdAt: '创建时间',
        }],
       // 注意：settings / trash / auditLogs 有意不导出（非业务核心数据，导入还原仅覆盖业务表）
       ['利润提取', profitRecords.map(r => ({ ...r, extractedAt: r.extractedAt ?? '', withdrawnAt: r.withdrawnAt ?? '', isManual: r.isManual ? '是' : '', remark: r.remark ?? '' })) as unknown as Record<string, unknown>[], { id: 'ID', propertyId: '房源ID', cycleStart: '周期开始', cycleEnd: '周期结束', tenantIncome: '租客收入', landlordExpense: '业主支出', profitAmount: '利润', status: '状态', extractedAt: '提取日期', withdrawnAt: '提现时间', isManual: '手动', remark: '备注', createdAt: '创建时间' }],
    ]

    for (const [name, data, headers] of sheets) {
      const headerLabels = Object.values(headers)
      // 全量写入：第一行表头 + 数据行（保证表头单元格可控，可加样式）
      const rows = data.map((item: Record<string, unknown>) =>
        headerLabels.map(label => item[Object.keys(headers).find(k => headers[k] === label)!] ?? '')
      )
      const ws = XLSX.utils.aoa_to_sheet([headerLabels, ...rows])
      // 表头样式：加粗 + 浅蓝底色
      headerLabels.forEach((_, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })]
        if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'EEF2FF' } } }
      })
      // 冻结首行，滚动时表头可见
      ws['!freeze'] = { xSplit: 0, ySplit: 1 }
      const colWidths = headerLabels.map((h: string) => ({ wch: Math.max(h.length * 2, 12) }))
      ws['!cols'] = colWidths
      XLSX.utils.book_append_sheet(wb, ws, name)
    }

    // 生成文件 blob
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
    const fileName = `房屋管理数据_${todayLocal()}.xlsx`

    // 检测是否在 Capacitor 原生环境
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.()

    if (isCapacitor) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        const { Share } = await import('@capacitor/share')
        // 写入临时文件
        // 分块转 base64，避免大文件展开参数导致栈溢出 (RangeError)
        const bytes = new Uint8Array(wbout)
        let binary = ''
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
        }
        const base64 = btoa(binary)
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
        // 防止重复移除报错：链接可能已被用户/浏览器移除
        if (link.parentNode) document.body.removeChild(link)
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

    // 在线强制（产品铁律）：断网时阻止导入（导入会直接 setState 替换全部数据，绕过 store 的离线守卫）
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setAlertState({ title: '提示', message: '当前离线，无法导入数据，请恢复网络后重试', variant: 'info' })
      e.target.value = ''
      return
    }

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
          '房源': { 'ID': 'id', '地址': 'address', '户型': 'houseType', '面积': 'area', '备注': 'description', '创建时间': 'createdAt' },
          '房间': { 'ID': 'id', '房源ID': 'propertyId', '编号': 'label', '类型': 'roomType', '状态': 'status', '创建时间': 'createdAt' },
          '代理合同': { 'ID': 'id', '合同编号': 'displayId', '房源ID': 'propertyId', '业主姓名': 'landlordName', '业主电话': 'landlordPhone', '月租金': 'monthlyRent', '付款方式': 'paymentMethod', '押金': 'deposit', '免租期': 'vacancyAllowance', '合同开始': 'contractStart', '合同结束': 'contractEnd', '状态': 'status', '结束原因': 'endReason', '上一合同ID': 'previousContractId', '暂存账单': 'pendingBills', '创建时间': 'createdAt' },
          '租客': { 'ID': 'id', '合同编号': 'displayId', '姓名': 'name', '电话': 'phone', '房间ID': 'roomId', '合同开始': 'contractStart', '合同结束': 'contractEnd', '退租日': 'effectiveEnd', '月租金': 'monthlyRent', '付款方式': 'paymentMethod', '提前天数': 'advanceDays', '切分方式': 'billSplit', '押金': 'deposit', '其他费用': 'otherFeeName', '其他金额': 'otherFeeAmount', '状态': 'status', '结束原因': 'endReason', '上一合同ID': 'previousTenantId', '暂存账单': 'pendingBills', '创建时间': 'createdAt' },
          '账单': { 'ID': 'id', '房源ID': 'propertyId', '房间ID': 'roomId', '租客ID': 'tenantId', '金额': 'amount', '已付金额': 'paidAmount', '类型': 'type', '状态': 'status', '方向': 'direction', '到期日': 'dueDate', '收款日': '_dueDateR', '付款日': '_dueDateP', '实收日': '_paidDateR', '实付日': 'paidDate', '描述': 'description', '期间描述': 'description', '开始日': '_startDate', '结束日': '_endDate', '覆盖开始': 'periodStart', '覆盖结束': 'periodEnd', '业主合同ID': 'landlordContractId', '创建时间': 'createdAt' },
          '利润提取': { 'ID': 'id', '房源ID': 'propertyId', '周期开始': 'cycleStart', '周期结束': 'cycleEnd', '租客收入': 'tenantIncome', '业主支出': 'landlordExpense', '利润': 'profitAmount', '状态': 'status', '提取日期': 'extractedAt', '提现时间': 'withdrawnAt', '手动': 'isManual', '备注': 'remark', '创建时间': 'createdAt' },
        }

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
                // 数字字段：空值保持 undefined（不做 0 填充，避免押金 0 被误判），非数字则保留原值
                const n = Number(row[cn])
                obj[en] = row[cn] === '' || row[cn] === undefined ? undefined : (isNaN(n) ? row[cn] : n)
              }
            }
            return obj
          })
        }

        const rawProps = parseSheet('房源')
        const rawRooms = parseSheet('房间')
        const rawContracts = parseSheet('代理合同').map(c => ({
          ...c,
          // 空押金规范化为 undefined（与数据模型一致）
          deposit: Number(c.deposit) > 0 ? Number(c.deposit) : undefined,
          // 免租期：逗号分隔字符串 → 单值为 number，多值为 number[]
          // 注意：0 值必须保留（某年无免租），不能用 n>0 过滤，否则数组错位
          vacancyAllowance: (() => {
            const v = c.vacancyAllowance
            if (v === undefined || v === null || v === '') return undefined
            const parts = String(v).split(',').map(s => parseFloat(s)).filter(n => !isNaN(n))
            if (parts.length === 0) return undefined
            return parts.length === 1 ? parts[0] : parts
          })(),
          // pendingBills 是 JSON 字符串，解析回数组；解析失败则为 undefined
          pendingBills: (() => {
            const v = c.pendingBills
            if (!v) return undefined
            try {
              const arr = JSON.parse(String(v))
              return Array.isArray(arr) ? arr : undefined
            } catch { return undefined }
          })(),
        }))
        const rawTenants = parseSheet('租客').map(t => ({
          ...t,
          // 空押金规范化为 undefined（与数据模型一致）
          deposit: Number(t.deposit) > 0 ? Number(t.deposit) : undefined,
          pendingBills: (() => {
            const v = t.pendingBills
            if (!v) return undefined
            try {
              const arr = JSON.parse(String(v))
              return Array.isArray(arr) ? arr : undefined
            } catch { return undefined }
          })(),
        }))
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

        // 引用完整性：以各实体的有效 ID 集合为准，剔除引用不存在的租客/房间/业主合同的孤儿账单
        // 注：validTenants/validContracts 经过 .map() 后 TS 推断丢失了展开的 id 字段，此处经 unknown 断言访问（运行时必存在）
        const tenantIds = new Set(validTenants.map(t => String((t as unknown as { id: string }).id)))
        const roomIds = new Set(validRooms.map(r => String((r as { id: string }).id)))
        const contractIds = new Set(validContracts.map(c => String((c as unknown as { id: string }).id)))
        const billWarnings: string[] = []
        const validBills = rawBills.filter((row, i) => {
          const e = validateImportRow('账单', row, i)
          allErrors.push(...e)
          if (e.length > 0) return false
          const refProblems: string[] = []
          if (row.tenantId && !tenantIds.has(String(row.tenantId))) refProblems.push(`租客ID ${String(row.tenantId)} 不存在`)
          if (row.roomId && !roomIds.has(String(row.roomId))) refProblems.push(`房间ID ${String(row.roomId)} 不存在`)
          if (row.landlordContractId && !contractIds.has(String(row.landlordContractId))) refProblems.push(`业主合同ID ${String(row.landlordContractId)} 不存在`)
          if (refProblems.length > 0) {
            billWarnings.push(`[账单 第${i + 1}行] ${refProblems.join('；')}`)
            return false
          }
          return true
        })

        const totalInvalid = allErrors.length
        if (billWarnings.length > 0) {
          console.warn(`⚠️ ${billWarnings.length} 条账单因引用不存在的租客/房间/业主合同被跳过:\n` + billWarnings.join('\n'))
        }
        const refWarningText = billWarnings.length > 0
          ? `\n\n⚠️ 有 ${billWarnings.length} 条账单引用了不存在的租客/房间/业主合同，已跳过（详见控制台）`
          : ''

        // ─── 文件可识别性检查：防止导入无关 Excel 清空全部数据 ───
        // 若所有核心表都为空（无任何有效行），说明不是本系统的导出文件，中止导入
        const totalValidRows = validProps.length + validRooms.length + validContracts.length + validTenants.length + validBills.length + rawProfitRecords.length
        if (totalValidRows === 0) {
          console.warn('导入中止：文件中未找到任何有效数据（房源/房间/代理合同/租客/账单/利润提取 均为空）')
          setAlertState({
            title: '无法导入',
            message: '这个 Excel 文件中没有找到可识别的房屋管理数据。\n\n请确认选择的是本应用导出的文件（应包含「房源」「房间」「租客」「账单」等工作表）。',
            variant: 'error',
          })
          e.target.value = ''
          return
        }
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
                trash: s2.trash,
              })
              console.log('Excel 导入后云端保存结果:', saved ? '成功' : '失败')
              if (!saved) {
                console.error('❌ 云端保存失败，请检查控制台 [saveCloudData] 日志')
                setAlertState({ title: '云端同步失败', message: 'Excel 数据已保存到本地，但云端同步失败。\n\n可能原因：\n1. 网络连接问题\n2. Supabase 数据库权限不足\n\n请打开浏览器控制台（F12）查看详细错误。', variant: 'error' })
              } else {
                console.log('✅ Excel 数据已成功保存到云端')
              }
            } catch (err) {
              console.error('云端保存异常', err)
              setAlertState({ title: '云端同步失败', message: 'Excel 数据已保存到本地，但云端同步失败：' + (err as Error).message, variant: 'error' })
            }

            window.location.reload()
          }
          setConfirmAction({
            title: '导入数据',
            message: `共 ${allErrors.length} 行数据校验不通过（已跳过），确定导入 ${validProps.length + validRooms.length + validContracts.length + validTenants.length + validBills.length + rawProfitRecords.length} 条有效数据？\n\n详细错误请查看控制台 (F12)${refWarningText}`,
            variant: 'default',
            confirmText: '导入',
            cancelText: '取消',
            onAction: doImportAll,
          })
          e.target.value = ''
          return
        }

        // 无校验错误，仍弹确认框（防止部分 sheet 缺失时静默清空其他实体）
        const doImportClean = async () => {
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
              trash: s2.trash,
            })
            console.log('Excel 导入后云端保存结果:', saved ? '成功' : '失败')
            if (!saved) {
              console.error('❌ 云端保存失败，请检查控制台 [saveCloudData] 日志')
              setAlertState({ title: '云端同步失败', message: 'Excel 数据已保存到本地，但云端同步失败。\n\n可能原因：\n1. 网络连接问题\n2. Supabase 数据库权限不足\n\n请打开浏览器控制台（F12）查看详细错误。', variant: 'error' })
            } else {
              console.log('✅ Excel 数据已成功保存到云端')
            }
          } catch (err) {
            console.error('云端保存异常', err)
            setAlertState({ title: '云端同步失败', message: 'Excel 数据已保存到本地，但云端同步失败：' + (err as Error).message, variant: 'error' })
          }

          window.location.reload()
        }
        // 无校验错误：确认后再导入（导入会替换现有全部数据）
        setConfirmAction({
          title: '导入数据',
          message: `将从 Excel 导入 ${validProps.length} 房源、${validRooms.length} 房间、${validContracts.length} 代理合同、${validTenants.length} 租客、${validBills.length} 账单、${rawProfitRecords.length} 利润记录。\n\n⚠️ 导入将替换当前所有数据，确定继续？${refWarningText}`,
          variant: 'default',
          confirmText: '导入',
          cancelText: '取消',
          onAction: doImportClean,
        })
        e.target.value = ''
      } catch (err) {
        setAlertState({ title: '格式错误', message: 'Excel 格式错误，请检查文件', variant: 'error' })
        console.error(err)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /** 选中业主账单期数后的处理（复用于 select 和弹窗选择） */
  const handleBillSelect = (billId: string) => {
    setProfitBillId(billId)
    setProfitExtracted(false)
    if (billId) {
      const bill = bills.find(b => b.id === billId)
      if (bill?.description) {
        const { startDate: start, endDate: end } = extractPeriod(bill.description)
        if (start && end) {
          setProfitCycleStart(start)
          setProfitCycleEnd(end)
          const alreadyExtracted = profitRecords.some(r =>
            r.propertyId === profitPropertyId &&
            r.cycleStart === start &&
            r.cycleEnd === end
          )
          setProfitExtracted(alreadyExtracted)
          const propRooms = rooms.filter(r => r.propertyId === profitPropertyId)
          const propTenants = tenants.filter(t => propRooms.some(r => r.id === t.roomId))
          const result = calculatePeriodProfit(start, end, bill.amount, propTenants, propRooms, bills)
          setProfitResult(result)
          if (!alreadyExtracted) {
            setProfitAmount(String(Math.round(result.profitAmount)))
          }
        } else {
          // 描述格式无法识别（如被手动修改/导入异常）：清空上一次的周期与结果，防止旧数据残留显示
          setProfitCycleStart('')
          setProfitCycleEnd('')
          setProfitResult(null)
          setProfitAmount('')
          setAlertState({ title: '提示', message: '账单描述格式无法识别，无法提取周期。\n\n该账单描述应为「第N期 X租 YYYY-MM-DD ~ YYYY-MM-DD」格式。若描述被手动修改过，请恢复原格式或改选其他账单。', variant: 'info' })
        }
      }
    } else {
      setProfitCycleStart('')
      setProfitCycleEnd('')
      setProfitResult(null)
      setProfitAmount('')
    }
  }

  /** 复制租客收入明细到剪贴板 */
  const copyProfitDetail = async () => {
    if (!profitResult) return
    const prop = properties.find(p => p.id === profitPropertyId)
    const lines = profitResult.tenants.map(t => {
      let s = `${t.roomLabel} ${t.tenantName}：`
      if (t.overlapDays > 0) s += `${t.overlapDays}天${t.proratedRent.toFixed(0)}`
      else s += `0天`
      t.feeBreakdown.filter(f => f.type !== 'rent' || f.amount < 0).forEach(f => {
        s += `${f.amount < 0 ? '' : '+'}${f.label} ${f.amount.toFixed(0)}`
      })
      s += `=${(t.proratedRent + t.otherFeeIncome + t.adjustment).toFixed(0)}`
      if (!t.rentPaid && t.expectedRent > 0) s += '（未齐）'
      return s
    })
    const text = [`${prop?.address || ''} ${profitCycleStart}~${profitCycleEnd}`, ...lines].join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setProfitCopied(true)
    setTimeout(() => setProfitCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-6 pb-3">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-3">更多</h1>

          <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl p-4">
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
              <button type="button" onClick={() => setShowDepositList(true)} className="bg-white/10 rounded-xl p-2 text-center hover:bg-white/20 transition-colors">
                <p className="text-base font-bold text-white">¥{depositBalance.toFixed(0)}</p>
                <p className="text-blue-200 text-[10px]">已收租户押金</p>
              </button>
              <button type="button" onClick={() => setShowPaidDepositList(true)} className="bg-white/10 rounded-xl p-2 text-center hover:bg-white/20 transition-colors">
                <p className="text-base font-bold text-white">¥{paidDeposit.toFixed(0)}</p>
                <p className="text-blue-200 text-[10px]">已付业主押金</p>
              </button>
              <div className="bg-white/10 rounded-xl p-2 text-center">
                <p className={`text-base font-bold ${balance < 0 ? 'text-red-300' : 'text-white'}`}>¥{balance.toFixed(0)}</p>
                <p className="text-blue-200 text-[10px]">可支配余额</p>
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
              const isProfit = item.label === '利润提取'
              const isSettings = item.label === '设置'
              const isDiag = item.label === '诊断日志'
              
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
                    else if (isSettings) setShowSettings(!showSettings)
                    else if (isAbout) setShowAbout(!showAbout)
                    else if (isDiag) { setDiagList(getAuthDiag()); setShowDiag(!showDiag) }
                    else setAlertState({ title: '提示', message: `${item.label}功能开发中...`, variant: 'info' })
                  }}
                  className={`w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer ${isBackup && showBackup || isProfit && showProfitForm || isAbout && showAbout || isSettings && showSettings || isDiag && showDiag ? 'rounded-b-none border-b-0' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[item.color]}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900">{item.label}</p>
                    <p className="text-sm text-gray-500">{item.description}</p>
                  </div>
                  <div className={`w-5 h-5 text-gray-300 transition-transform ${isBackup && showBackup || isProfit && showProfitForm || isAbout && showAbout || isSettings && showSettings || isDiag && showDiag ? 'rotate-90' : ''}`}>
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
                {isSettings && showSettings && (
                  <div className="bg-white border border-gray-100 rounded-b-2xl shadow-sm px-4 pb-4 pt-2 -mt-px">
                    {(() => {
                      const showBills = settings?.showPropertyBills ?? true
                      return (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">显示房源账目</span>
                            <button
                              role="switch"
                              aria-checked={showBills}
                              onClick={() => setSettings({ showPropertyBills: !showBills })}
                              className={`w-11 h-6 rounded-full transition-colors relative ${showBills ? 'bg-blue-600' : 'bg-gray-300'}`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showBills ? 'translate-x-5' : ''}`} />
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">关闭后，房源管理页将不再显示每套房源的收款/付款账目</p>
                        </div>
                      )
                    })()}
                  </div>
                )}
                {isDiag && showDiag && (
                  <div className="bg-white border border-gray-100 rounded-b-2xl shadow-sm px-4 pb-4 pt-2 -mt-px">
                    <p className="text-xs text-gray-400 mb-2">登出/登录/被踢诊断记录（仅本机保存，最多 50 条）。下次遇到自动退出，把这里的内容复制发给开发者即可定位原因。</p>
                    {diagList.length === 0 ? (
                      <p className="text-sm text-gray-500 py-4 text-center">暂无记录</p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto mb-3">
                        {[...diagList].reverse().map((e, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                            <div className="text-gray-500">
                              {new Date(e.t).toLocaleString('zh-CN', { hour12: false })} · {e.reason}
                              {e.detail ? <span className="text-gray-400">（{e.detail}）</span> : null}
                            </div>
                            {(e.localToken || e.dbToken) && (
                              <div className="text-gray-400 mt-0.5 font-mono truncate">
                                本地 {e.localToken ?? '-'} | 云端 {e.dbToken ?? '-'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = diagList.map(e => `[${new Date(e.t).toISOString()}] ${e.reason}${e.detail ? ` (${e.detail})` : ''}${e.localToken || e.dbToken ? ` | 本地=${e.localToken ?? '-'} 云端=${e.dbToken ?? '-'}` : ''}`).join('\n')
                            await navigator.clipboard.writeText(text)
                            setDiagCopied(true)
                            setTimeout(() => setDiagCopied(false), 2000)
                          } catch {
                            setAlertState({ title: '提示', message: '复制失败，请用浏览器远程调试查看 localStorage', variant: 'info' })
                          }
                        }}
                        className="flex-1 py-2 px-3 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5 text-sm"
                      >
                        <Copy className="w-4 h-4" />
                        <span>{diagCopied ? '已复制' : '复制全部'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { clearAuthDiag(); setDiagList([]) }}
                        className="flex-1 py-2 px-3 bg-gray-50 text-gray-600 rounded-xl font-medium hover:bg-gray-100 transition-colors text-sm"
                      >
                        清空
                      </button>
                    </div>
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
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs whitespace-nowrap overflow-hidden text-ellipsis focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">选择房源</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>{p.address}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setShowBillPicker(true)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-left flex items-center justify-between"
                    >
                      <span className={profitBillId ? 'text-gray-900' : 'text-gray-400'}>
                        {profitBillId
                          ? formatBillDesc(landlordPayableBills.find(b => b.id === profitBillId)?.description) || '选择业主账单期数'
                          : '选择业主账单期数'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    </button>

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
                                <div className="flex items-center justify-between mb-0.5">
                                  <p className="text-[10px] text-gray-400 font-medium">租客收入明细</p>
                                  <button
                                    type="button"
                                    onClick={copyProfitDetail}
                                    className="flex items-center gap-0.5 text-[10px] text-blue-600 font-medium hover:text-blue-700"
                                  >
                                    <Copy className="w-3 h-3" />
                                    {profitCopied ? '已复制' : '一键复制'}
                                  </button>
                                </div>
                                {profitResult.tenants.map(t => (
                                  <div key={t.tenantId} className="text-[11px] leading-5 text-gray-600">
                                    <span className="text-gray-700 font-medium">{t.roomLabel} {t.tenantName}</span>
                                    <span>：</span>
                                    {t.overlapDays > 0 && (
                                      <span><b>{t.overlapDays}天</b>¥{t.proratedRent.toFixed(0)}</span>
                                    )}
                                    {t.feeBreakdown.filter(f => f.type !== 'rent' || f.amount < 0).map((f, fi) => (
                                      <span key={fi}>
                                        <span className="text-gray-400">+</span>{f.label}¥{f.amount.toFixed(0)}
                                      </span>
                                    ))}
                                    <span className="text-gray-400">=</span>
                                    <span className="text-gray-700 font-medium">
                                      ¥{(t.proratedRent + t.otherFeeIncome + t.adjustment).toFixed(0)}
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
                              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">提取日期</label>
                            <input
                              type="date"
                              value={profitExtractionDate}
                              onChange={(e) => setProfitExtractionDate(e.target.value)}
                              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* 最近提取记录（直接显示最近 2 次，更多则点击查看全部） */}
                    {profitPropertyId && propertyProfitRecords.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400 font-medium flex items-center gap-1">
                          <History className="w-3.5 h-3.5" />
                          最近提取
                        </p>
                        {propertyProfitRecords.slice(0, 2).map(r => (
                          <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {r.status === 'withdrawn' ? (
                                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                )}
                                <p className="text-sm font-medium text-gray-900 truncate">{r.cycleStart} ~ {r.cycleEnd}</p>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {r.extractedAt ? `提取日 ${r.extractedAt}` : '未提取'}
                                {r.isManual ? ' · 手动' : ''}
                                {r.remark ? ` · ${r.remark}` : ''}
                              </p>
                            </div>
                            <span className={`text-sm font-bold ml-2 shrink-0 ${r.profitAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              ¥{r.profitAmount.toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 更多提取记录入口（始终提供，供删除/查看全部） */}
                    {profitPropertyId && propertyProfitRecords.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowProfitRecords(true)}
                        className="w-full py-2.5 px-3 bg-gray-50 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <History className="w-4 h-4" />
                        {propertyProfitRecords.length > 2 ? `查看全部记录（${propertyProfitRecords.length} 笔）` : '管理提取记录'}
                      </button>
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
                          if (!profitPropertyId || isNaN(amount)) {
                            setAlertState({ title: '提示', message: '请选择房源并输入有效金额', variant: 'error' })
                            return
                          }
                          if (!profitCycleStart || !profitCycleEnd) {
                            setAlertState({ title: '提示', message: '请选择利润提取的账单周期', variant: 'error' })
                            return
                          }
                           addProfitRecord({
                             propertyId: profitPropertyId,
                             // 用 ?? 而非 ||：tenantIncome 为 0 时（负利润/无收入周期）必须存 0，不能回退成提取金额（Bug 22 修复）
                             tenantIncome: profitResult?.tenantIncome ?? amount,
                             landlordExpense: profitResult?.landlordExpense ?? 0,
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
                message: '确定要清除本机数据吗？此操作不可恢复！\n\n云端数据将同步清空，无法找回！',
                variant: 'danger',
                confirmText: '确认清除',
                onAction: () => {
                  clearAllData()
                  // 同步清空云端，防止下次启动又把旧数据拉回来
                  if (isSupabaseConfigured()) {
                    saveCloudData({
                      properties: [],
                      rooms: [],
                      tenants: [],
                      bills: [],
                      landlordContracts: [],
                      profitRecords: [],
                      trash: [],
                    }).then(ok => {
                      if (!ok) {
                        setAlertState({ title: '云端清除失败', message: '本机数据已清除，但云端清除失败（可能网络问题）。下次登录可能从云端恢复旧数据。', variant: 'error' })
                      }
                    })
                  }
                },
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
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] flex flex-col">
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
                      <p className="text-xs text-gray-500">{tenant?.name || ''}{b.amount < 0 ? '（退押金）' : ''} · {b.amount < 0 ? '已退' : '实收'} {b.paidDate || b.dueDate}</p>
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
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] flex flex-col">
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
                      <p className="text-xs text-gray-500">{b.amount < 0 ? '业主退押金' : '业主押金'} · {b.amount < 0 ? '已退' : '实付'} {b.paidDate || b.dueDate}</p>
                    </div>
                    <span className="text-sm font-bold ml-2 text-gray-900">¥{Math.abs(b.amount).toFixed(0)}</span>
                  </div>
                )
              })}
              {paidDepositBills.length === 0 && (
                <p className="text-center text-gray-400 py-8">暂无已付押金记录</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 利润提取记录弹窗 */}
      {showProfitRecords && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowProfitRecords(false) }}>
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold">提取记录</h3>
              <button type="button" onClick={() => setShowProfitRecords(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="flex items-center justify-between bg-purple-50 rounded-xl p-3 mb-3">
                <span className="text-sm font-medium text-purple-700">{propertyProfitRecords.length} 笔记录</span>
                <span className="text-lg font-bold text-purple-700">¥{propertyProfitRecords.reduce((s, r) => s + r.profitAmount, 0).toFixed(0)}</span>
              </div>
              {propertyProfitRecords.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {r.status === 'withdrawn' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      )}
                      <p className="text-sm font-medium text-gray-900 truncate">{r.cycleStart} ~ {r.cycleEnd}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.extractedAt ? `提取日 ${r.extractedAt}` : '未提取'}
                      {r.isManual ? ' · 手动' : ''}
                      {r.remark ? ` · ${r.remark}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className={`text-sm font-bold ${r.profitAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      ¥{r.profitAmount.toFixed(0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmAction({
                          title: '删除确认',
                          message: '确定删除这笔提取记录？',
                          variant: 'danger',
                          onAction: () => deleteProfitRecord(r.id),
                        })
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {propertyProfitRecords.length === 0 && (
                <p className="text-center text-gray-400 py-8">暂无提取记录</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 业主账单期数选择弹窗 */}
      {showBillPicker && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowBillPicker(false) }}>
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">选择业主账单期数</h3>
              <button type="button" onClick={() => setShowBillPicker(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {landlordPayableBills.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">暂无业主账单</div>
              ) : (
                landlordPayableBills.map((b) => {
                  const desc = b.description || ''
                  // 解析描述：提取免租标注
                  const vacancyMatch = desc.match(/（含免租(\d+)天）/)
                  const isSelected = profitBillId === b.id
                  // 该周期是否已提取过利润（同房源 + 同周期起止）
                  const { startDate, endDate } = extractPeriod(desc)
                  const isExtracted = !!(startDate && profitRecords.some(r =>
                    r.propertyId === profitPropertyId &&
                    r.cycleStart === startDate &&
                    r.cycleEnd === endDate
                  ))
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => { handleBillSelect(b.id); setShowBillPicker(false) }}
                      className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-50' : 'active:bg-gray-50'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {formatBillDesc(desc)}
                          {isExtracted && <span className="text-green-600"> 已提取</span>}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {vacancyMatch ? `含免租${vacancyMatch[1]}天 · ` : ''}¥{b.amount.toFixed(0)}
                        </p>
                      </div>
                      {isSelected && <CheckCircle className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                    </button>
                  )
                })
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
          setConfirmAction(null)
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

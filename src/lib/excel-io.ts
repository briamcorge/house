/**
 * Excel 导出/导入的列定义与纯逻辑。
 *
 * 为什么单独成模块（2026-09-14）：
 * 1. **列定义唯一**。原先 More.tsx 里「导出映射（字段→中文表头）」和「导入映射（中文表头→字段）」
 *    是两张各自手写的表，加列时极易只改一端 —— 加了导出忘了导入（或反之）不会有任何报错，
 *    只会在往返时静默丢数据。现在两张表都由下面同一份 COLUMNS 推导，结构上不可能再漏。
 * 2. **可测**。这些逻辑原本是 `handleImportExcel` 里 `reader.onload` 的闭包，测试无法 import，
 *    所以「导出→导入」往返从来没被验证过。搬到这里后可以被 zcode测试/excel-roundtrip.test.ts
 *    用真实 XLSX 库跑完整往返。
 *
 * More.tsx 只负责：组装工作簿/样式/写盘、FileReader、完整性护栏、落库与云同步。
 */

import type { Bill, LandlordContract, ProfitRecord, Property, Room, Tenant } from '../types'

export const SHEET_NAMES = ['房源', '房间', '代理合同', '租客', '账单', '利润提取'] as const
export type SheetName = (typeof SHEET_NAMES)[number]

export interface ColumnDef {
  /** Excel 表头（用户可见的中文列名） */
  label: string
  /** 导出时从数据对象上取值的键；null = 该列只用于导入（历史格式兼容），导出不产出 */
  exportKey: string | null
  /** 导入时写回的字段名；缺省与 exportKey 相同 */
  importKey?: string
  /** 仅导入接受的历史表头别名（优先级低于 label，两者同时存在时以 label 为准） */
  aliases?: string[]
}

/**
 * 列定义（顺序即导出列顺序）。
 *
 * ⚠️ 账单表的两类特殊列，改前先读懂再动：
 * - **方向特定列**：导出时同一份 `dueDate` 按方向分流到「收款日」/「付款日」，
 *   `paidDate` 分流到「实收日」/「实付日」；导入时再合并回 `dueDate`/`paidDate`
 *   （见 postProcessRows）。所以这几列的 exportKey 是中文、importKey 是 `_` 前缀的临时字段。
 * - **开始日/结束日**：导出从 description 正则抽出的派生列，导入认但**没有归宿**
 *   （postProcessRows 会 delete 掉）—— 数据不丢，因为 description 原文本身会往返，
 *   但这属于「导出有列、导入无模型字段」，不是漏列，勿按漏列修。
 */
export const COLUMNS: Record<SheetName, ColumnDef[]> = {
  房源: [
    { label: 'ID', exportKey: 'id' },
    { label: '地址', exportKey: 'address' },
    { label: '户型', exportKey: 'houseType' },
    { label: '面积', exportKey: 'area' },
    { label: '备注', exportKey: 'description' },
    { label: '创建时间', exportKey: 'createdAt' },
  ],
  房间: [
    { label: 'ID', exportKey: 'id' },
    { label: '房源ID', exportKey: 'propertyId' },
    { label: '编号', exportKey: 'label' },
    { label: '类型', exportKey: 'roomType' },
    { label: '状态', exportKey: 'status' },
    { label: '创建时间', exportKey: 'createdAt' },
  ],
  代理合同: [
    { label: 'ID', exportKey: 'id' },
    { label: '合同编号', exportKey: 'displayId' },
    { label: '房源ID', exportKey: 'propertyId' },
    { label: '业主姓名', exportKey: 'landlordName' },
    { label: '业主电话', exportKey: 'landlordPhone' },
    { label: '月租金', exportKey: 'monthlyRent' },
    { label: '付款方式', exportKey: 'paymentMethod' },
    { label: '押金', exportKey: 'deposit' },
    { label: '免租期', exportKey: 'vacancyAllowance' },
    { label: '合同开始', exportKey: 'contractStart' },
    { label: '合同结束', exportKey: 'contractEnd' },
    { label: '状态', exportKey: 'status' },
    { label: '结束原因', exportKey: 'endReason' },
    { label: '上一合同ID', exportKey: 'previousContractId' },
    { label: '暂存账单', exportKey: 'pendingBills' },
    { label: '创建时间', exportKey: 'createdAt' },
  ],
  租客: [
    { label: 'ID', exportKey: 'id' },
    { label: '合同编号', exportKey: 'displayId' },
    { label: '姓名', exportKey: 'name' },
    { label: '电话', exportKey: 'phone' },
    { label: '房间ID', exportKey: 'roomId' },
    { label: '合同开始', exportKey: 'contractStart' },
    { label: '合同结束', exportKey: 'contractEnd' },
    { label: '退租日', exportKey: 'effectiveEnd' },
    { label: '月租金', exportKey: 'monthlyRent' },
    { label: '付款方式', exportKey: 'paymentMethod' },
    { label: '提前天数', exportKey: 'advanceDays' },
    { label: '切分方式', exportKey: 'billSplit' },
    { label: '押金', exportKey: 'deposit' },
    { label: '其他费用', exportKey: 'otherFeeName' },
    { label: '其他金额', exportKey: 'otherFeeAmount' },
    { label: '免租开始', exportKey: 'vacancyStart' },
    { label: '免租结束', exportKey: 'vacancyEnd' },
    { label: '状态', exportKey: 'status' },
    { label: '结束原因', exportKey: 'endReason' },
    { label: '上一合同ID', exportKey: 'previousTenantId' },
    { label: '暂存账单', exportKey: 'pendingBills' },
    { label: '创建时间', exportKey: 'createdAt' },
  ],
  账单: [
    { label: 'ID', exportKey: 'id' },
    { label: '房源ID', exportKey: 'propertyId' },
    { label: '房间ID', exportKey: 'roomId' },
    { label: '租客ID', exportKey: 'tenantId' },
    { label: '金额', exportKey: 'amount' },
    { label: '已付金额', exportKey: 'paidAmount' },
    { label: '类型', exportKey: 'type' },
    { label: '状态', exportKey: 'status' },
    { label: '方向', exportKey: 'direction' },
    // 仅导入：旧备份用过「到期日」，导出已改成分方向的收款日/付款日
    { label: '到期日', exportKey: null, importKey: 'dueDate' },
    { label: '收款日', exportKey: '收款日', importKey: '_dueDateR' },
    { label: '付款日', exportKey: '付款日', importKey: '_dueDateP' },
    { label: '开始日', exportKey: 'startDate', importKey: '_startDate' },
    { label: '结束日', exportKey: 'endDate', importKey: '_endDate' },
    { label: '覆盖开始', exportKey: 'periodStart' },
    { label: '覆盖结束', exportKey: 'periodEnd' },
    { label: '实收日', exportKey: '实收日', importKey: '_paidDateR' },
    { label: '实付日', exportKey: '实付日', importKey: 'paidDate' },
    { label: '业主合同ID', exportKey: 'landlordContractId' },
    { label: '期间描述', exportKey: 'description', aliases: ['描述'] },
    { label: '创建时间', exportKey: 'createdAt' },
  ],
  利润提取: [
    { label: 'ID', exportKey: 'id' },
    { label: '房源ID', exportKey: 'propertyId' },
    { label: '周期开始', exportKey: 'cycleStart' },
    { label: '周期结束', exportKey: 'cycleEnd' },
    { label: '租客收入', exportKey: 'tenantIncome' },
    { label: '业主支出', exportKey: 'landlordExpense' },
    { label: '利润', exportKey: 'profitAmount' },
    { label: '状态', exportKey: 'status' },
    { label: '提取日期', exportKey: 'extractedAt' },
    { label: '提现时间', exportKey: 'withdrawnAt' },
    { label: '手动', exportKey: 'isManual' },
    { label: '备注', exportKey: 'remark' },
    { label: '创建时间', exportKey: 'createdAt' },
  ],
}

/** 导出列（跳过仅导入的列），顺序即列顺序 */
export function exportColumns(sheet: SheetName): ColumnDef[] {
  return COLUMNS[sheet].filter(c => c.exportKey !== null)
}

/** 导出用「字段→中文表头」映射（供列对称性测试与人工核对） */
export function exportHeaders(sheet: SheetName): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of exportColumns(sheet)) out[c.exportKey as string] = c.label
  return out
}

/** 导入用「中文表头→字段」映射（含历史别名） */
export function importHeaders(sheet: SheetName): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of COLUMNS[sheet]) {
    const key = c.importKey ?? (c.exportKey as string)
    // 别名先写、正式表头后写 → 两者同时存在时以正式表头为准
    for (const alias of c.aliases ?? []) out[alias] = key
    out[c.label] = key
  }
  return out
}

/** 纯日期字段（YYYY-MM-DD）。createdAt 是 ISO 时间戳，不在此列，避免归一化误伤 */
export const DATE_FIELDS = new Set([
  'dueDate', 'paidDate', '_dueDateR', '_dueDateP', '_paidDateR',
  '_startDate', '_endDate', 'periodStart', 'periodEnd',
  'contractStart', 'contractEnd', 'effectiveEnd',
  'vacancyStart', 'vacancyEnd',
  'cycleStart', 'cycleEnd', 'extractedAt', 'withdrawnAt',
])

/** 字符串字段：即使 Excel 存成数字（如 11 位手机号被转数值）也强制还原为字符串 */
export const STRING_FIELDS = new Set(['phone', 'landlordPhone', 'description'])

/** ISO 时间戳字段：Excel 可能把 ISO 时间转成日期序列号，检测到序列号转回 ISO 字符串 */
export const ISO_FIELDS = new Set(['createdAt'])

/** 从描述中提取账单起止日（格式：第N期 xxx YYYY-MM-DD ~ YYYY-MM-DD） */
export function extractPeriod(desc?: string): { startDate: string; endDate: string } {
  if (!desc) return { startDate: '', endDate: '' }
  const match = desc.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
  if (match) return { startDate: match[1], endDate: match[2] }
  return { startDate: '', endDate: '' }
}

/** Excel 日期序列号下限 36526 = 2000-01-01，避免把手填的年份数字（如 2026）误当序列号转成 1905 年 */
const EXCEL_SERIAL_MIN = 36526
const EXCEL_SERIAL_MAX = 60000

function excelSerialToUtcIso(v: number): string {
  const d = new Date(Math.round((v - 25569) * 86400 * 1000))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * 归一化 Excel 日期值 → YYYY-MM-DD；空值返回 ''（由调用方决定是否置 undefined）
 * 处理：Excel 日期序列号（如 46244）、斜杠/点号格式（2026/8/5）、已是 YYYY-MM-DD 原样保留
 *
 * ⚠️ 兜底 `return s` 会把无法识别的原值原样放行（如 'abc'、'2026.8.5.6'），
 * 所以逐字段的 checkDate 格式闸是必需的，不是冗余。
 */
export function normalizeExcelDate(v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'number' && v >= EXCEL_SERIAL_MIN && v < EXCEL_SERIAL_MAX) {
    return excelSerialToUtcIso(v)
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (m) {
    return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return s
}

export interface ExportData {
  properties: Property[]
  rooms: Room[]
  landlordContracts: LandlordContract[]
  tenants: Tenant[]
  bills: Bill[]
  profitRecords: ProfitRecord[]
}

/**
 * 导出：业务数据 → 该 sheet 的行对象数组（键为 exportKey）。
 * 这里只做取值与形态转换（空值补 ''、数组 join、对象 JSON 化），不做校验。
 */
export function buildSheetRows(sheet: SheetName, data: ExportData): Record<string, unknown>[] {
  switch (sheet) {
    case '房源':
      return data.properties.map(p => ({ ...p, houseType: p.houseType ?? '', area: p.area ?? '' }))
    case '房间':
      return data.rooms as unknown as Record<string, unknown>[]
    case '代理合同':
      return data.landlordContracts.map(c => ({
        ...c,
        landlordPhone: c.landlordPhone ?? '',
        endReason: c.endReason ?? '',
        previousContractId: c.previousContractId ?? '',
        deposit: c.deposit ?? '',
        vacancyAllowance: Array.isArray(c.vacancyAllowance) ? c.vacancyAllowance.join(',') : (c.vacancyAllowance ?? ''),
        pendingBills: c.pendingBills?.length ? JSON.stringify(c.pendingBills) : '',
      }))
    case '租客':
      return data.tenants.map(t => ({
        ...t,
        billSplit: t.billSplit ?? '',
        deposit: t.deposit ?? '',
        otherFeeAmount: t.otherFeeAmount ?? '',
        effectiveEnd: t.effectiveEnd ?? '',
        endReason: t.endReason ?? '',
        previousTenantId: t.previousTenantId ?? '',
        vacancyStart: t.vacancyStart ?? '',
        vacancyEnd: t.vacancyEnd ?? '',
        pendingBills: t.pendingBills?.length ? JSON.stringify(t.pendingBills) : '',
      }))
    case '账单': {
      // 排序：应收在前、应付在后；同方向按房源聚合；再按应收日升序（便于人工查阅）
      const sorted = [...data.bills].sort((a, b) => {
        if (a.direction !== b.direction) return a.direction === 'receivable' ? -1 : 1
        if ((a.propertyId || '') !== (b.propertyId || '')) return (a.propertyId || '') < (b.propertyId || '') ? -1 : 1
        return (a.dueDate || '').localeCompare(b.dueDate || '')
      })
      return sorted.map(b => {
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
      }) as unknown as Record<string, unknown>[]
    }
    case '利润提取':
      return data.profitRecords.map(r => ({
        ...r,
        extractedAt: r.extractedAt ?? '',
        withdrawnAt: r.withdrawnAt ?? '',
        isManual: r.isManual ? '是' : '',
        remark: r.remark ?? '',
      }))
  }
}

/** 导出：行对象数组 → 二维数组（表头行 + 数据行），直接交给 XLSX.utils.aoa_to_sheet */
export function sheetToAoa(sheet: SheetName, rows: Record<string, unknown>[]): unknown[][] {
  const cols = exportColumns(sheet)
  const labels = cols.map(c => c.label)
  return [labels, ...rows.map(row => cols.map(c => row[c.exportKey as string] ?? ''))]
}

/**
 * 导入：XLSX.utils.sheet_to_json 的输出 → 字段对象数组。
 * 按列定义的字段类型分流：日期归一化 / ISO 序列号还原 / 字符串强制 / 数字兜底。
 */
export function parseSheetRows(json: Record<string, unknown>[], sheet: SheetName): Record<string, unknown>[] {
  const headerMap = importHeaders(sheet)
  const labels = Object.keys(headerMap)
  return json.map(row => {
    const obj: Record<string, unknown> = {}
    for (const cn of labels) {
      const en = headerMap[cn]
      if (row[cn] === undefined) continue
      if (DATE_FIELDS.has(en)) {
        // 日期字段：空值保持 undefined，非空归一化为 YYYY-MM-DD
        obj[en] = row[cn] === '' ? undefined : normalizeExcelDate(row[cn])
      } else if (ISO_FIELDS.has(en)) {
        // ISO 时间戳字段：Excel 数字序列号 → 转回 ISO 字符串；已是字符串原样保留
        obj[en] = row[cn] === '' || row[cn] === undefined || row[cn] === null
          ? undefined
          : (typeof row[cn] === 'number' && row[cn] >= EXCEL_SERIAL_MIN && row[cn] < EXCEL_SERIAL_MAX
            ? new Date(Math.round((row[cn] - 25569) * 86400 * 1000)).toISOString()
            : String(row[cn]))
      } else if (STRING_FIELDS.has(en)) {
        // 字符串字段（电话号）：Excel 可能转成数字，强制还原为字符串
        obj[en] = row[cn] === '' || row[cn] === undefined || row[cn] === null
          ? undefined
          : String(row[cn])
      } else {
        // 数字字段：空值保持 undefined（不做 0 填充，避免押金 0 被误判），非数字则保留原值
        // 安全：拒绝 Infinity/NaN（Number('Infinity')/Number('1e999') 会得到 Infinity，必须拦下）
        const n = Number(row[cn])
        obj[en] = row[cn] === '' || row[cn] === undefined || row[cn] === null
          ? undefined
          : (isNaN(n) || !isFinite(n) ? row[cn] : n)
      }
    }
    return obj
  })
}

/** 导入：字段级规范化（押金空值、免租期逗号数组、暂存账单 JSON、账单方向列合并） */
export function postProcessRows(sheet: SheetName, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const parsePendingBills = (v: unknown): Bill[] | undefined => {
    if (!v) return undefined
    try {
      const arr = JSON.parse(String(v))
      return Array.isArray(arr) ? (arr as Bill[]) : undefined
    } catch { return undefined }
  }

  switch (sheet) {
    case '代理合同':
      return rows.map(c => ({
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
        pendingBills: parsePendingBills(c.pendingBills),
      }))
    case '租客':
      return rows.map(t => ({
        ...t,
        deposit: Number(t.deposit) > 0 ? Number(t.deposit) : undefined,
        pendingBills: parsePendingBills(t.pendingBills),
      }))
    case '账单':
      return rows.map(b => {
        // 合并方向特定列：新格式的收款日/付款日 → dueDate，实收日 → paidDate
        if (!b.dueDate) {
          b.dueDate = String(b._dueDateR || b._dueDateP || '')
        }
        if (!b.paidDate) {
          b.paidDate = String(b._paidDateR || b.paidDate || '')
        }
        delete b._dueDateR; delete b._dueDateP
        delete b._paidDateR; delete b._startDate; delete b._endDate
        return b
      })
    case '利润提取':
      return rows.map(r => ({
        ...r,
        tenantIncome: Number(r.tenantIncome) || 0,
        landlordExpense: Number(r.landlordExpense) || 0,
        profitAmount: Number(r.profitAmount) || 0,
        extractedAt: String(r.extractedAt || ''),
        isManual: r.isManual === '是' ? true : undefined,
        remark: String(r.remark || ''),
      }))
    default:
      return rows
  }
}

const VALID_BILL_TYPES = new Set(['rent', 'deposit', 'agency', 'sublease', 'hygiene', 'internet', 'utilities', 'other'])
const VALID_PAYMENT_METHODS = ['monthly', 'bi-monthly', 'quarterly', 'semi-annual', 'annual']

/**
 * 导入：单行校验。返回错误文案数组（空数组 = 通过）。
 * ⚠️ 有副作用：部分字段空值会被填默认值（row.status / row.type / row.direction 等），
 * 属容错设计，不是校验漏洞。
 */
export function validateImportRow(sheetName: SheetName, row: Record<string, unknown>, index: number): string[] {
  const errors: string[] = []
  const prefix = `[${sheetName} 第${index + 1}行]`

  // 通用：id 非空（引用完整性依赖 id，缺失会导致账单引用校验误判）
  if (!row.id || String(row.id).trim() === '') errors.push(`${prefix} ID不能为空`)

  // 通用：日期字段格式校验（YYYY-MM-DD，防畸形日期 NaN 传播）
  // 注意：只校验形状，不校验日历有效性（2026-13-45 能通过）——与导出列一一对应即可
  const checkDate = (field: string, label: string) => {
    const v = row[field]
    if (v === undefined || v === null || v === '') return
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      errors.push(`${prefix} ${label} 格式必须为 YYYY-MM-DD`)
    }
  }

  // 通用：金额字段拒绝 Infinity/NaN/负数
  const checkAmount = (field: string, label: string) => {
    const v = row[field]
    if (v === undefined || v === null || v === '') return
    const n = Number(v)
    if (isNaN(n) || !isFinite(n) || n < 0) {
      errors.push(`${prefix} ${label} 必须为有效非负数字`)
    }
  }

  // 通用：金额字段只拒绝 Infinity/NaN，允许负数（账单退押金/退租金、负利润是正常业务，2026-09-06 修复）
  const checkFinite = (field: string, label: string) => {
    const v = row[field]
    if (v === undefined || v === null || v === '') return
    const n = Number(v)
    if (isNaN(n) || !isFinite(n)) {
      errors.push(`${prefix} ${label} 必须为有效数字`)
    }
  }

  switch (sheetName) {
    case '房源':
      if (!row.address || String(row.address).trim() === '') errors.push(`${prefix} 地址不能为空`)
      break
    case '房间':
      if (!row.propertyId || String(row.propertyId).trim() === '') errors.push(`${prefix} 房源ID不能为空`)
      if (!row.label || String(row.label).trim() === '') errors.push(`${prefix} 编号不能为空`)
      if (!row.roomType || String(row.roomType).trim() === '') errors.push(`${prefix} 类型不能为空`)
      // 状态空值默认 vacant（2026-09-06 修复：避免导入后 undefined 导致 UI 异常）
      if (row.status === undefined || row.status === '') row.status = 'vacant'
      if (row.status !== undefined && row.status !== '' && !['vacant', 'occupied'].includes(String(row.status))) errors.push(`${prefix} 状态必须为 vacant/occupied 之一`)
      break
    case '代理合同':
      if (!row.propertyId || String(row.propertyId).trim() === '') errors.push(`${prefix} 房源ID不能为空`)
      checkAmount('monthlyRent', '月租金')
      checkAmount('deposit', '押金')
      if (row.monthlyRent === undefined || Number(row.monthlyRent) <= 0) errors.push(`${prefix} 月租金必须大于0`)
      if (!row.contractStart || String(row.contractStart).trim() === '') errors.push(`${prefix} 合同开始日期不能为空`)
      if (!row.contractEnd || String(row.contractEnd).trim() === '') errors.push(`${prefix} 合同结束日期不能为空`)
      checkDate('contractStart', '合同开始日期')
      checkDate('contractEnd', '合同结束日期')
      if (row.paymentMethod !== undefined && row.paymentMethod !== '' && !VALID_PAYMENT_METHODS.includes(String(row.paymentMethod))) errors.push(`${prefix} 付款方式必须为 monthly/bi-monthly/quarterly/semi-annual/annual 之一`)
      // 状态空值默认 active（2026-09-06 修复）
      if (row.status === undefined || row.status === '') row.status = 'active'
      if (row.status !== undefined && row.status !== '' && !['active', 'ended'].includes(String(row.status))) errors.push(`${prefix} 状态必须为 active/ended 之一`)
      if (row.endReason !== undefined && row.endReason !== '' && !['checkout', 'renew'].includes(String(row.endReason))) errors.push(`${prefix} 结束原因必须为 checkout/renew 之一`)
      break
    case '租客':
      if (!row.name || String(row.name).trim() === '') errors.push(`${prefix} 姓名不能为空`)
      if (!row.roomId || String(row.roomId).trim() === '') errors.push(`${prefix} 房间ID不能为空`)
      if (!row.contractStart || String(row.contractStart).trim() === '') errors.push(`${prefix} 合同开始日期不能为空`)
      if (!row.contractEnd || String(row.contractEnd).trim() === '') errors.push(`${prefix} 合同结束日期不能为空`)
      checkDate('contractStart', '合同开始日期')
      checkDate('contractEnd', '合同结束日期')
      checkDate('effectiveEnd', '退租日')
      // 免租期两列（v1.293 加的导出/导入列，当时漏了格式校验 → 补于 2026-09-14）
      checkDate('vacancyStart', '免租开始')
      checkDate('vacancyEnd', '免租结束')
      checkAmount('monthlyRent', '月租金')
      checkAmount('deposit', '押金')
      checkAmount('otherFeeAmount', '其他金额')
      if (row.monthlyRent === undefined || Number(row.monthlyRent) <= 0) errors.push(`${prefix} 月租金必须大于0`)
      if (row.paymentMethod !== undefined && row.paymentMethod !== '' && !VALID_PAYMENT_METHODS.includes(String(row.paymentMethod))) errors.push(`${prefix} 付款方式必须为 monthly/bi-monthly/quarterly/semi-annual/annual 之一`)
      // 状态空值默认 active（2026-09-06 修复）
      if (row.status === undefined || row.status === '') row.status = 'active'
      if (row.status !== undefined && row.status !== '' && !['active', 'ended'].includes(String(row.status))) errors.push(`${prefix} 状态必须为 active/ended 之一`)
      if (row.endReason !== undefined && row.endReason !== '' && !['checkout', 'renew'].includes(String(row.endReason))) errors.push(`${prefix} 结束原因必须为 checkout/renew 之一`)
      if (row.billSplit !== undefined && row.billSplit !== '' && !['front', 'rear'].includes(String(row.billSplit))) errors.push(`${prefix} 切分方式必须为 front/rear 之一`)
      break
    case '账单':
      if (row.amount === undefined || isNaN(Number(row.amount)) || !isFinite(Number(row.amount))) errors.push(`${prefix} 金额必须为有效数字`)
      // 空值默认值（2026-09-06 修复：避免导入后 undefined 导致 UI 异常）
      if (row.type === undefined || row.type === '') row.type = 'other'
      if (row.status === undefined || row.status === '') row.status = 'pending'
      if (row.direction === undefined || row.direction === '') row.direction = 'receivable'
      if (row.type && !VALID_BILL_TYPES.has(String(row.type))) errors.push(`${prefix} 类型必须为 rent/deposit/agency/sublease/hygiene/internet/utilities/other 之一`)
      if (row.status !== undefined && row.status !== '' && !['pending', 'paid', 'overdue', 'cancelled', 'refunded'].includes(String(row.status))) errors.push(`${prefix} 状态必须为 pending/paid/overdue/cancelled/refunded 之一`)
      if (row.direction !== undefined && row.direction !== '' && !['payable', 'receivable'].includes(String(row.direction))) errors.push(`${prefix} 方向必须为 payable/receivable 之一`)
      if (!row.dueDate || String(row.dueDate).trim() === '') errors.push(`${prefix} 到期日不能为空`)
      checkDate('dueDate', '到期日')
      checkDate('paidDate', '实付日')
      checkDate('periodStart', '覆盖开始')
      checkDate('periodEnd', '覆盖结束')
      // 账单金额允许负数（退押金/退租金/返款为负数账单，2026-09-06 修复导入被拒 bug）
      checkFinite('amount', '金额')
      checkFinite('paidAmount', '已付金额')
      break
    case '利润提取':
      if (!row.propertyId || String(row.propertyId).trim() === '') errors.push(`${prefix} 房源ID不能为空`)
      checkAmount('tenantIncome', '租客收入')
      checkAmount('landlordExpense', '业主支出')
      // 利润允许负数（负利润也要允许提取，2026-09-06 修复导入被拒 bug）
      checkFinite('profitAmount', '利润')
      checkDate('cycleStart', '周期开始')
      checkDate('cycleEnd', '周期结束')
      checkDate('extractedAt', '提取日期')
      checkDate('withdrawnAt', '提现时间')
      // 状态空值默认 available（2026-09-06 修复）
      if (row.status === undefined || row.status === '') row.status = 'available'
      if (row.status !== undefined && row.status !== '' && !['available', 'withdrawn'].includes(String(row.status))) errors.push(`${prefix} 状态必须为 available/withdrawn 之一`)
      break
  }
  return errors
}

/**
 * 导入：sheet 内 ID 唯一性（重复行报错并跳过，防 React key 冲突）。
 * 返回逐行是否可用 + 错误文案；ID 为空的行交给 validateImportRow 报「ID不能为空」。
 */
export function findDuplicateIds(sheetName: SheetName, rows: Record<string, unknown>[]): { ok: boolean[]; errors: string[] } {
  const seen = new Set<string>()
  const ok: boolean[] = []
  const errors: string[] = []
  rows.forEach((row, i) => {
    const id = String((row as { id?: unknown }).id ?? '')
    if (!id) { ok.push(true); return }
    if (seen.has(id)) {
      errors.push(`[${sheetName} 第${i + 1}行] ID 重复：${id}`)
      ok.push(false)
    } else {
      seen.add(id)
      ok.push(true)
    }
  })
  return { ok, errors }
}

/** 导入：账单的引用完整性问题（引用了本次导入中不存在的租客/房间/业主合同） */
export function findMissingRefs(
  row: Record<string, unknown>,
  tenantIds: Set<string>,
  roomIds: Set<string>,
  contractIds: Set<string>,
): string[] {
  const problems: string[] = []
  if (row.tenantId && !tenantIds.has(String(row.tenantId))) problems.push(`租客ID ${String(row.tenantId)} 不存在`)
  if (row.roomId && !roomIds.has(String(row.roomId))) problems.push(`房间ID ${String(row.roomId)} 不存在`)
  if (row.landlordContractId && !contractIds.has(String(row.landlordContractId))) problems.push(`业主合同ID ${String(row.landlordContractId)} 不存在`)
  return problems
}

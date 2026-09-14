/**
 * Excel 导出/导入 往返一致性测试
 *
 * 覆盖四层：
 * 1. 往返无损 —— 造一份业务数据 → 走 app 的导出路径生成真 XLSX（XLSX.write）→
 *    再用 app 的导入路径读回（XLSX.read → parseSheetRows → postProcessRows）→
 *    字段逐个比对，并且**导入校验必须零错误**（否则真实导入时这些行会被静默跳过）
 * 2. 列对称性 —— 导出认得的表头导入必须认得（反之亦然，登记的历史列除外）。
 *    这是「加了导出忘了导入」这类静默丢列漏口的结构性护栏。
 * 3. 免租期两列（免租开始/免租结束，v1.293 加的列）的格式校验 —— 2026-09-14 补的 checkDate
 * 4. 旧备份兼容 —— v1.293 之前的文件没有免租两列，导入必须照常通过
 *
 * ⚠️ 本文件用的是**合成数据**，不用真实导出文件（仓库公开，且真实数据不该入库）。
 * 真实旧备份只在本地手工跑一次兼容性验证。
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  SHEET_NAMES,
  exportColumns,
  exportHeaders,
  importHeaders,
  buildSheetRows,
  sheetToAoa,
  parseSheetRows,
  postProcessRows,
  validateImportRow,
  findDuplicateIds,
  findMissingRefs,
  normalizeExcelDate,
  extractPeriod,
  type SheetName,
  type ExportData,
} from '../src/lib/excel-io'
import type { Bill, LandlordContract, ProfitRecord, Property, Room, Tenant } from '../src/types'

// ───────────────────────── 合成数据 ─────────────────────────

const PROPERTIES: Property[] = [
  { id: 'p1', address: '北京市朝阳区示例路1号院2单元301', houseType: '两室一厅', area: 78.5, description: '整租给二房东', createdAt: '2026-01-05T02:00:00.000Z' },
  { id: 'p2', address: '北京市海淀区样例街9号', houseType: '三居', area: 112, createdAt: '2026-02-11T02:00:00.000Z' },
]

const ROOMS: Room[] = [
  { id: 'r1', propertyId: 'p1', label: 'A', roomType: '主卧', status: 'occupied', createdAt: '2026-01-05T02:00:00.000Z' },
  { id: 'r2', propertyId: 'p1', label: 'B', roomType: '次卧', status: 'vacant', createdAt: '2026-01-05T02:00:00.000Z' },
]

const CONTRACTS: LandlordContract[] = [
  {
    id: 'c1', displayId: 'DL-0001', propertyId: 'p1', landlordName: '张三', landlordPhone: '13800138000',
    monthlyRent: 5200, paymentMethod: 'quarterly', deposit: 5200, vacancyAllowance: [30, 15],
    contractStart: '2026-01-10', contractEnd: '2029-01-09', status: 'active', createdAt: '2026-01-05T02:00:00.000Z',
  },
  {
    id: 'c2', displayId: 'DL-0002', propertyId: 'p2', landlordName: '赵六', monthlyRent: 4800,
    paymentMethod: 'annual', deposit: 0, vacancyAllowance: 30, contractStart: '2024-06-01',
    contractEnd: '2027-05-31', status: 'ended', endReason: 'renew', previousContractId: 'c0',
    createdAt: '2024-05-20T02:00:00.000Z',
  },
]

const TENANTS: Tenant[] = [
  {
    // 免租期（两个新列的核心用例）
    id: 't1', displayId: 'ZL-0001', name: '李四', phone: '13900139000', roomId: 'r1',
    contractStart: '2026-01-15', contractEnd: '2027-01-14', monthlyRent: 2600, paymentMethod: 'monthly',
    advanceDays: 5, billSplit: 'front', deposit: 2600, otherFeeName: '网费', otherFeeAmount: 50,
    vacancyStart: '2026-01-15', vacancyEnd: '2026-02-03',
    status: 'active', createdAt: '2026-01-10T02:00:00.000Z',
  },
  {
    // 已退租 + 暂存账单
    id: 't2', displayId: 'ZL-0002', name: '王五', phone: '13700137000', roomId: 'r2',
    contractStart: '2025-03-01', contractEnd: '2026-02-28', monthlyRent: 2100, paymentMethod: 'semi-annual',
    advanceDays: 0, deposit: 2100, effectiveEnd: '2026-02-20', status: 'ended', endReason: 'checkout',
    previousTenantId: 't0',
    pendingBills: [{
      id: 'pb1', amount: 2100, type: 'rent', status: 'pending', direction: 'receivable',
      dueDate: '2026-03-01', description: '第12期 月租 2026-02-01 ~ 2026-02-28',
      createdAt: '2026-02-01T02:00:00.000Z',
    }],
    createdAt: '2025-02-25T02:00:00.000Z',
  },
  {
    // 续约链，无免租期
    id: 't3', displayId: 'ZL-0003', name: '钱七', phone: '13600136000', roomId: 'r1',
    contractStart: '2027-01-15', contractEnd: '2028-01-14', monthlyRent: 2700, paymentMethod: 'monthly',
    advanceDays: 5, deposit: 2700, otherFeeName: '物业费',
    status: 'active', previousTenantId: 't1', createdAt: '2027-01-10T02:00:00.000Z',
  },
]

const BILLS: Bill[] = [
  {
    // 应收已收 + 部分收款（paidAmount）
    id: 'b1', propertyId: 'p1', roomId: 'r1', tenantId: 't1', amount: 2600, paidAmount: 1300,
    type: 'rent', status: 'paid', direction: 'receivable', dueDate: '2026-02-05', paidDate: '2026-02-03',
    description: '第1期 月租 2026-01-15 ~ 2026-02-13', periodStart: '2026-01-15', periodEnd: '2026-02-13',
    createdAt: '2026-01-10T02:00:00.000Z',
  },
  {
    // 应付待付（无 paidDate）
    id: 'b2', propertyId: 'p1', landlordContractId: 'c1', amount: 1560,
    type: 'rent', status: 'pending', direction: 'payable', dueDate: '2026-02-10',
    description: '第1期 季租 2026-01-10 ~ 2026-04-09', periodStart: '2026-01-10', periodEnd: '2026-04-09',
    createdAt: '2026-01-05T02:00:00.000Z',
  },
  {
    // 负数账单（退押金）——历史上被导入校验拒过，必须是常数项
    id: 'b3', propertyId: 'p1', roomId: 'r2', tenantId: 't2', amount: -2100, type: 'deposit',
    status: 'refunded', direction: 'receivable', dueDate: '2026-02-20', paidDate: '2026-02-20',
    description: '退押金', createdAt: '2026-02-20T02:00:00.000Z',
  },
  {
    // 应付已付
    id: 'b4', propertyId: 'p2', landlordContractId: 'c2', amount: 4800,
    type: 'rent', status: 'paid', direction: 'payable', dueDate: '2026-06-01', paidDate: '2026-06-01',
    description: '第3年 年租 2026-06-01 ~ 2027-05-31', periodStart: '2026-06-01', periodEnd: '2027-05-31',
    createdAt: '2026-05-25T02:00:00.000Z',
  },
]

const PROFIT_RECORDS: ProfitRecord[] = [
  {
    id: 'pr1', propertyId: 'p1', cycleStart: '2026-01-10', cycleEnd: '2026-04-09',
    tenantIncome: 5200, landlordExpense: 1560, profitAmount: 3640, status: 'available',
    extractedAt: '2026-04-10', isManual: true, remark: '第一期', createdAt: '2026-04-10T02:00:00.000Z',
  },
  {
    id: 'pr2', propertyId: 'p2', cycleStart: '2026-06-01', cycleEnd: '2027-05-31',
    tenantIncome: 9900, landlordExpense: 4800, profitAmount: 5100, status: 'withdrawn',
    extractedAt: '2027-06-02', withdrawnAt: '2027-06-03', remark: '-1200 维修扣款',
    createdAt: '2027-06-02T02:00:00.000Z',
  },
]

function fixture(): ExportData {
  return {
    properties: PROPERTIES,
    rooms: ROOMS,
    landlordContracts: CONTRACTS,
    tenants: TENANTS,
    bills: BILLS,
    profitRecords: PROFIT_RECORDS,
  }
}

// ───────────────────── 走 app 的真实导出/导入路径 ─────────────────────

/** 导出路径：与 More.tsx handleExportExcel 相同（列定义 + aoa 组装 + XLSX.write） */
function exportWorkbook(data: ExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const name of SHEET_NAMES) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetToAoa(name, buildSheetRows(name, data))), name)
  }
  return wb
}

/** 导出为真实 xlsx 二进制 */
function exportBytes(data: ExportData): Uint8Array {
  return new Uint8Array(XLSX.write(exportWorkbook(data), { bookType: 'xlsx', type: 'array' }))
}

/** 导入路径：与 More.tsx handleImportExcel 相同（XLSX.read → parseSheetRows → postProcessRows） */
function importBytes(bytes: Uint8Array): ExportData & { [k: string]: unknown } {
  const wb = XLSX.read(bytes, { type: 'array' })
  const read = (name: SheetName): Record<string, unknown>[] => {
    const sheet = wb.Sheets[name]
    if (!sheet) return []
    return parseSheetRows(XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[], name)
  }
  return {
    properties: read('房源') as unknown as Property[],
    rooms: read('房间') as unknown as Room[],
    landlordContracts: postProcessRows('代理合同', read('代理合同')) as unknown as LandlordContract[],
    tenants: postProcessRows('租客', read('租客')) as unknown as Tenant[],
    bills: postProcessRows('账单', read('账单')) as unknown as Bill[],
    profitRecords: postProcessRows('利润提取', read('利润提取')) as unknown as ProfitRecord[],
  }
}

function roundTrip(data: ExportData = fixture()) {
  return importBytes(exportBytes(data))
}

/** 导入侧的全部校验（与 More.tsx 的 validateSheet + 账单引用检查一致），返回错误文案 */
function collectImportErrors(data: ExportData): { errors: string[]; skippedBillRefs: string[] } {
  const errors: string[] = []
  const skippedBillRefs: string[] = []
  const rowsBySheet: Partial<Record<SheetName, Record<string, unknown>[]>> = {
    房源: data.properties as unknown as Record<string, unknown>[],
    房间: data.rooms as unknown as Record<string, unknown>[],
    代理合同: data.landlordContracts as unknown as Record<string, unknown>[],
    租客: data.tenants as unknown as Record<string, unknown>[],
    利润提取: data.profitRecords as unknown as Record<string, unknown>[],
  }
  for (const [sheet, rows] of Object.entries(rowsBySheet) as [SheetName, Record<string, unknown>[]][]) {
    const dup = findDuplicateIds(sheet, rows)
    errors.push(...dup.errors)
    rows.forEach((row, i) => {
      if (!dup.ok[i]) return
      errors.push(...validateImportRow(sheet, row, i))
    })
  }

  const bills = data.bills as unknown as Record<string, unknown>[]
  const billDup = findDuplicateIds('账单', bills)
  errors.push(...billDup.errors)
  const tenantIds = new Set((rowsBySheet.租客 ?? []).map(t => String(t.id)))
  const roomIds = new Set((rowsBySheet.房间 ?? []).map(r => String(r.id)))
  const contractIds = new Set((rowsBySheet.代理合同 ?? []).map(c => String(c.id)))
  bills.forEach((row, i) => {
    if (!billDup.ok[i]) return
    errors.push(...validateImportRow('账单', row, i))
    const missing = findMissingRefs(row, tenantIds, roomIds, contractIds)
    if (missing.length > 0) skippedBillRefs.push(`[账单 第${i + 1}行] ${missing.join('；')}`)
  })
  return { errors, skippedBillRefs }
}

/**
 * 把某张表的第一行数据里某一列改成指定原始值，再写盘/读回/解析/校验。
 * 模拟「用户手工改了 Excel 里某个单元格」的真实路径（会经过 normalizeExcelDate）。
 */
function parseWithCellValue(
  sheet: SheetName,
  header: string,
  value: unknown,
): { row: Record<string, unknown>; errors: string[] }[] {
  const aoa = sheetToAoa(sheet, buildSheetRows(sheet, fixture()))
  const col = (aoa[0] as string[]).indexOf(header)
  if (col < 0) throw new Error(`表头不存在：${sheet} / ${header}`)
  aoa[1][col] = value

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet)
  const read = XLSX.read(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })), { type: 'array' })
  const rows = postProcessRows(sheet, parseSheetRows(XLSX.utils.sheet_to_json(read.Sheets[sheet]) as Record<string, unknown>[], sheet))
  return rows.map((row, i) => ({ row, errors: validateImportRow(sheet, row, i) }))
}

// ───────────────────────── 1. 往返无损 ─────────────────────────

describe('导出 → 导入 往返无损', () => {
  it('六张表的行数都等于实体个数', () => {
    const back = roundTrip()
    expect(back.properties).toHaveLength(PROPERTIES.length)
    expect(back.rooms).toHaveLength(ROOMS.length)
    expect(back.landlordContracts).toHaveLength(CONTRACTS.length)
    expect(back.tenants).toHaveLength(TENANTS.length)
    expect(back.bills).toHaveLength(BILLS.length)
    expect(back.profitRecords).toHaveLength(PROFIT_RECORDS.length)
  })

  it('房源 / 房间 字段无损', () => {
    const back = roundTrip()
    expect(back.properties).toEqual([
      { id: 'p1', address: '北京市朝阳区示例路1号院2单元301', houseType: '两室一厅', area: 78.5, description: '整租给二房东', createdAt: '2026-01-05T02:00:00.000Z' },
      { id: 'p2', address: '北京市海淀区样例街9号', houseType: '三居', area: 112, createdAt: '2026-02-11T02:00:00.000Z' },
    ])
    expect(back.rooms).toEqual([
      { id: 'r1', propertyId: 'p1', label: 'A', roomType: '主卧', status: 'occupied', createdAt: '2026-01-05T02:00:00.000Z' },
      { id: 'r2', propertyId: 'p1', label: 'B', roomType: '次卧', status: 'vacant', createdAt: '2026-01-05T02:00:00.000Z' },
    ])
  })

  it('代理合同 字段无损（含免租期：数组 → 逗号串 → 数组；单值 → 数字）', () => {
    const back = roundTrip()
    expect(back.landlordContracts).toEqual([
      {
        id: 'c1', displayId: 'DL-0001', propertyId: 'p1', landlordName: '张三', landlordPhone: '13800138000',
        monthlyRent: 5200, paymentMethod: 'quarterly', deposit: 5200, vacancyAllowance: [30, 15],
        contractStart: '2026-01-10', contractEnd: '2029-01-09', status: 'active', createdAt: '2026-01-05T02:00:00.000Z',
      },
      {
        // deposit 0 经导入被规范化为 undefined（与数据模型一致，既有行为）
        id: 'c2', displayId: 'DL-0002', propertyId: 'p2', landlordName: '赵六',
        monthlyRent: 4800, paymentMethod: 'annual', vacancyAllowance: 30, contractStart: '2024-06-01',
        contractEnd: '2027-05-31', status: 'ended', endReason: 'renew', previousContractId: 'c0',
        createdAt: '2024-05-20T02:00:00.000Z',
      },
    ])
  })

  it('租客 字段无损，免租开始 / 免租结束 两列原样保留', () => {
    const back = roundTrip()
    const t1 = back.tenants[0] as unknown as Record<string, unknown>
    expect(t1.vacancyStart).toBe('2026-01-15')
    expect(t1.vacancyEnd).toBe('2026-02-03')
    // 无免租的租客往返后仍是 undefined（不能变成 '' 或 0，否则业务侧会误判「有免租」）
    expect(back.tenants[1].vacancyStart).toBeUndefined()
    expect(back.tenants[1].vacancyEnd).toBeUndefined()

    expect(back.tenants).toEqual([
      {
        id: 't1', displayId: 'ZL-0001', name: '李四', phone: '13900139000', roomId: 'r1',
        contractStart: '2026-01-15', contractEnd: '2027-01-14', monthlyRent: 2600, paymentMethod: 'monthly',
        advanceDays: 5, billSplit: 'front', deposit: 2600, otherFeeName: '网费', otherFeeAmount: 50,
        vacancyStart: '2026-01-15', vacancyEnd: '2026-02-03',
        status: 'active', createdAt: '2026-01-10T02:00:00.000Z',
      },
      {
        id: 't2', displayId: 'ZL-0002', name: '王五', phone: '13700137000', roomId: 'r2',
        contractStart: '2025-03-01', contractEnd: '2026-02-28', monthlyRent: 2100, paymentMethod: 'semi-annual',
        advanceDays: 0, deposit: 2100, effectiveEnd: '2026-02-20', status: 'ended', endReason: 'checkout',
        previousTenantId: 't0',
        pendingBills: [{
          id: 'pb1', amount: 2100, type: 'rent', status: 'pending', direction: 'receivable',
          dueDate: '2026-03-01', description: '第12期 月租 2026-02-01 ~ 2026-02-28',
          createdAt: '2026-02-01T02:00:00.000Z',
        }],
        createdAt: '2025-02-25T02:00:00.000Z',
      },
      {
        id: 't3', displayId: 'ZL-0003', name: '钱七', phone: '13600136000', roomId: 'r1',
        contractStart: '2027-01-15', contractEnd: '2028-01-14', monthlyRent: 2700, paymentMethod: 'monthly',
        advanceDays: 5, deposit: 2700, otherFeeName: '物业费', status: 'active', previousTenantId: 't1',
        createdAt: '2027-01-10T02:00:00.000Z',
      },
    ])
  })

  it('账单 字段无损：收款日/付款日、实收日/实付日 按方向分流后正确合并回 dueDate/paidDate', () => {
    const back = roundTrip()
    // 导出会对账单排序（应收在前、同方向按房源聚合、再按应收日升序），往返后顺序即导出顺序
    expect(back.bills.map(b => b.id)).toEqual(['b1', 'b3', 'b2', 'b4'])
    expect(back.bills).toEqual([
      {
        id: 'b1', propertyId: 'p1', roomId: 'r1', tenantId: 't1', amount: 2600, paidAmount: 1300,
        type: 'rent', status: 'paid', direction: 'receivable', dueDate: '2026-02-05', paidDate: '2026-02-03',
        description: '第1期 月租 2026-01-15 ~ 2026-02-13', periodStart: '2026-01-15', periodEnd: '2026-02-13',
        createdAt: '2026-01-10T02:00:00.000Z',
      },
      {
        id: 'b3', propertyId: 'p1', roomId: 'r2', tenantId: 't2', amount: -2100, type: 'deposit',
        status: 'refunded', direction: 'receivable', dueDate: '2026-02-20', paidDate: '2026-02-20',
        description: '退押金', createdAt: '2026-02-20T02:00:00.000Z',
      },
      {
        id: 'b2', propertyId: 'p1', landlordContractId: 'c1', amount: 1560,
        type: 'rent', status: 'pending', direction: 'payable', dueDate: '2026-02-10',
        // ⚠️ 既有行为：缺失的 paidDate 经「实收日/实付日」合并步骤后落成空字符串（不是 undefined）。
        // 空串在真值判断上与 undefined 等价，故不影响业务；但字段存在性有差异，这里如实锁定。
        paidDate: '',
        description: '第1期 季租 2026-01-10 ~ 2026-04-09', periodStart: '2026-01-10', periodEnd: '2026-04-09',
        createdAt: '2026-01-05T02:00:00.000Z',
      },
      {
        id: 'b4', propertyId: 'p2', landlordContractId: 'c2', amount: 4800,
        type: 'rent', status: 'paid', direction: 'payable', dueDate: '2026-06-01', paidDate: '2026-06-01',
        description: '第3年 年租 2026-06-01 ~ 2027-05-31', periodStart: '2026-06-01', periodEnd: '2027-05-31',
        createdAt: '2026-05-25T02:00:00.000Z',
      },
    ])
  })

  it('利润提取 字段无损（含负数备注、手动标记）', () => {
    const back = roundTrip()
    expect(back.profitRecords).toEqual([
      {
        id: 'pr1', propertyId: 'p1', cycleStart: '2026-01-10', cycleEnd: '2026-04-09',
        tenantIncome: 5200, landlordExpense: 1560, profitAmount: 3640, status: 'available',
        extractedAt: '2026-04-10', isManual: true, remark: '第一期', createdAt: '2026-04-10T02:00:00.000Z',
      },
      {
        id: 'pr2', propertyId: 'p2', cycleStart: '2026-06-01', cycleEnd: '2027-05-31',
        tenantIncome: 9900, landlordExpense: 4800, profitAmount: 5100, status: 'withdrawn',
        extractedAt: '2027-06-02', withdrawnAt: '2027-06-03', remark: '-1200 维修扣款',
        createdAt: '2027-06-02T02:00:00.000Z',
      },
    ])
  })

  it('往返回来的数据全部通过导入校验，且没有账单被引用完整性跳过', () => {
    const back = roundTrip()
    const { errors, skippedBillRefs } = collectImportErrors(back)
    expect(errors).toEqual([])
    expect(skippedBillRefs).toEqual([])
  })
})

// ───────────────────────── 2. 列对称性 ─────────────────────────

describe('导出/导入 列对称性', () => {
  it('导出产生的每个表头，导入都认得', () => {
    for (const sheet of SHEET_NAMES) {
      const importable = new Set(Object.keys(importHeaders(sheet)))
      for (const label of Object.values(exportHeaders(sheet))) {
        expect(importable.has(label), `${sheet} 的导出列「${label}」导入不认（导入会静默丢这列）`).toBe(true)
      }
    }
  })

  it('导入认得的每个表头，除登记的历史列外都能被导出产出', () => {
    // 仅导入、不导出的历史列：旧备份用过的「到期日」，以及「期间描述」的旧别名「描述」
    const IMPORT_ONLY: Partial<Record<SheetName, string[]>> = { 账单: ['到期日', '描述'] }
    for (const sheet of SHEET_NAMES) {
      const exported = new Set(Object.values(exportHeaders(sheet)))
      for (const label of Object.keys(importHeaders(sheet))) {
        if ((IMPORT_ONLY[sheet] ?? []).includes(label)) continue
        expect(exported.has(label), `${sheet} 的导入表头「${label}」导出不产出（导出会少这列）`).toBe(true)
      }
    }
  })

  it('同一张表内导出表头不重复（旧实现按表头反查字段，重复会串列）', () => {
    for (const sheet of SHEET_NAMES) {
      const labels = exportColumns(sheet).map(c => c.label)
      expect(new Set(labels).size, `${sheet} 存在重复表头`).toBe(labels.length)
    }
  })
})

// ───────────── 3. 免租期两列的格式校验（2026-09-14 补的 checkDate） ─────────────

describe('免租开始 / 免租结束 的格式校验', () => {
  it('合法 YYYY-MM-DD：通过（往返本身就覆盖了这条）', () => {
    const { errors, skippedBillRefs } = collectImportErrors(roundTrip())
    expect(errors).toEqual([])
    expect(skippedBillRefs).toEqual([])
  })

  it('两列为空 / 整个租客表没有这两列：不报错（无免租是正常业务）', () => {
    // T2/T3 没有免租期；aoa 里该单元格为空 → 导入侧为 undefined → 不校验
    const rows = parseWithCellValue('租客', '姓名', '李四')
    expect(rows[1].row.vacancyStart).toBeUndefined()
    expect(rows[1].errors).toEqual([])
    expect(rows[2].row.vacancyStart).toBeUndefined()
    expect(rows[2].errors).toEqual([])
  })

  it('斜杠/带前导零格式经归一化后被接受（不是报错，而是转成 YYYY-MM-DD）', () => {
    const start = parseWithCellValue('租客', '免租开始', '2026/1/5')
    expect(start[0].row.vacancyStart).toBe('2026-01-05')
    expect(start[0].errors).toEqual([])

    const end = parseWithCellValue('租客', '免租结束', '2026/2/3')
    expect(end[0].row.vacancyEnd).toBe('2026-02-03')
    expect(end[0].errors).toEqual([])
  })

  it('Excel 日期序列号被转换为 YYYY-MM-DD 后接受', () => {
    const r = parseWithCellValue('租客', '免租开始', 46244)
    expect(r[0].row.vacancyStart).toBe('2026-08-10')
    expect(r[0].errors).toEqual([])
  })

  it('无法识别的畸形值：免租开始 报错', () => {
    const r = parseWithCellValue('租客', '免租开始', '待定')
    expect(r[0].errors).toEqual(['[租客 第1行] 免租开始 格式必须为 YYYY-MM-DD'])
  })

  it('无法识别的畸形值：免租结束 报错', () => {
    const r = parseWithCellValue('租客', '免租结束', '2026.2.3.4')
    expect(r[0].errors).toEqual(['[租客 第1行] 免租结束 格式必须为 YYYY-MM-DD'])
  })

  it('同一个月两次报错（两列都畸形时各报一条）', () => {
    const aoa = sheetToAoa('租客', buildSheetRows('租客', fixture()))
    const labels = aoa[0] as string[]
    aoa[1][labels.indexOf('免租开始')] = 'x'
    aoa[1][labels.indexOf('免租结束')] = 'y'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '租客')
    const read = XLSX.read(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })), { type: 'array' })
    const rows = postProcessRows('租客', parseSheetRows(XLSX.utils.sheet_to_json(read.Sheets['租客']) as Record<string, unknown>[], '租客'))
    expect(validateImportRow('租客', rows[0], 0)).toEqual([
      '[租客 第1行] 免租开始 格式必须为 YYYY-MM-DD',
      '[租客 第1行] 免租结束 格式必须为 YYYY-MM-DD',
    ])
  })

  it('已知：checkDate 只校验「形状」，不校验日历有效性（2026-13-45 会被接受，不是漏检）', () => {
    const r = parseWithCellValue('租客', '免租开始', '2026-13-45')
    expect(r[0].row.vacancyStart).toBe('2026-13-45')
    expect(r[0].errors).toEqual([])
  })

  it('别名列（描述）仍按 description 导入', () => {
    const aoa: unknown[][] = [
      ['ID', '金额', '类型', '状态', '方向', '到期日', '描述'],
      ['b9', 100, 'rent', 'pending', 'receivable', '2026-05-01', '第1期 月租 2026-04-01 ~ 2026-04-30'],
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '账单')
    const read = XLSX.read(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })), { type: 'array' })
    const rows = postProcessRows('账单', parseSheetRows(XLSX.utils.sheet_to_json(read.Sheets['账单']) as Record<string, unknown>[], '账单'))
    expect(rows[0].dueDate).toBe('2026-05-01')
    expect(rows[0].description).toBe('第1期 月租 2026-04-01 ~ 2026-04-30')
    expect(validateImportRow('账单', rows[0], 0)).toEqual([])
  })
})

// ───────────────────────── 4. 旧备份兼容 ─────────────────────────

describe('旧备份兼容（v1.293 之前的导出没有免租两列）', () => {
  it('删掉免租开始/免租结束两列后导入：照常通过，免租字段为 undefined', () => {
    const aoa = sheetToAoa('租客', buildSheetRows('租客', fixture()))
    const labels = aoa[0] as string[]
    const drop = new Set([labels.indexOf('免租开始'), labels.indexOf('免租结束')])
    const legacy = aoa.map(row => row.filter((_, i) => !drop.has(i)))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(legacy), '租客')
    const read = XLSX.read(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })), { type: 'array' })
    const rows = postProcessRows('租客', parseSheetRows(XLSX.utils.sheet_to_json(read.Sheets['租客']) as Record<string, unknown>[], '租客'))

    expect(rows).toHaveLength(TENANTS.length)
    for (const [i, row] of rows.entries()) {
      expect('vacancyStart' in row, `第${i + 1}行不应有 vacancyStart`).toBe(false)
      expect('vacancyEnd' in row, `第${i + 1}行不应有 vacancyEnd`).toBe(false)
      expect(validateImportRow('租客', row, i)).toEqual([])
    }
  })

  it('缺整张 sheet 时不崩（返回空数组，交由「文件可识别性检查」拦截）', () => {
    const wb = exportWorkbook(fixture())
    delete wb.Sheets['利润提取']
    const read = (name: SheetName) => {
      const sheet = wb.Sheets[name]
      return sheet ? parseSheetRows(XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[], name) : []
    }
    expect(read('利润提取')).toEqual([])
    expect(read('租客')).toHaveLength(TENANTS.length)
  })
})

// ───────────────────────── 5. 归一化与描述的边界 ─────────────────────────

describe('normalizeExcelDate / extractPeriod', () => {
  it('空值 → 空串（由调用方决定置 undefined）', () => {
    expect(normalizeExcelDate(undefined)).toBe('')
    expect(normalizeExcelDate(null)).toBe('')
    expect(normalizeExcelDate('')).toBe('')
  })

  it('已是 YYYY-MM-DD 原样保留；斜杠/点号补齐两位', () => {
    expect(normalizeExcelDate('2026-08-05')).toBe('2026-08-05')
    expect(normalizeExcelDate('2026/8/5')).toBe('2026-08-05')
    expect(normalizeExcelDate('2026.8.5')).toBe('2026-08-05')
  })

  it('序列号下限保护：小于 2000-01-01 的纯数字不走序列号分支', () => {
    // 36526 = 2000-01-01，下限当天正常转换
    expect(normalizeExcelDate(36526)).toBe('2000-01-01')
    // 36525 落进 Date 兜底解析 → 5 位年份，形状不合规，会被 checkDate 拦下（不是静默通过）
    expect(normalizeExcelDate(36525)).toBe('36525-01-01')
    // ⚠️ 已知：纯年份数字（2026）虽不走序列号分支，但 Date 兜底会解析成 2026-01-01 且形状合规，
    // 所以「免租开始」格里只填年份会被当成年初 —— 既有行为，本次不改
    expect(normalizeExcelDate(2026)).toBe('2026-01-01')
  })

  it('无法识别的值原样返回（由 checkDate 兜底拦截）', () => {
    expect(normalizeExcelDate('待定')).toBe('待定')
    expect(normalizeExcelDate('2026.2.3.4')).toBe('2026.2.3.4')
  })

  it('extractPeriod 从描述里抽出起止日，无区间则两个空串', () => {
    expect(extractPeriod('第1期 月租 2026-01-15 ~ 2026-02-13')).toEqual({ startDate: '2026-01-15', endDate: '2026-02-13' })
    expect(extractPeriod('退押金')).toEqual({ startDate: '', endDate: '' })
    expect(extractPeriod(undefined)).toEqual({ startDate: '', endDate: '' })
  })
})

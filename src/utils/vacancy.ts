import { Tenant, Room, LandlordContract } from '../types'
import { todayLocal } from '../lib/utils'

/**
 * 空置天数统计工具
 *
 * 设计约定（2026-08-01 用户确认）：
 * - 统计起点：该房源最早的业主合同 contractStart（业主起租时间）
 * - 占用区间为闭区间 [contractStart, 结束日]：结束日当天仍算占用
 * - 续约合同（endReason='renew'）占用到 contractEnd，与续约合同 contractStart 连续 → 不产生空置
 * - 退租租客（endReason='checkout'）占用到 effectiveEnd（退租日当天仍占用），次日开始空置
 * - 统计范围按年份：该年 1月1日 ~ 该年12月31日（当年截止今天）
 */

/** 自然日天数差（含两端），b >= a 时为正 */
export function dayDiffInclusive(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const da = Date.UTC(ay, am - 1, ad)
  const db = Date.UTC(by, bm - 1, bd)
  return Math.round((db - da) / 86400000) + 1
}

export interface RoomVacancy {
  roomId: string
  roomLabel: string
  roomType: string
  /** 所选年份内空置天数 */
  vacancyDays: number
  /** 所选年份内可出租天数（统计起点/年首 ~ 年末/今天） */
  availableDays: number
  /** 空置率 0~1 */
  vacancyRate: number
}

export interface PropertyVacancy {
  propertyId: string
  propertyAddress: string
  /** 统计起点（最早业主合同起租日） */
  startDate: string
  /** 该房源所选年份内累计空置天数 */
  totalVacancyDays: number
  /** 该房源所选年份内累计可出租天数（所有房间之和） */
  totalAvailableDays: number
  /** 空置率 0~1 */
  vacancyRate: number
  rooms: RoomVacancy[]
}

/**
 * 计算某个房源在指定年份内的空置统计。
 * 房源无业主合同时返回 null。
 */
export function calculatePropertyVacancy(
  propertyId: string,
  address: string,
  year: number,
  propertyRooms: Room[],
  propertyTenants: Tenant[],
  landlordContracts: LandlordContract[],
): PropertyVacancy | null {
  // 1. 统计起点 = 最早业主合同起租日
  const contracts = landlordContracts
    .filter(c => c.propertyId === propertyId)
    .sort((a, b) => a.contractStart.localeCompare(b.contractStart))
  if (contracts.length === 0) return null
  const startDate = contracts[0].contractStart

  const currentYear = new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEndRaw = `${year}-12-31`
  // 当年截止今天，未来年份不统计
  const yearEnd = year === currentYear ? todayLocal() : yearEndRaw

  // 2. 统计范围 [rangeStart, rangeEnd]，与年首/年末裁剪
  const rangeStart = startDate > yearStart ? startDate : yearStart
  const rangeEnd = yearEnd
  const rangeValid = year <= currentYear && rangeStart <= rangeEnd

  const roomResults: RoomVacancy[] = []

  for (const room of propertyRooms) {
    const roomTenants = propertyTenants.filter(t => t.roomId === room.id)

    // 3. 收集占用区间（闭区间），合并重叠/连续区间
    const intervals: [string, string][] = roomTenants
      .map(t => {
        // 结束日：在租→合同结束日；已退租→退租日（退租日当天仍占用）；续约被替代→合同结束日
        let end = t.contractEnd
        if (t.status === 'ended' && t.endReason === 'checkout') {
          end = t.effectiveEnd || t.contractEnd
        }
        return [t.contractStart, end] as [string, string]
      })
      .sort((a, b) => a[0].localeCompare(b[0]))

    const merged: [string, string][] = []
    for (const iv of intervals) {
      const last = merged[merged.length - 1]
      if (!last || iv[0] > last[1]) {
        merged.push([...iv])
      } else if (iv[1] > last[1]) {
        last[1] = iv[1]
      }
    }

    // 4. 统计范围内占用天数
    let occupiedDays = 0
    if (rangeValid) {
      for (const [s, e] of merged) {
        const cs = s > rangeStart ? s : rangeStart
        const ce = e < rangeEnd ? e : rangeEnd
        if (cs <= ce) occupiedDays += dayDiffInclusive(cs, ce)
      }
    }

    // 5. 空置天数 = 可出租天数 - 占用天数
    const availableDays = rangeValid ? dayDiffInclusive(rangeStart, rangeEnd) : 0
    const vacancyDays = Math.max(0, availableDays - occupiedDays)

    roomResults.push({
      roomId: room.id,
      roomLabel: room.label,
      roomType: room.roomType,
      vacancyDays,
      availableDays,
      vacancyRate: availableDays > 0 ? vacancyDays / availableDays : 0,
    })
  }

  // 按空置天数降序（空置最多的排前面）
  roomResults.sort((a, b) => b.vacancyDays - a.vacancyDays)

  const totalVacancyDays = roomResults.reduce((s, r) => s + r.vacancyDays, 0)
  const totalAvailableDays = roomResults.reduce((s, r) => s + r.availableDays, 0)

  return {
    propertyId,
    propertyAddress: address,
    startDate,
    totalVacancyDays,
    totalAvailableDays,
    vacancyRate: totalAvailableDays > 0 ? totalVacancyDays / totalAvailableDays : 0,
    rooms: roomResults,
  }
}

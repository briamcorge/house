import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { pinyin } from 'pinyin-pro'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(amount: number): string {
  const [int, dec] = amount.toFixed(2).split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec
}

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免 UTC 时区偏移） */
export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 本地日期加减 N 天后 YYYY-MM-DD */
export function daysFromTodayLocal(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return formatDateLocal(d)
}

/** Date 对象转本地日期 YYYY-MM-DD */
export function formatDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 房间编号显示：整租不带"室"后缀，其余显示 "A室" 等 */
export function formatRoomLabel(label?: string): string {
  if (!label) return ''
  return label === '整租' ? '整租' : `${label}室`
}

/** 拼音匹配辅助：返回字符串的全拼 + 首字母（小写、无空格），用于模糊搜索 */
export function pinyinKeys(s: string): string {
  const full = pinyin(s, { toneType: 'none', type: 'array' }).join('').toLowerCase()
  const initials = pinyin(s, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase()
  return `${full} ${initials}`
}

/** 判断查询词 q（已小写）是否匹配文本（支持中文子串/全拼/首字母） */
export function matchText(text: string, q: string): boolean {
  const t = text.toLowerCase()
  return t.includes(q) || pinyinKeys(text).includes(q)
}

/** 拼音排序键：返回全拼小写，用于列表排序 */
export function pinyinSortKey(s: string): string {
  return pinyin(s, { toneType: 'none', type: 'array' }).join('').toLowerCase()
}

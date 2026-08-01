import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
  return todayLocal()
}

/** Date 对象转本地日期 YYYY-MM-DD */
export function formatDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

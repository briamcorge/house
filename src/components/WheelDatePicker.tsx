import { useEffect, useMemo, useRef, useState } from 'react'

interface WheelDatePickerProps {
  value?: string // 受控：YYYY-MM-DD
  defaultValue?: string // 非受控
  onChange?: (value: string) => void
  min?: string // YYYY-MM-DD，限制可选年份范围
  max?: string // YYYY-MM-DD
  title?: string // 弹窗标题，默认「选择日期」
  className?: string // 应用到触发按钮
  disabled?: boolean
  [key: string]: unknown // 其余属性透传到触发按钮
}

const ITEM_HEIGHT = 44 // 单个选项高度 h-11 = 44px

function daysInMonth(year: number, month: number): number {
  // month 为 1-12，JS Date 月份 0 基，传 0 即上月最后一天
  return new Date(year, month, 0).getDate()
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDate(value: string | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

interface WheelColumnProps {
  items: string[]
  index: number
  onSelect: (index: number) => void
}

function WheelColumn({ items, index, onSelect }: WheelColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const lastEmittedRef = useRef(index)

  useEffect(() => {
    const el = columnRef.current
    if (!el) return
    if (!mountedRef.current) {
      // 挂载（打开弹窗）时定位到当前选中项
      mountedRef.current = true
      el.scrollTo({ top: index * ITEM_HEIGHT })
      return
    }
    // 仅当 index 是被动外部变化（如切换月份后日期被 clamp）时校正位置；
    // 本列自身拖动引起的 index 变化不做 scrollTo，避免与手指滚动打架导致不跟手
    if (index !== lastEmittedRef.current) {
      el.scrollTo({ top: index * ITEM_HEIGHT })
    }
  }, [index])

  return (
    <div className="relative flex-1">
      <div
        ref={columnRef}
        className="h-[132px] overflow-y-auto py-[44px] no-scrollbar snap-y snap-mandatory"
        onScroll={(e) => {
          const el = e.currentTarget
          const idx = Math.round(el.scrollTop / ITEM_HEIGHT)
          if (idx !== lastEmittedRef.current) {
            lastEmittedRef.current = idx
            onSelect(idx)
          }
        }}
      >
        {items.map((item, i) => (
          <div
            key={item}
            className={`flex h-11 snap-center items-center justify-center text-[15px] ${
              i === index ? 'font-semibold text-gray-900' : 'text-gray-400'
            }`}
          >
            {item}
          </div>
        ))}
      </div>
      {/* 选中行下方指示线（静态，与参考图一致） */}
      <div className="pointer-events-none absolute left-1/2 top-[88px] h-px w-[72%] -translate-x-1/2 bg-gray-300" />
    </div>
  )
}

export default function WheelDatePicker({
  value,
  defaultValue,
  onChange,
  min,
  max,
  title = '选择日期',
  className,
  disabled,
  ...rest
}: WheelDatePickerProps) {
  const [open, setOpen] = useState(false)
  const [internal, setInternal] = useState(defaultValue ?? '')

  const minYear = min ? Number(min.slice(0, 4)) : 2010
  const maxYear = max ? Number(max.slice(0, 4)) : 2050

  const years = useMemo(() => {
    const list: string[] = []
    for (let y = minYear; y <= maxYear; y++) list.push(String(y))
    return list
  }, [minYear, maxYear])

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1)), [])

  const [selYear, setSelYear] = useState(() => new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(() => new Date().getMonth() + 1)
  const [selDay, setSelDay] = useState(() => new Date().getDate())

  const days = useMemo(
    () => Array.from({ length: daysInMonth(selYear, selMonth) }, (_, i) => String(i + 1)),
    [selYear, selMonth]
  )

  function openPicker() {
    const parsed = parseDate(value ?? internal)
    const now = new Date()
    let year = parsed ? parsed.year : now.getFullYear()
    let month = parsed ? parsed.month : now.getMonth() + 1
    let day = parsed ? parsed.day : now.getDate()

    if (year < minYear) year = minYear
    if (year > maxYear) year = maxYear
    if (day > daysInMonth(year, month)) day = daysInMonth(year, month)

    setSelYear(year)
    setSelMonth(month)
    setSelDay(day)
    setOpen(true)
  }

  function handleYearSelect(index: number) {
    const year = minYear + index
    if (year === selYear) return
    setSelYear(year)
    setSelDay(Math.min(selDay, daysInMonth(year, selMonth)))
  }

  function handleMonthSelect(index: number) {
    const month = index + 1
    if (month === selMonth) return
    setSelMonth(month)
    setSelDay(Math.min(selDay, daysInMonth(selYear, month)))
  }

  function handleDaySelect(index: number) {
    setSelDay(index + 1)
  }

  function handleConfirm() {
    const result = formatDate(selYear, selMonth, selDay)
    onChange?.(result)
    if (value === undefined) setInternal(result)
    setOpen(false)
  }

  function handleCancel() {
    setOpen(false)
  }

  const displayValue = value !== undefined ? value : internal

  return (
    <>
      <button
        type="button"
        {...rest}
        className={`${className ?? ''} text-left`.trim()}
        disabled={disabled}
        onClick={openPicker}
      >
        {displayValue ? displayValue : <span className="text-gray-400">选择日期</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />
          <div className="relative w-full max-w-xs overflow-hidden rounded-2xl bg-white">
            <div className="pb-1 pt-4 text-center text-[16px] font-medium text-gray-900">{title}</div>
            <div className="flex px-4 py-2">
              <WheelColumn items={years} index={selYear - minYear} onSelect={handleYearSelect} />
              <WheelColumn items={months} index={selMonth - 1} onSelect={handleMonthSelect} />
              <WheelColumn items={days} index={selDay - 1} onSelect={handleDaySelect} />
            </div>
            <div className="mt-1 flex border-t border-gray-200">
              <button
                type="button"
                className="flex-1 border-r border-gray-200 py-3 text-[15px] text-blue-600"
                onClick={handleCancel}
              >
                取消
              </button>
              <button
                type="button"
                className="flex-1 py-3 text-[15px] font-medium text-blue-600"
                onClick={handleConfirm}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

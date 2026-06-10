import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(amount: number): string {
  const [int, dec] = amount.toFixed(2).split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec
}

import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

/**
 * 收款/付款成功的触感反馈（2026-11-24）。
 * 仅原生 App 生效：网页版/电脑端直接返回，不会震动。
 * 设备不支持或系统关闭触感时静默忽略，绝不影响业务结果。
 */
export async function vibratePaymentSuccess(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch {
    /* 触感不可用（旧机型/系统设置关闭）时忽略 */
  }
}

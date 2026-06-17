import { registerPlugin } from '@capacitor/core'

export interface AppUpdatePlugin {
  /**
   * Fetch version info from remote (native HTTP, no CORS).
   */
  checkVersion(): Promise<{ version: string; apkUrl: string; notes: string }>

  /**
   * Download APK from url to cache dir and launch system package installer.
   */
  downloadAndInstall(options: { url: string }): Promise<void>
}

export const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate')

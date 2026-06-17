import { registerPlugin } from '@capacitor/core'

export interface AppUpdatePlugin {
  /**
   * Download APK from url to cache dir and launch system package installer.
   */
  downloadAndInstall(options: { url: string }): Promise<void>
}

export const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate')

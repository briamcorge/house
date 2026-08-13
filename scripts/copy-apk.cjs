// release 流程最后一步：把生成的 APK 自动复制到桌面（房屋管理-v{version}.apk）
// 版本号从 src/version.ts 动态读取，与构建产物保持一致
const { readFileSync, copyFileSync, existsSync, statSync } = require('fs')
const path = require('path')
const os = require('os')

const root = path.resolve(__dirname, '..')

// 1. 读取版本号
const versionContent = readFileSync(path.join(root, 'src', 'version.ts'), 'utf-8')
const match = versionContent.match(/APP_VERSION\s*=\s*'([^']+)'/)
if (!match) {
  console.error('[copy-apk] ERROR: cannot parse APP_VERSION from src/version.ts')
  process.exit(1)
}
const version = match[1]

// 2. 定位 APK
const srcApk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!existsSync(srcApk)) {
  console.error(`[copy-apk] ERROR: APK not found: ${srcApk}`)
  console.error('[copy-apk] Please make sure assembleRelease finished successfully.')
  process.exit(1)
}

// 3. 复制到桌面
const desktop = path.join(os.homedir(), 'Desktop')
if (!existsSync(desktop)) {
  console.error(`[copy-apk] ERROR: Desktop directory not found: ${desktop}`)
  process.exit(1)
}
const destApk = path.join(desktop, `房屋管理-v${version}.apk`)
copyFileSync(srcApk, destApk)
const sizeMB = (statSync(destApk).size / 1024 / 1024).toFixed(2)
console.log(`[copy-apk] OK: copied to desktop -> ${destApk} (${sizeMB} MB)`)

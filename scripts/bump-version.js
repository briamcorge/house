// 构建前自动加版本号（仅本地构建时生效，CI 不重复加）
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

if (process.env.CI) process.exit(0)

const __dirname = dirname(fileURLToPath(import.meta.url))
const versionPath = resolve(__dirname, '../src/version.ts')

const content = readFileSync(versionPath, 'utf-8')
const match = content.match(/APP_VERSION\s*=\s*'(\d+)\.(\d+)'/)

if (!match) {
  console.error('❌ 无法解析 version.ts 中的版本号（期望格式 1.xx）')
  process.exit(1)
}

const major = parseInt(match[1])
const patch = parseInt(match[2]) + 1
const newVersion = `${major}.${patch}`

const newContent = content.replace(
  /(APP_VERSION\s*=\s*)'\d+\.\d+'/,
  `$1'${newVersion}'`
)

writeFileSync(versionPath, newContent, 'utf-8')
console.log(`🔖 版本号: ${match[0]} → ${newVersion}`)

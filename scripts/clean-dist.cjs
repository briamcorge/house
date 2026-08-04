// 清理 dist 目录 — 解决 Windows 上 fs.rmSync 对被占用文件静默失败导致旧构建产物残留的问题
const { rmSync, existsSync } = require('fs')
const { execFileSync } = require('child_process')
const { resolve } = require('path')

const dist = resolve(__dirname, '../dist')

try {
  rmSync(dist, { recursive: true, force: true })
} catch {
  // 某些 Windows 场景下 rmSync 会因文件占用而失败/静默无效，改用 cmd 的 rmdir
}

if (existsSync(dist)) {
  try {
    execFileSync('cmd', ['/c', 'rmdir', '/s', '/q', dist], { stdio: 'pipe' })
  } catch (e) {
    console.error('❌ 无法清理 dist 目录：', e.message)
    process.exit(1)
  }
}

if (existsSync(dist)) {
  console.error('❌ dist 目录清理失败，请手动删除后重试')
  process.exit(1)
}

console.log('🧹 dist 已清理')

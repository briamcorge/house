# ⚠️ 本文件含中文，必须保存为 UTF-8 with BOM：Windows PowerShell 对无 BOM 文件按 ANSI/GBK 解码，
#    中文末字节会被当成 GBK 前导字节而吞掉后续字符（换行、引号），导致「缺少 }」等假语法错误。
# 构建 Release APK 并复制到桌面
$ErrorActionPreference = "Stop"

# 环境变量
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21.0.6+7"
$env:ANDROID_HOME = "C:\Users\Administrator\AppData\Local\Android\Sdk"

# 1. 构建 Web（APK 需相对路径）
#    注意：npm run build 内部会执行 scripts/bump-version.js 把版本号 +1，
#    所以版本号必须在构建「之后」才读取——否则 APK 文件名会比包内真实版本慢一版。
$env:VITE_BASE = "./"
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

# 获取版本号（构建后读取，此时才是本次构建的真实版本）
$versionContent = Get-Content "src/version.ts" -Raw
if ($versionContent -match "APP_VERSION = '(\d+\.\d+)'") {
    $version = $Matches[1]
} else {
    Write-Host "无法获取版本号" -ForegroundColor Red
    exit 1
}

Write-Host "已构建 Web，版本 v$version，开始打 APK ..." -ForegroundColor Cyan

# 2. 同步 Capacitor
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit 1 }

# 3. 构建 Android APK
Set-Location android
./gradlew assembleRelease
if ($LASTEXITCODE -ne 0) { 
    Set-Location ..
    exit 1 
}
Set-Location ..

# 4. 复制到桌面
$apkSource = "android\app\build\outputs\apk\release\app-release.apk"
$apkDest = "C:\Users\Administrator\Desktop\house-v$version.apk"
Copy-Item $apkSource $apkDest -Force

Write-Host "`n✅ 构建完成！" -ForegroundColor Green
Write-Host "APK: $apkDest" -ForegroundColor Yellow

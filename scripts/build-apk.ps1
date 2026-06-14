# 构建 Release APK 并复制到桌面
$ErrorActionPreference = "Stop"

# 环境变量
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21.0.6+7"
$env:ANDROID_HOME = "C:\Users\Administrator\AppData\Local\Android\Sdk"

# 获取版本号
$versionContent = Get-Content "src/version.ts" -Raw
if ($versionContent -match "APP_VERSION = '(\d+\.\d+)'") {
    $version = $Matches[1]
} else {
    Write-Host "无法获取版本号" -ForegroundColor Red
    exit 1
}

Write-Host "构建 APK v$version ..." -ForegroundColor Cyan

# 1. 构建 Web（APK 需相对路径）
$env:VITE_BASE = "./"
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

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

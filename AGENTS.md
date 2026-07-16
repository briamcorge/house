# 房屋管理系统

最后更新: 2026-07-02

## 凭据 & API（非常重要，切勿丢失）

### 云端数据库 (Supabase)
- **URL**: `https://jvpkqqnfzkkcztkbzpdx.supabase.co`
- **Key**: 已硬编码在 `src/lib/supabase.ts` 第 7 行（`VITE_SUPABASE_ANON_KEY`）
- **说明**: 免费版，数据库 500MB + 文件存储 1GB + 带宽 2GB/月
- **登录**: 通过手机号+验证码登录（app 内 AuthModal）

### GitHub
- **仓库**: `https://github.com/briamcorge/house`
- **分支**: `master`
- **说明**: 用户已决定不再推送 GitHub，仅本地开发。如需恢复推送，记得先改 `vite.config.ts` 的 `base` 为 `'/house/'`

### Android 签名 (APK 打包必需)
- **keystore 路径**: `E:\新项目\house\android\app\house-management.keystore`
- **keyAlias**: `house-management`
- **storePassword**: `house123`
- **keyPassword**: `house123`
- **⚠️ 重要**: 签名文件丢失后无法覆盖安装已装过的 APK，务必保留

### 项目路径
- **本地**: `E:\新项目\house`
- **APK 输出**: 桌面 `房屋管理-v{version}.apk`
- **Android 项目**: `E:\新项目\house\android`

### AI 模型 API (OpenCode 配置)
**配置文件位置**: `C:\Users\Administrator\.config\opencode\opencode.json`

**千问 (Qwen DashScope)**
- **API Key**: `sk-a8e61fb313ed4aea90c51f2d0efae09b`
- **Base URL**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- **可用模型**:
  - `qwen-vl-plus` - 图像+文本，131k上下文
  - `qwen-vl-max` - 图像+文本，32k上下文
  - `qwen3.7-plus` - 图像+文本+视频，131k上下文

**DeepSeek**
- **API Key**: `sk-830751500a8c41d1899218e24fd87112`
- **Base URL**: `https://api.deepseek.com`
- **可用模型**:
  - `deepseek-v4-flash` - 快速推理

**Agnes AI (新加坡)**
- **API Key**: `sk-IOLRCmgKxdrJwWknzWERE6LG1c8ogFNXM4SEz98haHKpmfw0`
- **Base URL**: `https://apihub.agnes-ai.com/v1`
- **平台**: https://platform.agnes-ai.com
- **免费额度**: 无限期免费开放全模态API
- **可用模型**:
  - `agnes-2.0-flash` - 文本模型，100万Token上下文
  - `agnes-image-2.0-flash` - 图像模型
  - `agnes-video-2.0` - 视频模型

## 构建 & 发布命令

```bash
npm run dev          # 开发服务器 (http://localhost:5173/house/)
npm run build        # 构建 web (自动 bump 版本号 + --base=./ 适配 APK)
npm run release      # 全自动打包 APK: build → cap copy → assembleRelease (一步到位)
npx tsc --noEmit     # 类型检查
npm run check        # 同上
```

### 发版完整流程（后续会话参考）
```
1. git add -A && git commit -m "改了啥"                    # 本地存档（可选）
2. npm run release                                          # 自动 bump + build + cap copy + assemble
3. 更新 build.gradle 的 versionCode/versionName 与 version.ts 对齐
4. Copy APK 到桌面
```

### 之前踩过的坑（避免再犯）
1. ~~`VITE_BASE` 忘记设 `./` → 白屏~~ ✅ 已修复：`build` 默认 `--base=./`
2. ~~`npx cap copy` 忘记跑 → APK 里还是旧代码~~ ✅ 已修复：`release` 命令包含 cap copy
3. ~~`dist/assets/` 旧文件堆积 → APK 膨胀到 3.3MB~~ ⚠️ 仍需注意：build 前清理旧 assets
4. ~~build 多次导致版本号乱跳~~ ⚠️ 注意：`release` 也会 bump，避免不必要的 release

## 技术栈

React 18 + TypeScript 5.8 + Vite 6 + Tailwind CSS 3.4 + Zustand 5 + react-router-dom 7 + Recharts 3.8 + Lucide React + vite-plugin-pwa + Capacitor 8

## 运行命令

```bash
npm run dev       # 开发
npm run build     # 构建 (tsc + vite build)
npx tsc --noEmit  # 类型检查
```

## 项目结构

```
src/
├── pages/ (10个)
│   ├── Home.tsx          首页 — 统计卡片/月度图表/待办/流水/搜索
│   ├── Properties.tsx    房源列表 — 业主合同管理/收益汇总
│   ├── RoomList.tsx      房间列表 — 每层楼/单元的房间
│   ├── RoomDetail.tsx    房间详情 — 租客合同/账单/续约/退租
│   ├── Tenants.tsx       租客列表 — 筛选
│   ├── Bills.tsx         账单管理 — 按月导航/收款付款拆单
│   ├── Contracts.tsx     合同管理 — 业主合同+租客合同/筛选/搜索
│   ├── Statistics.tsx    统计报表 — 年度收支/月度趋势/入住率/房源对比
│   ├── More.tsx          更多 — 数据备份导入导出/各页面入口
│   └── Trash.tsx         回收站 — 搜索/筛选/批量恢复删除
├── components/ (14个)
│   ├── TenantModal.tsx      租客弹窗 — 两步: 信息→预览
│   ├── BillModal.tsx        账单弹窗
│   ├── PropertyModal.tsx    房源弹窗
│   ├── RoomModal.tsx        房间弹窗
│   ├── LandlordContractModal.tsx  业主合同弹窗
│   ├── CheckoutModal.tsx    退租结算弹窗
│   ├── BillSummaryModal.tsx 账单汇总弹窗
│   ├── BillCard.tsx / BillChart.tsx / BottomNav.tsx
│   ├── PropertyCard.tsx / RoomCard.tsx / StatCard.tsx
│   └── PaymentModal.tsx
├── store/useStore.ts   — Zustand + persist (localStorage)
├── types/index.ts      — 数据模型定义
├── utils/
│   ├── calculator.ts   — 30/360 房租计算 + 分期账单生成
│   └── profit.ts       — 利润计算算法
└── lib/utils.ts        — cn() 工具
```

## 数据模型

```
Property → Room → Tenant → Bill (receivable)
LandlordContract → Bill (payable)
ProfitRecord / TrashItem
```

**Key fields**: Tenant(name, phone, roomId, contractStart/End, monthlyRent, paymentMethod, advanceDays, deposit, status)
**Bill**: amount, type(rent|water|electric|gas|other), status(pending|paid|overdue), direction(payable|receivable), dueDate, paidDate
**PaymentMethod**: monthly | quarterly | semi-annual | annual

## 约定

- 移动端优先: max-w-md mx-auto
- Tailwind 主色: blue-900
- 弹窗底部弹出: rounded-t-3xl, items-end, z-[60]
- 中文 UI, 日期格式 YYYY-MM-DD
- 30/360 算法: 每月=30天, 每年=360天
- 数据在 localStorage, 删除先进回收站
- 换电脑需导出 Excel 再导入
- 种子数据在 buildSeedState()

## 部署流程（硬性要求）

每次构建前必须执行：
1. 先读 `src/version.ts`，确认版本号是否需要加
2. 如需加版本号 → **先改 version.ts，再 `npm run build`**
3. 版本号永远不能往回走 (1.0.8 → 1.0.9 → 1.0.10...)

## 业务规则

### 账单显示
- 未收/已逾期 排前面，已收 排后面，同状态下按 dueDate 升序
- 已收标记: bg-green-200 text-green-700 + ✓ 前缀 (✓ 已收 / ✓ 已付 / ✓ 已支付)
- RoomDetail 的「收款」按钮打开收款确认弹窗（非浏览器 confirm）— 弹窗支持拆单

### 净利润计算（Statistics / profit.ts）
- 押金不计入收入。计算净收入时需排除 description='押金' 的账单
- 30/360 重叠法: 房东周期内取租客租金覆盖部分 ÷ 30天 × 月租，加卫管费，减房东支出 = 净利润
- 利润提取为手动记录（仅标记时间/金额，无实际提现功能）

### 押金余额
- 押金余额 = 所有 description 包含「押金」的账单金额之和（押金为正，退押金为负）
- 展示在 More 页管理概览卡片第四列

### 收款/付款确认
- 弹窗除显示类型、金额、应收日、房源/租客外，还需显示 description（即账单期间，如"第1期 月租 2026-07-01 ~ 2026-07-30"）
- 支持拆单（部分收款/付款）

## PWA

```bash
npm run build
node pwa-server.cjs
# 手机访问 https://192.168.1.185:5174/
```

# 房屋管理系统

最后更新: 2026-08-28

## 凭据 & API（非常重要，切勿丢失）

### 云端数据库 (Supabase)
- **URL**: `https://jvpkqqnfzkkcztkbzpdx.supabase.co`
- **Key**: 已硬编码在 `src/lib/supabase.ts` 第 7 行（`VITE_SUPABASE_ANON_KEY`）
- **说明**: 免费版，数据库 500MB + 文件存储 1GB + 带宽 2GB/月
- **登录**: 通过手机号+验证码登录（app 内 AuthModal）
- **App 账号（调试用）**: `c94138228@163.com` / `ztzd12345`（邮箱+密码登录，非手机验证码；用 API 登录后可查 `user_data` 表）
- **管理令牌 (PAT)**: 已从文档移除（2026-08-28 GitHub Push Protection 拦截：账号级凭据不能入库；需要时去 supabase.com → Account → Access Tokens 重新生成，用完即撤销）
- **Management API**: `https://api.supabase.com/v1/`，Header `Authorization: Bearer {PAT}`；项目 ref = `jvpkqqnfzkkcztkbzpdx`；日志查询端点 `logs?sql=`（404，需另找正确端点）；用户数据表 `user_data`（user_id + data JSON + updated_at），RLS 开启，anon key 读不到

### 云同步数据丢失排查记录（2026-08-28，未修复）
- **现象**: 手机 APK 确认林世轮 2200 房租收款（第3期 2026-08-25~09-24），重新登录后恢复为未交
- **实锤（日志分析 2026-08-28）**: 24h API 日志中 user_data **零写请求**（全部是 GET）——收款从未上云；云端停留在 8-26 10:27
- **根因 1（App 自踢）**: App 反复自己 scope=global 全局登出（8-27 21:53:24、8-28 09:57:55、11:01:07、11:50:09，特征=204+403 双连发），每次都吊销所有设备会话并清空本地数据
- **根因 2（双设备互踢循环）**: 手机 APK 和电脑浏览器（Chrome 150，11:16:18 密码登录）各自身份共存；后登录者 upsert active_sessions 覆盖 device token → 先登录者下次校验 mismatch → 被踢 + 全局登出（连带杀掉对方 refresh token，电脑 11:14:57 报 "Refresh Token Not Found" 即被手机 11:01:07 全局登出所杀）→ 循环
- **根因 3（被踢即清库）**: 踢出/登出 handler 删除 property-manager-data，未同步的本地改动（收款）随之湮灭
- **完整事故链**: 今早手机收款 → 保存请求从未发出（0 条写日志）→ 11:01 或 11:50 被 App 自踢清库 → 重登拉回 8-26 云端旧数据 → 显示未交
- **修复方案（最终版，用户已确认原则：云端为准 + 单设备在线强踢 + 强制在线）**: ① 操作即同步（去 500ms 防抖），失败红提示 + 10s 自动重试 ② 断网时阻止新增/修改操作（在线强制）③ signOut 全改 local scope（被踢方只死自己，消互踢循环）④ 登出/被踢不再删 tab_active（主犯：四次被踢三次是它）⑤ 被踢/登出不清本地业务数据（连 setState(空) 一起移除，防 persist 写回空）⑥ 重复踢加互斥标记（消 204+403 双登出）⑦ 修 doSave saving.current 疑似卡死（finally 保证复位，全天 0 条写请求的头号嫌疑）。设备锁强踢逻辑与云端优先覆盖保留不动。改动文件：App.tsx / cloud-sync-context.tsx / supabase.ts / More.tsx

### GitHub
- **仓库**: `https://github.com/briamcorge/house`
- **分支**: `master`
- **说明**: 2026-08-28 起恢复推送（用户明确要求"推送"）；`vite.config.ts` 的 `base` 已为 `'/house/'`（GitHub Pages 部署需要，勿改回 `./`）

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

- **⚠️ 产品铁律：本软件是在线软件，只能在线使用（2026-08-28 用户明确要求）。** 云端数据为唯一权威，本地仅是缓存；所有业务操作必须实时同步云端成功才算完成；断网时阻止新增/修改操作并给出可见提示；不做离线使用支持。
- **⚠️ 铁律：任何代码改动必须先经用户明确同意才能动手。** 用户问"能不能 X / 要不要 X / 可以 X 吗"这类问题时，只回答，不实现。只有用户明确说"改/做/加/实现"等指令时才允许改代码。讨论功能、分析问题、读代码、查数据不算改动，可以直接做。
- **⚠️ 铁律：代码问答必须由子代理读盘。** 所有关于现有项目代码、功能、行为的回答，必须先由子代理读取磁盘真实源码之后再输出结论；禁止主代理仅凭对话记忆/历史修改片段直接总结代码。分工：**本项目内部代码**（src/ 等）→ `explore` 子代理读盘；**外部资料**（库文档、远程仓库、开源实现）→ `librarian` 子代理查证。信息不足时直接派子代理读取，不猜测。
- 移动端优先: max-w-md mx-auto
- **手机排版调试基准**: 用户手机 = 华为/荣耀, 物理分辨率 2860×1272, dpr=3 → CSS 逻辑视口 **424×953**。修排版必须用浏览器模拟此视口(所见即所得)。若手机上出现模拟不出的换行/挤压, 先怀疑手机系统字体被调大
- Tailwind 主色: blue-600（主按钮/强调统一用 blue-600，浅色选中态 bg-blue-100 + text-blue-700，hover 加深 blue-700）
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

### 利润提取规则（More 页「利润提取」）— ⚠️ 用户红线，修改必须征得用户明确同意
**提取流程**（不可擅自改动）：
- 利润提取是**手动记录**操作，仅记录 房源 + 业主账单周期 + 金额 + 提取日期 + 备注，无实际提现功能
- 必须在 More 页「利润提取」入口操作：选择房源 → 选择业主账单周期 → 输入金额 → 提交
- 同一周期提取后按钮置灰（不可重复提取）
- **允许负金额**（负利润也要允许提取，2026-07-31 用户明确要求）

**计算口径**（对应 src/utils/profit.ts `calculatePeriodProfit`）：
- 房租账单按**覆盖期（description 起止日）**与业主周期重叠匹配
- 卫管费等其他一次性费用：**按实收日（paidDate）归属单一周期，全额计入一次**，不跨周期重复、不分摊（2026-07-31 用户明确要求："卫管费就是一次性费用，不能分摊"）
- 押金账单（type=deposit 或 description 含「押金」）不参与利润计算
- 负数账单（退租金等）不参与利润收入
- 只有该周期内所有租客房租都足额交齐（paidRent >= expectedRent）才计入可分配利润
  - **设计意图（2026-09-03 用户确认，勿报 bug）**：利润金额（totalIncome）**包含未收房租**——这是有意设计，用于**提前预估未来利润**（用户原话："可以先帮我算出利润，这样我可以提前知道以后有多少利润"）。「是否可提取」由 `allPaid` 门槛控制：**More 页只有 allPaid 为 true 才能提取**（提交按钮已强制：未交齐时按钮置灰「未交齐」+ 点击拦截提示「该周期租客房租未交齐，暂不能提取利润」）。排查时若发现"未收房租计入利润金额"，属预期行为，不是 bug；若发现"未交齐也能提取"，才是 bug。
- 金额口径：房租与其他费用的**已收账单统一按实收金额 `paidAmount || amount` 计算**（部分收款不虚增收入）。app 拆单/收款流程从不设置 paidAmount（拆单 = 新开一张 amount=实收额的已付账单），paidAmount 只产生于手动编辑账单（BillModal）或 Excel 导入「已付金额」列（2026-08-29 统一口径，profit.ts 有详细注释）
- **中介费/网费/水电燃气不计入利润**（2026-09-03 用户确认，勿报 bug）：利润只统计 other/sublease/hygiene 三种已收费用；agency（中介费）/internet（网费）/utilities（水电燃气）视为代收，明细中展示但不计入利润总额。排查时若发现"中介费/网费/水电费交了但利润没涨"，属预期行为，不是 bug

**修改红线**：
- 以上任何一条规则（提取流程、计算口径、负金额、卫管费归属）**不得擅自修改**
- 任何涉及利润计算的代码改动（src/utils/profit.ts、More.tsx 利润提取区、useStore 的 addProfitRecord 等），必须先向用户说明改动内容和理由，**获得用户明确同意后才能实施**

### 合同续约（2026-09-03 用户确认，勿报 bug）
- **业主/租客提前续约时，旧合同的未付账单依然有效，继续支付/收款**——续约只把旧合同标记为 ended（endReason: 'renew'），**不删除旧合同未付账单**（区别于退租 terminateLandlordContract 会删除未付账单）
- 排查时若发现"续约后旧合同还有未付账单"，属预期行为，不是 bug；用户原话："业主一般会提前续约，但是未付账单依然有效。还要继续支付。租客提前续约也是这样的逻辑。如有未收账单，依然需要继续支付"

### 删除租客（2026-09-03 用户确认，勿报 bug）
- **删除租客 = 彻底断绝关系，已付账单也一并删除**（进回收站可恢复）；想保留已付流水应走「退租」而非删除
- 排查时若发现"删除租客把已收账单也删了"，属预期行为，不是 bug；用户原话："我之所以要删除这个租客，就是不想和他发生任何关系，要不然只会给他点退租"

### 押金余额
- 押金余额 = 所有 description 包含「押金」的账单金额之和（押金为正，退押金为负）
- 展示在 More 页管理概览卡片第四列

### 续约押金调整（2026-08-16）
- 续约时押金默认按新月租自动计算：押金倍数 = 旧押金 ÷ 旧月租（押一/押二自动识别），月租变化后押金自动跟随
- 用户手动修改押金输入框后，自动计算停止（不再覆盖手填值）
- 押金减少 → 自动生成**负数**「退押金」账单（type=deposit, direction=receivable, amount 为负）。**负数金额是正常业务设计，非 bug**：押金余额按「押金为正、退押金为负」抵减，利润计算排除押金
- 押金增加 → 自动生成正数「押金补收」账单
- UI 释义：押金框下方提示差额去向（退押金/补收），预览页负数账单带橙色「退款」标注

### 收款/付款确认
- 弹窗除显示类型、金额、应收日、房源/租客外，还需显示 description（即账单期间，如"第1期 月租 2026-07-01 ~ 2026-07-30"）
- 支持拆单（部分收款/付款）

### 时区注意事项（2026-08-16 记录，已知隐患未修）
- 多处 `new Date('YYYY-MM-DD')` 按 UTC 解析（字符串日期无时区），西时区（UTC-）会偏一天；国内 UTC+8 无影响
- **有意不改代码**：收益低（仅影响西时区用户）、改动面大（涉及日期解析/比较/显示多处）、风险高
- 如未来支持海外用户，需统一用本地解析（`new Date(y, m-1, d)` 或字符串比较）

## PWA

```bash
npm run build
node pwa-server.cjs
# 手机访问 https://192.168.1.185:5174/
```

# 房屋管理系统

最后更新: 2026-09-06

## 凭据 & API（非常重要，切勿丢失）

### 云端数据库 (Supabase)
- **URL**: `https://jvpkqqnfzkkcztkbzpdx.supabase.co`
- **Key**: 已硬编码在 `src/lib/supabase.ts` 第 7 行（`VITE_SUPABASE_ANON_KEY`）
- **说明**: 免费版，数据库 500MB + 文件存储 1GB + 带宽 2GB/月
- **登录**: 通过手机号+验证码登录（app 内 AuthModal）
- **App 账号（调试用）**: `c94138228@163.com` / `ztzd12345`（邮箱+密码登录，非手机验证码；用 API 登录后可查 `user_data` 表）
- **管理令牌 (PAT)**: 已从文档移除（2026-08-28 GitHub Push Protection 拦截：账号级凭据不能入库；需要时去 supabase.com → Account → Access Tokens 重新生成，用完即撤销）
- **Management API**: `https://api.supabase.com/v1/`，Header `Authorization: Bearer {PAT}`；项目 ref = `jvpkqqnfzkkcztkbzpdx`；日志查询端点 `logs?sql=`（404，需另找正确端点）；用户数据表 `user_data`（user_id + data JSON + updated_at），RLS 开启，anon key 读不到

### 云同步数据丢失排查记录（2026-09-06，第四次，已修复 → 1.276）
- **现象**: 手机（1.274）本地有最新数据（8-28 之后录入；因同步失败从未上云）；当晚 00:43 用户登录刚修复的网页版（1.275），网页版把浏览器陈旧本地整档自动推上云（云端 `updated_at=2026-09-05T16:43:30Z` = 网页版时钟）→ 手机被踢后重登，1.269 保护误判「云端更新」→ 云端旧档覆盖手机本地最新数据 → 两端尽失；无 Excel 备份、Supabase 免费版无备份 → 只能凭用户记忆补录
- **根因 1（dirty 语义缺陷，1.269 保护的核心漏洞）**: `property-manager-dirty-at` 每次业务操作都打、**保存成功从不清除**（清除仅发生在云端覆盖本地时）→ 陈旧设备的标记永不过期；而云端 `updated_at` 是「最后写入设备自己的时钟」（saveCloudData 客户端带 `new Date().toISOString()`，全库无 trigger）→ 网页版 00:43 一写，云端时间戳反超手机真实数据时间戳 → 「内容更新但墙钟更早」的手机数据被误判为旧
- **根因 2（静默本地可写模式）**: 修复前网页版部署缺 Supabase env（`isSupabaseConfigured()=false`）→ App 仍进入主界面、可本地写入、无任何横幅 → 陈旧本地缓存带着标记，一旦 env 修好首次登录即触发 loadNow/登录路径自动推云
- **根因 3（被踢 best-effort 推送无门控）**: doSave 验锁发现不匹配时无条件把本地整档推上云再踢出——陈旧设备在保存路径被踢也会覆盖云端
- **修复（1.276，用户已逐条同意）**: ① **A1** dirty 保存成功即清除（doSave ok 分支 + `!_pending` 守卫，防快照后有排队新改动时误清）② **A2** 被踢 best-effort 推送加 dirty 门控（无 dirty 不推）③ **A3** `isSupabaseConfigured()=false` 渲染拦截页，禁止进入（杜绝静默本地可写模式，坏部署不可能再累积本地脏数据）④ **A4** 跨设备时间比较一律 `Date.parse` 毫秒（修 `'…Z'` vs `'+00:00'` 字典序近值误判），并附 `sql/2026-09-06_updated_at_trigger.sql`（DB trigger 服务器时钟，需 Dashboard 执行一次）
- **教训**: ① 每次代码改动必须实际打 APK 并让用户安装（勿只 bump 版本号），用户端保护滞后 = 事故放大器 ② 同步相关改动先与用户逐条确认（已做）③ 仍需每周 Excel 导出（免费版唯一可控备份）
- 事实核对：手机 1.274 与 1.275 web 同步逻辑逐字节相同（仅 version.ts 不同）；事故放大来自"设备各自时钟"+"dirty 成功不清"

### 云端自动备份 L1+L2（2026-09-06 实施，用户同意，临时 PAT 代办执行）
- **动机**: 四次数据丢失后用户明确要求云端自动备份（Supabase 免费版无平台级备份）；本小节取代早期「免费版无备份、Excel 是唯一可控备份」的说法——**2026-09-06 起云端有自动备份**，但每周 More 页导出 Excel 仍建议保留（双保险、可离线留档）
- **线上表结构（2026-09-06 实测，勿按旧 DDL 猜）**: `user_data(id uuid PK, user_id uuid UNIQUE REFERENCES auth.users, data jsonb, updated_at timestamptz)`，RLS 开启；`admin-sql.sql` 里的 user_id-PK 旧结构未生效
- **L1 覆盖前存档**: 表 `user_data_history`（identity id PK、user_id、data、updated_at_before、reason('overwrite'|'delete')、archived_at），保留 30 天；触发器 `trg_user_data_archive`（BEFORE UPDATE OR DELETE，仅 data 真变才存档；1% 概率清 30 天前旧档）
- **L2 每日全量快照**: 表 `user_data_daily_snapshots`（PK(user_id, snap_date)，含 data/updated_at/taken_at），保留 90 天；函数 `take_user_data_snapshot()` 同日重复执行=覆盖为最新；pg_cron 任务 `house-daily-snapshot` 每天 **22:00 UTC（北京 06:00）** 自动执行
- **A4 DB trigger（已执行）**: `trg_user_data_updated_at` BEFORE INSERT OR UPDATE 强制 `updated_at = now()`（服务器时钟，A4 代码修复的 DB 侧落地；SQL 见 `sql/2026-09-06_updated_at_trigger.sql`）
- **恢复工具（SECURITY DEFINER，还原仅限 is_admin）**: `list_user_data_backups(user_id)` 只读列出备份点；`restore_user_data_from_backup(user_id, kind, at)` 还原（还原会先经 L1 再存档，可逆）
- **完整可执行脚本**: `E:\DSH\_house-incident-20260906\auto-backup\2026-09-06_auto_backup_L1_L2.sql`（v0.1 DRAFT → 已执行，2026-09-06 实测 2 表 2 触发器 1 cron 全存活）；改/恢复前先读该脚本与 `sql/2026-09-06_updated_at_trigger.sql`
- **注意事项**: 备份表未开 RLS（靠 SECURITY DEFINER 函数隔离访问，直接查表需 service/postgres 权限）；`get_all_user_data` RPC 仍可用调试账号只读核对线上数据

### 云同步数据丢失排查记录（2026-08-28，已修复 → 1.259 实施）
- **现象**: 手机 APK 确认林世轮 2200 房租收款（第3期 2026-08-25~09-24），重新登录后恢复为未交
- **实锤（日志分析 2026-08-28）**: 24h API 日志中 user_data **零写请求**（全部是 GET）——收款从未上云；云端停留在 8-26 10:27
- **根因 1（App 自踢）**: App 反复自己 scope=global 全局登出（8-27 21:53:24、8-28 09:57:55、11:01:07、11:50:09，特征=204+403 双连发），每次都吊销所有设备会话并清空本地数据
- **根因 2（双设备互踢循环）**: 手机 APK 和电脑浏览器（Chrome 150，11:16:18 密码登录）各自身份共存；后登录者 upsert active_sessions 覆盖 device token → 先登录者下次校验 mismatch → 被踢 + 全局登出（连带杀掉对方 refresh token，电脑 11:14:57 报 "Refresh Token Not Found" 即被手机 11:01:07 全局登出所杀）→ 循环
- **根因 3（被踢即清库）**: 踢出/登出 handler 删除 property-manager-data，未同步的本地改动（收款）随之湮灭
- **完整事故链**: 今早手机收款 → 保存请求从未发出（0 条写日志）→ 11:01 或 11:50 被 App 自踢清库 → 重登拉回 8-26 云端旧数据 → 显示未交
- **修复方案（最终版，用户已确认原则：云端为准 + 单设备在线强踢 + 强制在线）**: ① 操作即同步（去 500ms 防抖），失败红提示 + 10s 自动重试 ② 断网时阻止新增/修改操作（在线强制）③ signOut 全改 local scope（被踢方只死自己，消互踢循环）④ 登出/被踢不再删 tab_active（主犯：四次被踢三次是它）⑤ 被踢/登出不清本地业务数据（连 setState(空) 一起移除，防 persist 写回空）⑥ 重复踢加互斥标记（消 204+403 双登出）⑦ 修 doSave saving.current 疑似卡死（finally 保证复位，全天 0 条写请求的头号嫌疑）。设备锁强踢逻辑与云端优先覆盖保留不动。改动文件：App.tsx / cloud-sync-context.tsx / supabase.ts / More.tsx

### 云同步数据丢失排查记录（2026-09-03，第三次，已修复 → 1.269）
- **现象**: 手机装新 APK（1.268）后"流失很多数据"——最近几天（8-29~9-03）收的款、今天的利润提取记录全部消失；云端最后一条收款是 8-28（林世轮 2200），8-29 之后 0 条写入；用户手机旧 APK 是 **1.260**（8-29 发布，含 8-28 同步修复但缺 1.261 的"冷启动竞态自我误踢"修复 + 缺 1.267 的"session 过期识别提示"）
- **完整事故链**: 1.260 冷启动自我误踢（1.261 才修的竞态 bug）→ session 失效 → 之后 6 天所有操作（收款/付款/利润提取）本地成功但**同步静默失败**（1.260 无 session 过期提示，用户无感知）→ 云端停在 8-28 → 今天装 1.268 启动执行"云端优先"→ **云端旧数据覆盖本地新数据** → 六天操作全部湮灭
- **⚠️ 事故放大器（设计缺陷）**: "云端优先"（云端有数据就无条件覆盖本地）假设云端永远最新，但同步断链时该假设不成立——8-28 与 9-03 两次都是「云端旧数据覆盖本地新数据」。**修复（1.269）**：本地 dirty 标记（localStorage `property-manager-dirty-at`，业务操作成功时写入，见 useStore set 包装）+ 加载时比较云端 updated_at：本地比云端新 → **不覆盖、保留本地、自动推云、蓝色提示**（cloud-sync-context loadNow + App.tsx SIGNED_IN 双处）
- **修复（1.269）其他项**: ③ 删除 More 页"清除本机数据"按钮（会连云端一起清空且免费版无备份无法恢复，用户确认"完全不需要"）④ Excel 导入写 dirty 标记 + 云端保存失败不再强制刷新（防导入数据被云端旧数据覆盖，导入用原始 setState 绕过包装的漏洞）⑤ normalizeCloudData / migrate v2→v3 只删 endReason==='checkout'（退租）租客的未付账单，续约(renew)与 endReason 为空保留（用户确认"已续约的不能删，已退租的未付账单可以删"）
- **用户防丢失习惯（已告知）**: ① 只用最新版 APK（1.267+，session 过期有提示）② 每周 More 页导出 Excel 备份发到微信/网盘（Supabase 免费版无任何备份，Excel 是唯一可控备份）③ 装新 APK 前确认旧 App 无红色失败提示，装完核对最新收款④ 看到"重新登录"提示先处理再操作

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

⚠️ 2026-09-05 更新：**版本号由构建脚本自动管理，不要手动改 version.ts**。`npm run build` 会先跑 `scripts/bump-version.js` 自动 patch+1（如 1.270→1.271）并同步 android/app/build.gradle 的 versionCode/versionName。手动改 version.ts 再 build 会导致**双重自增**（如想发 1.271 实际变 1.272）。

每次构建前必须执行：
1. 先读 `src/version.ts`，确认当前版本号（如 1.270）
2. 确认是否需要发版；需要 → 直接 `npm run build`（自动 bump 到 1.271）
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
- **已修复（2026-09-03）：`normalizeCloudData`（supabase.ts）和 migrate v2→v3（useStore.ts）曾无差别删除所有 ended 租客的 pending 正数应收账单，误删续约(renew)租客的未付账单**。已改为**只删除 endReason === 'checkout'（退租）租客的未付账单**；renew 与 endReason 为空（旧数据无法确认）的保守不删（删除不可逆，宁可多显示未收也不误删）。用户原话："已续约的不能删，已退租的未付账单可以删"

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

# 房屋管理系统

最后更新: 2026-09-13（十三处修复：导入白名单 / 编辑业主合同 / 编辑租客合同 / 恢复租客 / 负数账单 / 业主退租表单 / 续约丢电话 / 设备踢出僵尸态 / 业主免租期逐年 / 续约绕过利润门槛 / 拆单期间反置 / effectiveEnd 取错退租金 / 重复合同编号自动去重）

## 凭据 & API（非常重要，切勿丢失）

### 云端数据库 (Supabase)
- **URL**: `https://jvpkqqnfzkkcztkbzpdx.supabase.co`
- **Key**: 在 `.env`（`VITE_SUPABASE_ANON_KEY`，gitignore 不入库）；`src/lib/supabase.ts` 只从环境变量读取，无硬编码（2026-08-29 起）
- **说明**: 免费版，数据库 500MB + 文件存储 1GB + 带宽 2GB/月
- **登录**: 邮箱+密码登录（app 内 AuthModal；**手机号验证码登录=付费功能，用户确认不做，勿加**）；修改密码入口在 More 页「设置」菜单（钥匙图标，2026-09-06 加，直接调 updatePassword，不校验旧密码——用户确认不做，勿加）
- **App 账号（调试用）**: `c94138228@163.com`（邮箱+密码登录，非手机验证码；用 API 登录后可查 `user_data` 表；**密码在 `房屋管理系统-使用说明.txt`，不在 AGENTS.md 存明文**——2026-09-06 安全整改，原明文曾随公开仓库泄露）
- **隔离测试账号（2026-09-13 建，专供 agent 排查/验证用）**: `house-test@example.com`（密码在同上的使用说明里）。`user_data` 按 `user_id` 分行，**与上面那个真实账号的数据完全隔离**——做端到端验证请用它，**不要**拿真实账号试；邮箱是 RFC 保留域名（收不到邮件，改密码走 App 内 More 页）
- **管理令牌 (PAT)**: 已从文档移除（2026-08-28 GitHub Push Protection 拦截：账号级凭据不能入库）；**临时 PAT 在 `房屋管理系统-使用说明.txt`**（2026-09-06 用户提供，30 天有效期，用完撤销；当前已用于执行 SECURITY DEFINER 加固 SQL）
- **Management API**: `https://api.supabase.com/v1/`，Header `Authorization: Bearer {PAT}`；项目 ref = `jvpkqqnfzkkcztkbzpdx`；日志查询端点 `logs?sql=`（404，需另找正确端点）；用户数据表 `user_data`（user_id + data JSON + updated_at），RLS 开启，anon key 读不到

### 云端自动备份 L1+L2（2026-09-06 实施，用户同意，临时 PAT 代办执行）
- **动机**: 四次数据丢失后用户明确要求云端自动备份（Supabase 免费版无平台级备份）；本小节取代早期「免费版无备份、Excel 是唯一可控备份」的说法——**2026-09-06 起云端有自动备份**，但每周 More 页导出 Excel 仍建议保留（双保险、可离线留档）
- **线上表结构（2026-09-06 实测，勿按旧 DDL 猜）**: `user_data(id uuid PK, user_id uuid UNIQUE REFERENCES auth.users, data jsonb, updated_at timestamptz, last_active_at timestamptz, disabled boolean default false)`，RLS 开启；`last_active_at`/`disabled` 两列 2026-09-06 由 SQL 补加（线上原本只有 4 列）；`admin-sql.sql` 里的 user_id-PK 旧结构未生效
- **L1 覆盖前存档**: 表 `user_data_history`（identity id PK、user_id、data、updated_at_before、reason('overwrite'|'delete')、archived_at），保留 30 天；触发器 `trg_user_data_archive`（BEFORE UPDATE OR DELETE，仅 data 真变才存档；1% 概率清 30 天前旧档）
- **L2 每日全量快照**: 表 `user_data_daily_snapshots`（PK(user_id, snap_date)，含 data/updated_at/taken_at），保留 90 天；函数 `take_user_data_snapshot()` 同日重复执行=覆盖为最新；pg_cron 任务 `house-daily-snapshot` 每天 **22:00 UTC（北京 06:00）** 自动执行
- **A4 DB trigger（已执行）**: `trg_user_data_updated_at` BEFORE INSERT OR UPDATE 强制 `updated_at = now()`（服务器时钟，A4 代码修复的 DB 侧落地；SQL 见 `sql/2026-09-06_updated_at_trigger.sql`）
- **恢复工具（SECURITY DEFINER，还原仅限 is_admin）**: `list_user_data_backups(user_id)` 只读列出备份点；`restore_user_data_from_backup(user_id, kind, at)` 还原（还原会先经 L1 再存档，可逆）。⚠️ 2026-09-06 安全加固：`list_user_data_backups` 已加 `is_admin()` 校验（防 IDOR），所有 SECURITY DEFINER 函数已 `set search_path = public`（`get_all_user_data` 因返回类型与旧版不同需先 drop 再重建）；脚本见 `sql/2026-09-06_security_definer_fix.sql`，已由临时 PAT 在 Dashboard 执行完毕
- **L1/L2 脚本位置**: 原执行脚本曾在 `E:\DSH\_house-incident-20260906\`（⚠️ **该路径已不可达**，E: 盘不存在，项目也已迁到 D:）。线上结构的权威快照见 `sql/2026-09-12_live_rls_functions_dump.sql`，各脚本状态说明见 `sql/README.md`；改/恢复前读这两份与 `sql/2026-09-06_updated_at_trigger.sql`
- **注意事项**: 备份表未开 RLS（靠 SECURITY DEFINER 函数隔离访问，直接查表需 service/postgres 权限）；`get_all_user_data` RPC 仍可用调试账号只读核对线上数据

### GitHub
- **仓库**: `https://github.com/briamcorge/house`
- **分支**: `master`
- **说明**: 2026-08-28 起恢复推送（用户明确要求"推送"）；`vite.config.ts` 的 `base` 已为 `'/house/'`（GitHub Pages 部署需要，勿改回 `./`）

### Android 签名 (APK 打包必需)
- **keystore 路径**: `D:\新项目\house\android\app\house-management.keystore`（已从密钥包 zip 解压就位，2026-09-12）
- **keyAlias**: `house-management`
- **凭据**: 密码在 `android/app/keystore.properties`（构建自动读取）与 `房屋管理系统-使用说明.txt`（人工查询），**不在 AGENTS.md 存明文**（2026-09-06 安全整改：旧 keystore 曾随公开仓库泄露，已轮换新密钥）
- **⚠️ 重要**: 签名文件丢失后无法覆盖安装已装过的 APK，务必保留；新密钥签名与旧 APK 不同，**换新 keystore 后旧 APK 无法覆盖安装，需卸载重装**

### 项目路径（2026-09-12 文件夹重组）
- **工作区**: `D:\新项目`（4 个项目：house / fund-app / 房屋业绩计算器 / 房源聚合器，另有「金融」资料目录）
- **本地(本项目)**: `D:\新项目\house`
- **APK 输出**: 桌面 `房屋管理-v{version}.apk`
- **Android 项目**: `D:\新项目\house\android`

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
3. 版本号与 build.gradle 由 scripts/bump-version.js 自动同步 —— **不要手工改**（见下方「部署流程」）
4. APK 由 scripts/copy-apk.cjs 自动复制到桌面：房屋管理-v{version}.apk
```

### 之前踩过的坑（避免再犯）
1. ~~`VITE_BASE` 忘记设 `./` → 白屏~~ ✅ 已修复：`build` 默认 `--base=./`
2. ~~`npx cap copy` 忘记跑 → APK 里还是旧代码~~ ✅ 已修复：`release` 命令包含 cap copy
3. ~~`dist/assets/` 旧文件堆积 → APK 膨胀到 3.3MB~~ ✅ 已修复（sync 1.234 起）：`build` 先跑 `scripts/clean-dist.cjs` 清理 dist（rmSync + cmd rmdir 双保险，解决 Windows 占用文件静默失败）
4. ~~build 多次导致版本号乱跳~~ ⚠️ 注意：`release` 也会 bump，避免不必要的 release

## 技术栈

React 18 + TypeScript 5.8 + Vite 6 + Tailwind CSS 3.4 + Zustand 5 + react-router-dom 7 + Recharts 3.8 + Lucide React + vite-plugin-pwa + Capacitor 8

## 项目结构

```
src/
├── pages/       (12 个)  Home / Properties / RoomList / RoomDetail / Tenants / Bills /
│                         Contracts / Statistics / More / Trash / LoginPage / Admin
├── components/  (21 个)  各类弹窗与卡片：TenantModal / BillModal / LandlordContractModal /
│                         LandlordContractDetailModal / CheckoutModal / LandlordCheckoutModal /
│                         PropertyModal / RoomModal / WheelDatePicker / HistoryTenantsModal /
│                         BillSummaryModal / AuthModal / AlertModal / ConfirmModal /
│                         ErrorBoundary / BillCard / BillChart / PropertyCard / RoomCard /
│                         StatCard / BottomNav
├── store/useStore.ts    Zustand + persist。**业务动作全在这里**（含 dirty 标记与云端同步包装）
├── types/index.ts       数据模型定义
├── utils/               calculator.ts（30/360 房租计算 + 分期账单生成）
│                        profit.ts（利润计算）· balance.ts（余额口径）· vacancy.ts（空置统计）
└── lib/                 supabase.ts（云端存取/设备锁/超时）· cloud-sync-context.tsx（同步状态机）
                         display-id.ts（合同编号去重）· auth-diag.ts / sync-log.ts（诊断日志）
```

⚠️ **本清单曾多次过时**（曾把 pages 写成 10 个、components 写成 14 个，还列过一个并不存在的 `PaymentModal.tsx`——收款弹窗实际内联在 Bills/RoomDetail 里）。上面数字是 2026-09-13 核对的；**要精确清单请直接 `ls src/pages src/components`**，不要依赖本文。

## 数据模型

```
Property → Room → Tenant → Bill (receivable)
LandlordContract → Bill (payable)
ProfitRecord / TrashItem
```

**Key fields**: Tenant(name, phone, roomId, contractStart/End, monthlyRent, paymentMethod, advanceDays, deposit, status)
**Bill**: amount, type(rent|water|electric|gas|other), status(pending|paid|overdue|cancelled|refunded), direction(payable|receivable), dueDate, paidDate
**PaymentMethod**: monthly | quarterly | semi-annual | annual

## 历史排查记录（已拆出，按需再读）

本文件**只保留"每次会话都需要知道"的内容**。叙事性的历史记录（三次云同步数据丢失事故复盘、导入导出修复记录、2026-09-13 六批修复的详细实测数据等，约 150 行）已拆到 **`docs/修复与事故记录.md`**。

- **排查历史事故 / 想知道"某处为什么这么改" → 读那个文件**（日常开工**不需要**读）
- **行为规则与「有意设计勿报 bug」清单留在本文件**：见下方「业务规则」「约定」
- 拆出原因：那些记录曾占本文件**一半篇幅**，把真正影响 agent 行为的内容淹没

## 约定

- **⚠️ 产品铁律：本软件是在线软件，只能在线使用（2026-08-28 用户明确要求）。** 云端数据为唯一权威，本地仅是缓存；所有业务操作必须实时同步云端成功才算完成；断网时阻止新增/修改操作并给出可见提示；不做离线使用支持。
- **⚠️ 铁律：任何代码改动必须先经用户明确同意才能动手。** 用户问"能不能 X / 要不要 X / 可以 X 吗"这类问题时，只回答，不实现。只有用户明确说"改/做/加/实现"等指令时才允许改代码。讨论功能、分析问题、读代码、查数据不算改动，可以直接做。
- **⚠️ 铁律 2：授权流程（2026-09-06 用户明确要求）。** 用户说「修/改/做」仅是指令，**不算授权**。修改任何代码前必须先问「是否同意开工」，用户明确回答「同意」才算授权完成；未获「同意」不得修改任何文件。不得把模糊指令（如"按优先级排序""按列表来"）或系统自动续跑指令当作授权。一次只做用户同意的部分，做完停下等下一步指示。
- **⚠️ 铁律：代码问答必须由子代理读盘。** 所有关于现有项目代码、功能、行为的回答，必须先由子代理读取磁盘真实源码之后再输出结论；禁止主代理仅凭对话记忆/历史修改片段直接总结代码。分工：**本项目内部代码**（src/ 等）→ `explore` 子代理读盘；**外部资料**（库文档、远程仓库、开源实现）→ `librarian` 子代理查证。信息不足时直接派子代理读取，不猜测。
- 移动端优先: max-w-md mx-auto
- **手机排版调试基准**: 用户手机 = 华为/荣耀, 物理分辨率 2860×1272, dpr=3 → CSS 逻辑视口 **424×953**。修排版必须用浏览器模拟此视口(所见即所得)。若手机上出现模拟不出的换行/挤压, 先怀疑手机系统字体被调大
- Tailwind 主色: blue-600（主按钮/强调统一用 blue-600，浅色选中态 bg-blue-100 + text-blue-700，hover 加深 blue-700）
- 弹窗底部弹出: rounded-t-3xl, items-end, z-[60]
- 中文 UI, 日期格式 YYYY-MM-DD
- 30/360 算法: 每月=30天, 每年=360天
- 删除先进回收站（⚠️ 回收站**不**进 Excel 备份，属有意设计）
- ⚠️ **不要写成"数据在 localStorage"**：现在是**云端为唯一权威、本地仅缓存**（见上方产品铁律）。换设备/重装只需登录即恢复，**不需要**导出 Excel 再导入（Excel 仅作离线备份）

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

### 编辑业主合同（2026-09-12 用户确认，有意设计，勿报 bug）
- **编辑业主合同 = 旧账单本来就有误 → 全部删除并重新生成 → 已付记录由用户手动重新认账**（v1.230 起的有意设计，代码注释见 `src/pages/RoomList.tsx`；用户原话："一般不需要编辑业主，既然编辑了，说明账单是错的，自然需要重新认账"）
- 执行细节：删除按 `landlordContractId` 匹配、**不过滤状态**（已付/已收/已退款/已取消一并删除）→ 随后按新合同参数重新生成账单（待付状态）
- 有已付账单时（`status === 'paid'` 的计数 > 0）先弹 danger 二次确认框（文案："已付记录需手动重新认账"）；无已付账单时直接执行（被删的都是会被重新生成的待付/逾期账单）
- 排查时若发现"编辑合同后已付记录消失、需要手动重新认账"，属预期行为，不是 bug

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

### 其它有意设计（勿报 bug）
- **回收站不进 Excel 备份**：导入还原只覆盖业务表，`settings` / `trash` / `auditLogs` 有意不导出
- **部分状态字段允许空值导入**：导入时空值走默认值（如房间状态空 → `vacant`），属容错设计，不是校验漏洞
- **合同编号（displayId）只是给人看的标签**：全项目没有任何地方按它查找/判等实体，关联一律走 UUID `id`；加载时会自动去重（见 `src/lib/display-id.ts`）

## PWA

```bash
npm run build
node pwa-server.cjs
# 手机访问 https://192.168.1.185:5174/
```


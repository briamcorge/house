# 房屋管理系统

最后更新: 2026-09-13（十二处修复：导入白名单 / 编辑业主合同 / 编辑租客合同 / 恢复租客 / 负数账单 / 业主退租表单 / 续约丢电话 / 设备踢出僵尸态 / 业主免租期逐年 / 续约绕过利润门槛 / 拆单期间反置 / effectiveEnd 取错退租金）

## 凭据 & API（非常重要，切勿丢失）

### 云端数据库 (Supabase)
- **URL**: `https://jvpkqqnfzkkcztkbzpdx.supabase.co`
- **Key**: 在 `.env`（`VITE_SUPABASE_ANON_KEY`，gitignore 不入库）；`src/lib/supabase.ts` 只从环境变量读取，无硬编码（2026-08-29 起）
- **说明**: 免费版，数据库 500MB + 文件存储 1GB + 带宽 2GB/月
- **登录**: 邮箱+密码登录（app 内 AuthModal；**手机号验证码登录=付费功能，用户确认不做，勿加**）；修改密码入口在 More 页「设置」菜单（钥匙图标，2026-09-06 加，直接调 updatePassword，不校验旧密码——用户确认不做，勿加）
- **App 账号（调试用）**: `c94138228@163.com`（邮箱+密码登录，非手机验证码；用 API 登录后可查 `user_data` 表；**密码在 `房屋管理系统-使用说明.txt`，不在 AGENTS.md 存明文**——2026-09-06 安全整改，原明文曾随公开仓库泄露）
- **管理令牌 (PAT)**: 已从文档移除（2026-08-28 GitHub Push Protection 拦截：账号级凭据不能入库）；**临时 PAT 在 `房屋管理系统-使用说明.txt`**（2026-09-06 用户提供，30 天有效期，用完撤销；当前已用于执行 SECURITY DEFINER 加固 SQL）
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
- **线上表结构（2026-09-06 实测，勿按旧 DDL 猜）**: `user_data(id uuid PK, user_id uuid UNIQUE REFERENCES auth.users, data jsonb, updated_at timestamptz, last_active_at timestamptz, disabled boolean default false)`，RLS 开启；`last_active_at`/`disabled` 两列 2026-09-06 由 SQL 补加（线上原本只有 4 列）；`admin-sql.sql` 里的 user_id-PK 旧结构未生效
- **L1 覆盖前存档**: 表 `user_data_history`（identity id PK、user_id、data、updated_at_before、reason('overwrite'|'delete')、archived_at），保留 30 天；触发器 `trg_user_data_archive`（BEFORE UPDATE OR DELETE，仅 data 真变才存档；1% 概率清 30 天前旧档）
- **L2 每日全量快照**: 表 `user_data_daily_snapshots`（PK(user_id, snap_date)，含 data/updated_at/taken_at），保留 90 天；函数 `take_user_data_snapshot()` 同日重复执行=覆盖为最新；pg_cron 任务 `house-daily-snapshot` 每天 **22:00 UTC（北京 06:00）** 自动执行
- **A4 DB trigger（已执行）**: `trg_user_data_updated_at` BEFORE INSERT OR UPDATE 强制 `updated_at = now()`（服务器时钟，A4 代码修复的 DB 侧落地；SQL 见 `sql/2026-09-06_updated_at_trigger.sql`）
- **恢复工具（SECURITY DEFINER，还原仅限 is_admin）**: `list_user_data_backups(user_id)` 只读列出备份点；`restore_user_data_from_backup(user_id, kind, at)` 还原（还原会先经 L1 再存档，可逆）。⚠️ 2026-09-06 安全加固：`list_user_data_backups` 已加 `is_admin()` 校验（防 IDOR），所有 SECURITY DEFINER 函数已 `set search_path = public`（`get_all_user_data` 因返回类型与旧版不同需先 drop 再重建）；脚本见 `sql/2026-09-06_security_definer_fix.sql`，已由临时 PAT 在 Dashboard 执行完毕
- **完整可执行脚本**: `E:\DSH\_house-incident-20260906\auto-backup\2026-09-06_auto_backup_L1_L2.sql`（v0.1 DRAFT → 已执行，2026-09-06 实测 2 表 2 触发器 1 cron 全存活）；改/恢复前先读该脚本与 `sql/2026-09-06_updated_at_trigger.sql`
- **注意事项**: 备份表未开 RLS（靠 SECURITY DEFINER 函数隔离访问，直接查表需 service/postgres 权限）；`get_all_user_data` RPC 仍可用调试账号只读核对线上数据

### 导入导出功能排查修复记录（2026-09-06，已修复）
- **排查方式**: 用用户 9-05 实际导出的 Excel（`E:\新项目\房屋管理数据_2026-09-05.xlsx`，6 sheet：房源/房间/代理合同/租客/账单/利润提取，回收站不导出）逐项比对 + 子代理读盘审代码
- **Bug 1（已修，CRITICAL）**: 导入校验 `checkAmount` 拒绝负数金额 → **退押金/退租金/返款等负数账单导入即被丢弃**（实测该文件含 7 条负数账单）。修复：新增 `checkFinite`（仅拒 NaN/Infinity），账单 amount/paidAmount 改用它
- **Bug 2（已修，CRITICAL）**: 同上 `checkAmount` 拒绝负数利润 → **负利润记录导入即被丢弃**（实测含 1 条 -7896）。修复：利润 profitAmount 改用 `checkFinite`
- **Bug 3（已处理）**: 孤儿引用——利润记录 `b6d5102d` 引用不存在的房源 ID `6a2b0087`（三处数据源均无此房源，实为伪造/错误 ID 的重复记录，正确记录是 `ddf2d30c` 引用安贞里一区12号楼1503=`36cf1ce9`）。**已用 PAT 从云端删除 `b6d5102d`**（11→10 条），profitRecords 数组 UPDATE 移除
- **已知低危未修**: ① 重复 ID 不校验 ② 电话号/createdAt 可能被 Excel 转数字（重存后导入类型变化）③ 部分状态字段允许空值导入 ④ 回收站不在备份内（有意设计）
- **改动**: `src/pages/More.tsx`（导入校验），已推送 master；注意：**修复后旧 APK 的导入校验仍是旧逻辑，需装新 APK 才能享受负数账单/负利润导入**

### 编辑合同 / 导入 / 恢复租客 三处静默失败修复（2026-09-13，已修复 → 待发版）
- **背景**: 应要求通读全部源码（14965 行）+ 用真实云端数据核对触发条件，区分「真 bug」与「有意设计」。三项均为"用户以为操作成功了、实际什么都没发生"类问题
- **修复 1 — 导入字符串白名单漏字段**（`src/pages/More.tsx` 的 `STRING_FIELDS`，原为 `new Set(['phone'])`）
  - `landlordPhone` 被兜底 `Number()` 转成数字 → `Home.tsx` 搜索 `c.landlordPhone.includes(q)` 抛 TypeError（整页 ErrorBoundary 白屏）+ `LandlordContractModal` 保存 `landlordPhone.trim()` 抛错（点保存无反应）
  - `description` 被转数字 → `profit.ts` 的 `bill.description?.match(...)` 抛错（**`?.` 只挡 undefined/null，挡不住数字**）→ 利润计算失败
  - 修复: `new Set(['phone', 'landlordPhone', 'description'])`（2026-09-06 那次只补了 `phone`，属漏补）
- **修复 2 — 编辑业主合同确认框点「确定」什么都不执行**（`src/pages/RoomList.tsx`）
  - 根因: `onEditContract` 把表单存进 `editContractPending` 时**漏存 `cid`**，而 `LandlordContractModal` 的 `handleConfirm` 在回调后**立即 `onClose()`** → `setEditContractId(null)`；用户在确认框点确定时再读 `editContractId` 恒为 `null` → `if (!cid) return`
  - 修复: `cid` 一并存入 pending，`onConfirm` 从 pending 解构取用
  - ⚠️ **修复后该功能第一次真正生效**：点确定会真的执行「更新合同 → 删除该合同全部账单（含已付/已收/已退款/已取消）→ 按新合同重新生成待付账单」。这是本文件既有设计，但此前不可达
- **修复 3 — 恢复租客/恢复业主合同时 `description.startsWith` 未判空**（`src/store/useStore.ts`）
  - 真实数据里目标租客有 **11 张 `description === undefined`**（注意：是 undefined，**不是**空字符串也不是数字）的账单 → 必现 TypeError，事件处理内异常不弹提示 → 恢复静默失败
  - 修复: 改 `String(b.description || '').startsWith(...)`。**特意用 `String()` 而非 `?.`**，因为 `?.` 挡不住被导入兜底转成的数字
- **【重要】触发路径澄清（排查时勿再搞错）**
  - `restoreTenant` 的**唯一** UI 入口 = **房间详情 → 已退租租客「操作 ▾ → 恢复」**（`RoomDetail.tsx:290`）；`restoreLandlordContract` = 房源页合同「操作 ▾ → 恢复」（`RoomList.tsx:165`）
  - **回收站的「恢复」走 `restoreFromTrash`（`useStore.ts:711-722`），只把数据原样塞回数组，完全不经过上述 description 过滤** → 故「删除房源 → 回收站恢复租客」**不会**触发本 bug（曾误报为此路径，已更正）
  - 房源删除另有前置守卫（`Properties.tsx:192-203`）：房源下有活跃租客或活跃合同则拒绝删除
- **验证方式（真机之外已做）**: 专用隔离测试账号（见使用说明）+ 真实浏览器端到端。导入后 `landlordPhone` 为 string 且首页搜索命中不崩；编辑合同月租 5425→5430 生效且 4 张账单 ID 全换、状态全 pending；恢复租客后回「在租」、房间回 occupied、窗口无未捕获错误。对照：老表达式在同一批真实账单上抛 TypeError，新表达式不抛
- **未做**: 未跑 `npm run build` / `release`（版本仍 1.291，待用户决定发版时机）；改动已本地 commit `8f563bb`，未推送

### 编辑租客合同 / 负数账单 / 业主退租表单 三处静默失败修复（2026-09-13 第二批，已修复 → 待发版）
- 背景：用户在真实浏览器中逐项复现确认后授权修复。三项均属同一类"走完了完整流程、还给了确认提示，但实际什么都没发生 / 写入了错值"
- **修复 A — 租客管理页「保存合同修改」什么都不执行**（`src/pages/Tenants.tsx` + `src/components/TenantModal.tsx`）
  - 现象：租客管理 → 编辑 → 月租 2750 改 2777 → 下一步 → 「保存合同修改」→ 确认框 → 点「继续，删除并重新生成」→ **数据零变化、无任何报错、弹窗照常关闭**（确认框还谎称"将删除这些账单记录"）
  - 根因：`Tenants.tsx` 给 TenantModal **只传了 `onSave`，没传 `onContractUpdate`**；`TenantModal.doConfirmContract()` 的编辑分支 `onContractUpdate?.(...)` 可选链空转后直接 `onClose()`（`onSave` 是信息页那个「保存」按钮用的另一个函数）
  - 修复：补传 `onContractUpdate` → `editTenantContract(tenantId, tenantData, draftBills, tenantData.roomId)`
  - ⚠️ **配套护栏（勿删）**：`TenantModal` 对非在租（ended / renew）租客**隐藏「下一步」**。原因：`editTenantContract` 会把 status 强制置回 `active`，而**租客管理是唯一能编辑已退租/已续约租客的入口**（RoomDetail 的「编辑」只对 active 显示，RoomList 的 `editingTenantId` 只被赋 null、编辑路径是死代码），不拦会把已结束的旧合同"复活"。已退租租客仍可用「保存」改字段（实测状态保持 ended）
- **修复 B — 负数账单无法编辑、也无法手工补录**（`src/components/BillModal.tsx`）
  - 现象：账单页 →「已退还」筛选 → 打开一张 -2300 退款单 → **只改「备注」** → 保存 → 弹「请输入大于 0 的金额」，弹窗不关、数据不变
  - 根因：`if (amountNum <= 0)` 拒绝负数，**对编辑态无例外**；而金额框被负值预填，所以打开即必然触发
  - 修复：改判 `if (amountNum === 0)`（只拦无意义的空账单），与 2026-09-06 导入侧的 `checkFinite`（仅拒 NaN/Infinity）口径统一
  - 影响面：线上有 **7 张负数账单**（退押金/退租金/返款）此前全部不可编辑
- **修复 C — 业主退租结算表单不重置，上次填的金额泄漏到下一次**（`src/components/LandlordCheckoutModal.tsx`）
  - 现象：同一合同 →「退租」→ 填「退还押金 888 / 违约金 999」→ 取消 → 再点「退租」→ 数字框**仍是 888 / 999**
  - 后果确凿：`RoomList.tsx:433-444` 会用这些值生成真实账单——泄漏的 `penalty` 生成 **+「业主违约金」收入单（type='other'，计入利润）**，泄漏的 `depositRefund` 生成退款单。用户"点开看看、填了点、取消、再看一眼就点确认"即可触发
  - 根因：组件只有 `useState` 挂载初值，**没有 `isOpen` 重置 effect**；而 `RoomList.tsx:424` 是**无条件渲染**（传 `isOpen` 而非条件挂载），组件常驻 → state 跨次打开保留
  - 修复：照 `CheckoutModal.tsx:31-44` 补 `isOpen` 重置 effect，顺带修好**「退还押金」从不预填**（原先第一次打开时提示写着「原押金 ¥8100」而输入框是 0，因为挂载时 `deposit` 还是 undefined）
  - ⚠️ **触发路径澄清（勿再报错）**：**不是**"切换房源"（经房源列表中转会卸载 RoomList、状态重置），而是**同一合同关掉再打开**；且只有**有押金的合同**才走结算弹窗（`RoomList.tsx:163` = `if (c.deposit) 结算弹窗 else 普通确认框`）
- **验证（真实浏览器端到端，隔离测试账号）**：A → 月租 2750→2777 生效、账单 22→12 张且全 pending；B → -2300 退款单改备注保存成功；C → 第一次 `["8100","0","0"]`（已预填）、填 888/999 取消后重开仍 `["8100","0","0"]`；回归 → 已退租租客弹窗无「下一步」、其「保存」仍正常写入且状态保持 ended
- 未做：未 `npm run build` / `release`（版本仍 1.291）

### 续约丢业主电话 / 设备踢出僵尸态 两处修复（2026-09-13 第三批，已修复 → 待发版）
- **修复 A — 续约业主合同时业主电话被抹掉**（`src/pages/RoomList.tsx:415`）
  - 现象：业主合同一旦填了电话，每次「续约」产生的新合同电话都变 `undefined`（旧合同仍保留原电话）
  - 根因：`existingPhone` 的取值只判断 `editContractId`，而同处其余五个 `existingXxx` 字段都是 `editContractId || renewContractId` → 续约时传 `undefined` → 弹窗 `setLandlordPhone('')`，而电话框在该模式下是 `disabled`（`LandlordContractModal.tsx:327`，设计上续约时只读）→ **用户既看不到原电话也填不进去** → 保存时 `landlordPhone.trim() || undefined` 落库为 `undefined`
  - 修复：把 `existingPhone` 的条件对齐其余字段（一行）。**未改 `disabled` 设计**（续约时电话仍只读，只是现在会正确预填并保住了）
  - 实测：续约 DL-0001（电话 13800138000）→ 修复前新合同电话为 `undefined`；修复后保留 `"13800138000"`；弹窗内电话框由空值变为预填
- **修复 B — 设备踢出时若 signOut 失败会留下「僵尸设备」**（`src/App.tsx`）
  - 现象：被踢设备在退出登录请求失败时，本地会话残留，而设备锁已被**无条件**删除
  - **实测确认**（浏览器内强制 `/auth/v1/logout` 失败）：`signOut({scope:'local'})` 返回 `AuthRetryableFetchError` 且**会话键原样残留**（未走 `_removeSession()`）
  - 危害：该设备**同时失去两个守卫**——轮询的 `if (!myToken) return`（`App.tsx`）与保存前的 `if (myToken)`（`cloud-sync-context.tsx:221`）双双失效 → 它再也不会发现自己被踢，会**无限期正常保存**，每次整档 upsert 都可能盖掉另一台设备的新数据（原代码注释称「僵尸实例」）
  - 修复：`signOutLocalTraced` 改为返回 Promise；`device-kicked` 处理改为**只在 `listSbSessionKeys()` 为空（会话确实清掉）时才删锁**，否则保留锁并写 auth-diag，让锁不匹配持续存在 → 下轮轮询 / 下次保存继续重试踢出，直到登出成功
  - **明确未动**：A2 的「有 dirty 才推送、推完再踢」逻辑（2026-09-06 用户定的）一行不改；本次只改「什么时候删锁」
  - 取舍：持续失败时设备会反复重试踢出、可能一直显示同步错误提示——把「静默放行到云端」换成「失败即拦住并重试」（fail-closed）
  - 实测（处理器执行已由 auth-diag 证实）：失败分支 → 日志 `device-kicked踢出未完成｜会话残留，保留设备锁以便下轮重试踢出`，锁与会话均保留 ✅；成功分支 → `signOut[device-kicked踢出] 成功且会话已清` + `SIGNED_OUT 事件`，会话与锁均清除 ✅（与修复前行为一致）
  - **局限**：**未实演双设备完整互踢场景**（需两台真机 + 恰好在踢出瞬间网络失败）；以上为逐环验证 + 单设备分支实测
- 未做：未 `npm run build` / `release`（版本仍 1.291）

### 业主合同免租期「每年统一 / 逐年」修复（2026-09-13 第四批，已修复 → 待发版）
- **背景（用户实际场景，2026-09-13 明确）**：① 1 年期合同（免租固定或不固定）② 多年合同且免租**每年固定** ③ 多年合同且免租**每年不同**（需逐年单独填）。原实现对 ②③ 都不成立
- **缺陷 1（单数字名不副实）**：`types/index.ts:96` 与 UI 注释（`:72`）都写明 `number：每年统一`，但 `getVacancyPerYearDays` 对单数字返回 `[v]`（只有 1 项），再配合扣减循环的 `?? remaining[remaining.length-1] ?? 0`（读的是**已被消费成 0** 的同一个数组元素）→ **只第 1 年免租**
  - 实测：DL-0004（2 年期季付、月租 8100、满额 24300/期）填 30 → 房租各期 `[16200, 24300×3, 24300×4]`，**第 2 年全年满额**（白丢 30 天 = 8100 元）
- **缺陷 2（行数永远追不上合同年数）**：勾「按年设置」后行数从 1 行起，而「+ 添加年份」每加一行会**同时把合同结束日延长 360 天**（`:491-494` 注释称有意）→ **缺口恒等于「打开弹窗时合同年数 − 当时行数」，点多少次都缩不小**
  - 实测：DL-0004（2 年 / 1 行）→ 点 1 次 = 3 年/2 行、点 2 次 = 4 年/3 行，缺口始终为 1（第 4 年全天满额）
- **修复（全部在 `src/components/LandlordContractModal.tsx`）**
  1. `getVacancyPerYearDays(yearCount)` 出口保证与合同年数等长：单数字 → 铺满同一个值；按年 → 逐项取值，**缺项按 0（不免租）**
  2. 扣减循环 fallback 由 `?? remaining[remaining.length-1] ?? 0` 改为 `?? 0`。**不再"沿用最后一年"**：该语义会污染 `[30, 0, 15]` 里明确的 `0`，且原实现读的是已消费元素、"沿用"从未真正生效。（导入侧 `More.tsx:693` 的注释本就写明"0 值必须保留（某年无免租）"，与此一致）
  3. 勾「按年设置」时**行数自动等于合同年数**（新增 effect；`contractYearCount()` 与 `periodsPerYearOf()` 供表单与扣减共用，避免口径分叉）
  4. **移除「+ 添加年份」按钮**（用户确认不必保留）→ 合同期限此后**只由「合同结束」日期决定**，不再可能在配免租期时被静默改动
  5. 免租期标签下加提示文案「**不勾：每年都用此天数；勾选：逐年单独填**」（此前该开关语义未在界面呈现，是踩坑诱因之一）
- **影响面（已逐项核实并实测）**：仅影响**业主应付房租账单**的生成（免租扣减本就只作用于此）→ 进而 `landlordExpense` → 利润。**只在该合同重新生成账单时生效**（编辑合同 / 续约 / 新签）；**已存在的账单不会被自动改动**
  - **会变**：多年期 + 单数字（改为每年都免 → 应付变小 → 利润变高）
  - **不变**：1 年期（数组长度恒为 1）、按年设置且行数足够、未填免租期。线上 3 个带免租期的合同（DL-0006/0007/0009）**都是 1 年期** → 已实测新预览与旧账单逐期一致
  - `profit.ts` **一行未动**；租客应收账单路径未动；Excel 导入导出形态规则未动（导入侧专门解析逗号数组且保留 0 值，导出再导入不丢配置）
  - 形态变化：**多年期 + 单数字**保存时由「数字」变为「数组」（`30` → `[30,30]`）——语义如此，且导入能正确解析回数组
- **实测（隔离测试账号 + 真实浏览器）**：DL-0004（2 年期）①不勾单数字 30 → 两年首期均为 16200 ✅ ③按年 30/15 → 第 2 年首期为 20250 ✅ ④按年 30/0 → 第 2 年为 24300（明确不免）✅；勾选后行数自动 = 2 ✅；「+ 添加年份」已消失 ✅；提示文案已渲染 ✅；回归 DL-0006（1 年期）新预览与旧账单 `[10400,15600,15600,15600]` 逐期一致 ✅
- 未做：未 `npm run build` / `release`

### A 档三项修复：续约绕过利润门槛 / 拆单期间反置 / effectiveEnd 取错退租金（2026-09-13 第五批，已修复 → 待发版）
- 背景：用户要求「仔细核实真实性」，三项均先用**应用自身的真实函数**（`calculatePeriodProfit` / `calcCoveredPeriodEnd`）配真实数据核实、再动手
- **A1 — 续约租客绕过「未交齐不能提取利润」门槛**（`src/utils/profit.ts`，⚠️ 红线区）
  - 根因：过滤条件只写 `tenant.status === 'ended'`，而**续约（renew）租客同为 `ended`** → 其未付账单被整段剔除 → `expectedRent` 归零 → `allPaid` 保持 true → **More 页放行提取**（同时少算预估利润）
  - 实测（真实函数，同一张未收房租只改租客状态）：①`active` → allPaid=false ②`ended/renew` → **修复前 true（能提取）**、修后 false ✅ ③`ended/checkout` → true（设计如此，行为不变）④`ended`（无 endReason）→ false（保守分支）
  - 修复：条件改为 `tenant.status === 'ended' && tenant.endReason === 'checkout'`。`endReason` 为空的历史数据（线上 3 条）走「不剔除」的保守分支，与「旧数据宁可多显示未收」的既有口径一致
  - 同类错误（把 renew 当 checkout）已在 `normalizeCloudData` 与 `migrate v2→v3` 修过，**这是第三处漏网**
- **A2 — 拆单剩余期间可反置（start > end）**（`src/pages/Bills.tsx` + `src/pages/RoomDetail.tsx`，两处同源）
  - 根因：剩余期间写死为 `{本次收款结束日+1, 原账单结束日}`，**无 start ≤ end 校验**；而实收金额接近全额（≥ 约 **99.4%**）时 `calcCoveredPeriodEnd` 会**取整到原结束日**（真实函数实测：8999/9000、8990/9000 均返回原结束日）→ 剩余区间反置（如 `12-04 ~ 12-03`）
  - 后果（真实函数实测）：反置期间的房租**收入按 0 计**（`days360` 的 `oStart > oEnd` 防御）→ 该期房租在利润里凭空消失
  - ⚠️ **此前误判已更正**：`expectedRent/paidRent` **不受影响**（`billOverlapsCycle` 只把两个端点各自与周期边界比较、**不比较 start ≤ end**），所以 `allPaid` 门槛正常——**不是**「未交齐也能提取」
  - 修复：仅在 `start <= origEnd` 时才写剩余期间；否则保持原元数据（此时两张账单共用原期间，覆盖期相加正好等于整期）
  - 实测（**UI 实操**）：对一张 12000 元季租（2026-10-04 ~ 2026-12-03）实收 11990 → 剩余账单期间保持 `2026-10-04 ~ 2026-12-03`（修复前会是 `2026-12-04 ~ 2026-12-03`），**全库反置账单 0**
- **A4 — `effectiveEnd` 取数组第一条退租金**（`src/utils/profit.ts`，⚠️ 红线区）
  - 根因：用 `.find()` 取 `allBills` 里第一条负数 rent 账单＝**数组顺序（创建顺序）**，属未定义行为。同一租客有多张退租金（中途调整 + 退租结算）时会被**最早**那张提前截断，后续周期的房租分摊被大幅少算
  - 实测（真实函数，只调换两张退租金的数组顺序）：`tenantIncome` **100 vs 24100（相差 241 倍）**
  - 修复：改为遍历取**起始日最晚**的那张，语义＝「房租实际交到的最后一天」（用户确认采用此口径）。修复后两种顺序均得 24100 ✅
- **影响面**：三项只影响**利润计算**与**收款时写入的剩余期间**，不新增/删除任何账单、不改任何金额
- 验证：`npx tsc --noEmit` 退出码 0；A1/A4 用应用真实函数对照；A2 走真实 UI 收款并校验全库无反置期间；测试账号数据已复位（9 房源 / 19 房间 / 28 租客 / 208 账单）
- 未做：未 `npm run build` / `release`

### 已知数据质量问题（2026-09-13 实测发现，未修）
- **两个租客共用同一个 `displayId`**：线上真实数据中 `ZL-0012` 同时属于 `8f3ec210…`（梁佳铭，5 张账单）与 `ce7fdde4…`（刘红秋，17 张账单）
- 这是本文件「导入已知低危未修」第 ① 条「重复 ID 不校验」的实例，**已真实存在于生产数据**，不只是理论风险；界面上会出现两行同名编号难以区分。`nextDisplayId` 已扫描 tenants + 回收站防新增重复，但既有重复不会被清理

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
3. 更新 build.gradle 的 versionCode/versionName 与 version.ts 对齐
4. Copy APK 到桌面
```

### 之前踩过的坑（避免再犯）
1. ~~`VITE_BASE` 忘记设 `./` → 白屏~~ ✅ 已修复：`build` 默认 `--base=./`
2. ~~`npx cap copy` 忘记跑 → APK 里还是旧代码~~ ✅ 已修复：`release` 命令包含 cap copy
3. ~~`dist/assets/` 旧文件堆积 → APK 膨胀到 3.3MB~~ ✅ 已修复（sync 1.234 起）：`build` 先跑 `scripts/clean-dist.cjs` 清理 dist（rmSync + cmd rmdir 双保险，解决 Windows 占用文件静默失败）
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
**Bill**: amount, type(rent|water|electric|gas|other), status(pending|paid|overdue|cancelled|refunded), direction(payable|receivable), dueDate, paidDate
**PaymentMethod**: monthly | quarterly | semi-annual | annual

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

## PWA

```bash
npm run build
node pwa-server.cjs
# 手机访问 https://192.168.1.185:5174/
```

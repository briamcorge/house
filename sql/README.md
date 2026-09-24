# SQL 目录状态说明（2026-09-12 核验；2026-09-24 策略清理增补）

> 本 README 是 house 项目全部 SQL 脚本的**状态总表**，用于避免"按旧脚本排查/执行"造成误判。
> 核验方式：逐语句对照线上真实结构导出 + 全仓库引用审计 + git 历史核实（2026-09-12）。
> 2026-09-24 增补：清理 9 条重复 RLS 策略（19→10），前后行为测试逐项一致；当前策略以 `sql/2026-09-24_cleanup_duplicate_rls_policies.sql` 末尾导出为准。

## 唯一权威（ground truth）

| 文件 | 说明 |
|---|---|
| `sql/2026-09-12_live_rls_functions_dump.sql` | **线上真实结构导出**（5 表 / 19 策略 / 10 函数 / 2 触发器；只读导出，非迁移脚本）。排查数据库问题的第一参照。⚠️ 目前未被 git 跟踪（untracked），建议入库。⚠️ **策略部分已过时**：原 19 条策略经 2026-09-24 清理为 10 条（见清理脚本） |

## 全部 SQL 文件状态

| 文件 | 状态 | 说明 |
|---|---|---|
| `sql/2026-09-12_live_rls_functions_dump.sql` | ⭐ 权威（策略部分除外） | 线上真相快照（见上） |
| `sql/2026-09-06_security_definer_fix.sql` | ✅ 有效（已执行） | 5 个 SECURITY DEFINER 函数加固；与线上逐字一致 |
| `sql/2026-09-06_updated_at_trigger.sql` | ✅ 有效（已执行） | `trg_user_data_updated_at` 触发器 + 函数；与线上一致 |
| `sql/2026-09-24_cleanup_duplicate_rls_policies.sql` | ✅ 已执行（2026-09-24） | 清理 9 条重复策略（active_sessions 6 + user_data 3），19→10；含逐条回滚脚本；前后行为测试逐项一致 |
| `sql/create_active_sessions.sql` | ⚠️ 表结构有效 / 策略段历史 | 建表与线上一致；其 3 条中文策略 2026-08-23 重跑后曾与 3 条英文策略并存（重复），2026-09-24 已清理——**线上现仅存这 3 条中文策略**。**勿再整段重跑策略部分** |
| `admin-sql.sql`（根目录） | ⚠️ 部分过时（勿整体重跑） | `user_data` 建表（user_id PK 旧结构）与 `users_own_data`（含 `not disabled`）与线上不符；**但** `admin_users` 表、`users_can_check_own_admin` / `admins_read_all` 策略是线上对象的仓库唯一定义源（4 个函数另在 security_definer_fix.sql 有副本，与线上一字不差） |
| `supabase-migration.sql`（根目录） | ⚠️ 部分过时（仅参考） | 最接近线上的 `user_data` 建表记录（缺 `last_active_at` 列）；`users_own_data` 策略含 `not disabled` 与线上不符 |
| `supabase-fix.sql`（根目录） | ❌ 已被取代（勿执行） | 本文件全部 5 条 CREATE POLICY 在线上 **0 命中**；线上对应策略现为 `users_own_data` / `admins_read_all`（`user_data_*_own` 三条已于 2026-09-24 清理）。**仅作历史参考** |
| `sql/fix_active_sessions_rls.sql` | ❌ 历史脚本（勿执行） | 3 条英文策略已于 2026-09-24 清理（回滚定义见清理脚本）；其 DROP 目标（3 条中文策略）为线上现存版本；重跑会重复/失败，**勿执行** |

## 关键事实（排查时注意）

1. **线上 `users_own_data` 不含 `disabled` 门槛**——`supabase-fix.sql`（2026-08-29 提交）曾计划加 `not disabled`，但从未上线；被停用用户仍可读写自己的数据（由前端登录踢出逻辑负责拦截，"停用仅前端生效"）。
2. **`active_sessions` 策略已于 2026-09-24 清理为 3 条**（中文命名：写/查/更新自己的设备锁）；原 9 条中的英文 3 条与 `user_can_*` 3 条（仓库无来源、疑手工创建）已删除；清理前后行为测试（模拟登录用户读/写/越权/未登录）逐项一致。
3. **仓库无脚本定义的线上对象**（仅存在于 live dump）：`user_data_history` / `user_data_daily_snapshots` 两张表；`take_user_data_snapshot` / `archive_user_data_history` / `restore_user_data_from_backup` / `rls_auto_enable` 函数；`trg_user_data_archive` 触发器。
4. **无任何 CI / 脚本 / 代码依赖这些 SQL 文件**（`deploy.yml` 只构建前端；`scripts\`、`src\` 零引用）。SQL 只在人工排查/维护时使用。
5. 维护约定：新增或修改 SQL 脚本时，同步更新本表；涉及线上执行前，先用 Management API 查证线上现状（参考 dump 或重新导出）。

## 核验日期

2026-09-12（对照基准：`sql/2026-09-12_live_rls_functions_dump.sql`）
2026-09-24 增补：清理重复策略（19→10），前后行为一致；当前策略清单见 `sql/2026-09-24_cleanup_duplicate_rls_policies.sql` 末尾导出。

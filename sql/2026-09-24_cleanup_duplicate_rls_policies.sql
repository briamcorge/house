-- ============================================================
-- 清理重复 RLS 策略（2026-09-24）
-- ============================================================
-- 背景：active_sessions / user_data 上存在历史累积的重复策略（条件完全相同、不同时期
--       以不同命名重复创建）。本脚本仅做「整洁化清理」：每个 (表, 命令) 保留一条
--       条件相同的策略，生效权限完全不变。
--       历史来源说明见 sql/README.md「关键事实」：
--         - 3 条英文策略（*_own_session）来自 fix_active_sessions_rls.sql
--         - 3 条中文策略在 2026-08-23 经 create_active_sessions.sql 重跑后并存
--         - user_can_* 三条疑似手工创建，仓库任何脚本均无来源
--
-- 执行前状态（2026-09-24 实测，public 共 19 条策略）：
--   active_sessions: insert_own_session / user_can_insert_own / 用户写自己的设备锁
--                    select_own_session / user_can_select_own / 用户查自己的设备锁
--                    update_own_session / user_can_update_own / 用户更新自己的设备锁
--   user_data: users_own_data(ALL) / user_data_insert_own / admins_read_all
--              / user_data_select_own / user_data_update_own
--   user_data_history: own_history_insert / own_history_read
--   user_data_daily_snapshots: own_daily_insert / own_daily_read
--   admin_users: users_can_check_own_admin
--
-- 执行后状态（应为 10 条；逐条导出见文件末尾）：
--   active_sessions: 用户写自己的设备锁 / 用户查自己的设备锁 / 用户更新自己的设备锁
--   user_data: users_own_data / admins_read_all
--   （其余表不变）
--
-- 等价性依据（逐条核对）：
--   1) 被删策略与保留策略谓词逐字一致（auth.uid() = user_id）；permissive 策略按 OR
--      合并 → 生效集合不变。
--   2) `public` 角色版（user_can_* / user_data_*_own）在未登录（anon，auth.uid() 为
--      NULL）下条件恒不成立 → 删掉不会让 anon 多出或失去任何权限。
--   3) user_data 的三条单项策略（insert/select/update）被 users_own_data（ALL，
--      同条件）完全覆盖 → 删除后各命令（含 DELETE）权限不变。
--   4) DELETE：active_sessions 前后均无 DELETE 策略；user_data 的 DELETE 由
--      users_own_data 保留。
--   行为验证：已用 set role authenticated + JWT claims 模拟登录用户，对清理前后
--   各跑同一组读/写/越权测试，结果一致（记录见提交对话）。
--
-- 执行方式：Management API
--   POST https://api.supabase.com/v1/projects/jvpkqqnfzkkcztkbzpdx/database/query
-- ============================================================

-- 1) active_sessions：保留 3 条中文命名策略，删除 6 条重复
drop policy if exists "insert_own_session" on public.active_sessions;
drop policy if exists "user_can_insert_own" on public.active_sessions;
drop policy if exists "select_own_session" on public.active_sessions;
drop policy if exists "user_can_select_own" on public.active_sessions;
drop policy if exists "update_own_session" on public.active_sessions;
drop policy if exists "user_can_update_own" on public.active_sessions;

-- 2) user_data：保留 users_own_data(ALL) 与 admins_read_all，删除 3 条单项重复
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;

-- ============================================================
-- 回滚脚本（如需恢复被删策略，取消注释逐条执行；条件与删除前逐字一致）
-- ============================================================
-- create policy "insert_own_session" on public.active_sessions for insert to authenticated with check (auth.uid() = user_id);
-- create policy "user_can_insert_own" on public.active_sessions for insert to public with check (auth.uid() = user_id);
-- create policy "select_own_session" on public.active_sessions for select to authenticated using (auth.uid() = user_id);
-- create policy "user_can_select_own" on public.active_sessions for select to public using (auth.uid() = user_id);
-- create policy "update_own_session" on public.active_sessions for update to authenticated using (auth.uid() = user_id);
-- create policy "user_can_update_own" on public.active_sessions for update to public using (auth.uid() = user_id);
-- create policy "user_data_insert_own" on public.user_data for insert to public with check (auth.uid() = user_id);
-- create policy "user_data_select_own" on public.user_data for select to public using (auth.uid() = user_id);
-- create policy "user_data_update_own" on public.user_data for update to public using (auth.uid() = user_id);

-- ============================================================
-- 执行后线上策略逐条导出（2026-09-24 核验，共 10 条）
-- 行为核验：清理前后各跑同一套测试（模拟 authenticated 读/写/越权、
--   anon 可见性、越权 insert），输出逐项一致。
-- ============================================================
-- active_sessions : 用户写自己的设备锁   (INSERT, authenticated, with check: auth.uid() = user_id)
-- active_sessions : 用户查自己的设备锁   (SELECT, authenticated, using: auth.uid() = user_id)
-- active_sessions : 用户更新自己的设备锁 (UPDATE, authenticated, using: auth.uid() = user_id)
-- user_data       : users_own_data       (ALL, public, using + check: auth.uid() = user_id)
-- user_data       : admins_read_all      (SELECT, public, using: auth.uid() IN (SELECT user_id FROM admin_users))
-- user_data_history        : own_history_insert / own_history_read
-- user_data_daily_snapshots: own_daily_insert  / own_daily_read
-- admin_users              : users_can_check_own_admin

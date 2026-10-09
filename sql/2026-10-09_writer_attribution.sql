-- ============================================================================
-- 2026-10-09 写入者归因（attribution）
--
-- 背景：2026-10-09 发生第五次云同步覆盖事故。事后调查能重建「改了什么」
--       （靠 user_data_history 的完整快照对比），但无法回答「是哪台设备写的」——
--       归档里没有任何设备字段，导致只能靠时间戳反推。
--
-- 本脚本只做归因，不加任何写入拦截/守卫（用户明确要求「只做归因」）：
--   1. user_data 加 last_writer           —— 最后一次写入的设备会话 token
--   2. user_data_history 加 writer        —— 被替换掉的那份数据是谁写的
--   3. user_data_history 加 writer_next   —— 本次覆盖是谁发起的
--   4. 替换 archive_user_data_history()，把上面两个值一并归档
--
-- 配套前端改动：src/lib/supabase.ts 的 saveCloudData upsert 带上 last_writer
--   （取值 localStorage.device_session_token，与 active_sessions.session_token 同源）
--
-- 已验证（2026-10-09，测试账号）：

--   受控写入 → 归档 id=57 记录 writer=PROBE-DEVICE-VERIFY /
--   writer_next=PROBE-DEVICE-VERIFY-DATA ✅，测试账号数据已回滚
--
-- 执行状态：已由临时 PAT 在 2026-10-09 执行完毕（本文件为存档）
-- 回滚方式见文件末尾
-- ============================================================================

-- ── 1) user_data 加 last_writer ──────────────────────────────────────────────
alter table public.user_data
  add column if not exists last_writer text;

comment on column public.user_data.last_writer is
  '最后一次写入的设备会话 token（来自客户端 localStorage.device_session_token）';

-- ── 2) user_data_history 加归因列 ───────────────────────────────────────────
alter table public.user_data_history
  add column if not exists writer text;

alter table public.user_data_history
  add column if not exists writer_next text;

comment on column public.user_data_history.writer is
  '被替换掉的那份数据是由哪台设备写入的（old.last_writer）';

comment on column public.user_data_history.writer_next is
  '本次覆盖是由哪台设备发起的（new.last_writer）；DELETE 时为 null';

-- ── 3) 替换归档函数，带上归因 ───────────────────────────────────────────────
-- 注意：归档条件与 1% 保留期清理逻辑保持与原实现完全一致，只多写两个字段。
create or replace function public.archive_user_data_history()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' or old.data is distinct from new.data then
    insert into public.user_data_history
      (user_id, data, updated_at_before, reason, writer, writer_next)
    values (
      old.user_id,
      old.data,
      old.updated_at,
      case when tg_op = 'DELETE' then 'delete' else 'overwrite' end,
      old.last_writer,
      case when tg_op = 'DELETE' then null else new.last_writer end
    );
  end if;
  if random() < 0.01 then
    delete from public.user_data_history where archived_at < now() - interval '30 days';
  end if;
  return coalesce(new, old);
end;
$function$;

-- ── 4) 事后查证用的一条 SQL ─────────────────────────────────────────────────
-- 定位「某次覆盖是哪台设备干的」：
--
--   select id, archived_at, reason, writer, writer_next,
--          jsonb_array_length(coalesce(data->'bills','[]'::jsonb))   as bills,
--          jsonb_array_length(coalesce(data->'tenants','[]'::jsonb)) as tenants
--   from user_data_history
--   where user_id = '<uid>'
--   order by id desc limit 20;
--
-- 定位「某台设备最后一次写云端是什么时候」：
--
--   select max(archived_at) from user_data_history
--   where user_id = '<uid>' and writer_next = '<device_session_token>';


-- ============================================================================
-- 回滚（若不需要归因）
--
--   create or replace function public.archive_user_data_history()
--    returns trigger language plpgsql security definer set search_path to 'public'
--   as $function$
--   begin
--     if tg_op = 'DELETE' or old.data is distinct from new.data then
--       insert into public.user_data_history (user_id, data, updated_at_before, reason)
--       values (old.user_id, old.data, old.updated_at,
--               case when tg_op = 'DELETE' then 'delete' else 'overwrite' end);
--     end if;
--     if random() < 0.01 then
--       delete from public.user_data_history where archived_at < now() - interval '30 days';
--     end if;
--     return coalesce(new, old);
--   end;
--   $function$;
--
--   alter table public.user_data_history drop column if exists writer_next;
--   alter table public.user_data_history drop column if exists writer;
--   alter table public.user_data          drop column if exists last_writer;
-- ============================================================================

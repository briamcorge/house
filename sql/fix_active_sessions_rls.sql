-- 先删旧策略（如果有）
drop policy if exists "用户查自己的设备锁" on active_sessions;
drop policy if exists "用户写自己的设备锁" on active_sessions;
drop policy if exists "用户更新自己的设备锁" on active_sessions;

-- 确保 RLS 已启用
alter table active_sessions enable row level security;

-- 重新创建策略（英文命名）
create policy "select_own_session"
  on active_sessions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert_own_session"
  on active_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "update_own_session"
  on active_sessions for update
  to authenticated
  using (auth.uid() = user_id);

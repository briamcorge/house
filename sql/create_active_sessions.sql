-- 创建设备锁表（严格单设备登录）
create table if not exists active_sessions (
  user_id uuid references auth.users primary key,
  session_token text not null,
  updated_at timestamptz default now()
);

-- 允许登录用户读写自己的记录
alter table active_sessions enable row level security;

create policy "用户查自己的设备锁"
  on active_sessions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "用户写自己的设备锁"
  on active_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "用户更新自己的设备锁"
  on active_sessions for update
  to authenticated
  using (auth.uid() = user_id);

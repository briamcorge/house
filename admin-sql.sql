-- 0. 如果 user_data 表不存在则创建
create table if not exists user_data (
  user_id uuid references auth.users(id) primary key,
  data jsonb not null default '{}',
  updated_at timestamptz default now(),
  last_active_at timestamptz,
  disabled boolean default false
);

alter table user_data enable row level security;

-- 用户只能看到/修改自己的数据（被停用用户无权访问自己的行）
drop policy if exists "users_own_data" on user_data;
create policy "users_own_data" on user_data
  for all using (auth.uid() = user_id and not disabled);

-- 管理员可以看到所有 user_data
drop policy if exists "admins_read_all" on user_data;
create policy "admins_read_all" on user_data
  for select using (auth.uid() in (select user_id from admin_users));

-- 2. 给 user_data 表加字段（如果还没有）
alter table user_data add column if not exists last_active_at timestamptz;
alter table user_data add column if not exists disabled boolean default false;
create table if not exists admin_users (
  user_id uuid references auth.users(id) primary key,
  created_at timestamptz default now()
);

alter table admin_users enable row level security;

-- 用户可以查看自己是否是管理员
create policy "users_can_check_own_admin" on admin_users
  for select using (auth.uid() = user_id);

-- 3. 检查当前用户是否是管理员
-- 安全：SECURITY DEFINER 必须固定 search_path（2026-09-06 加固，防 search_path 劫持提权）
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- 4. 管理员获取所有用户数据（含 last_active_at 和 disabled）
create or replace function get_all_user_data()
returns table(user_id uuid, email text, data jsonb, updated_at timestamptz, last_active_at timestamptz, disabled boolean)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email, d.data, d.updated_at, d.last_active_at, coalesce(d.disabled, false)
  from public.user_data d
  join auth.users u on u.id = d.user_id
  where (select public.is_admin())
  order by d.updated_at desc nulls last;
$$;

-- 5. 更新最后活跃时间
create or replace function update_last_active()
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.user_data set last_active_at = now() where user_id = auth.uid();
  select true;
$$;

-- 6. 管理员停用/启用用户（仅管理员可执行，防止普通用户越权修改他人 disabled 状态）
create or replace function set_user_disabled(target_user_id uuid, is_disabled boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_data set disabled = is_disabled where user_id = target_user_id and (select public.is_admin());
$$;

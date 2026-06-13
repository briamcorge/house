-- 1. 管理员用户表
create table if not exists admin_users (
  user_id uuid references auth.users(id) primary key,
  created_at timestamptz default now()
);

alter table admin_users enable row level security;

-- 用户可以查看自己是否是管理员
create policy "users_can_check_own_admin" on admin_users
  for select
  using (auth.uid() = user_id);

-- 管理员可以看到所有 user_data
create policy "admins_read_all" on user_data
  for select
  using (auth.uid() in (select user_id from admin_users));

-- 检查当前用户是否是管理员
create or replace function is_admin()
returns boolean
language sql
security definer
as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- 管理员获取所有用户数据
create or replace function get_all_user_data()
returns table(user_id uuid, email text, data jsonb, updated_at timestamptz)
language sql
security definer
as $$
  select u.id, u.email, d.data, d.updated_at
  from user_data d
  join auth.users u on u.id = d.user_id
  where (select is_admin())
  order by d.updated_at desc nulls last;
$$;

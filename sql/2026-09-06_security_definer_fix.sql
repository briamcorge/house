-- ============================================
-- 2026-09-06 安全加固 P1：SECURITY DEFINER 函数修复
-- 在 Supabase Dashboard → SQL Editor 执行
-- ============================================

-- ── H6: admin-sql.sql 的 4 个函数加 set search_path + schema 限定 ──
-- 原理：SECURITY DEFINER 以 postgres 身份执行，若 search_path 未固定，
-- 攻击者可在可写 schema（如 pg_temp）放同名对象劫持实现提权。

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.get_all_user_data()
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

create or replace function public.update_last_active()
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.user_data set last_active_at = now() where user_id = auth.uid();
  select true;
$$;

create or replace function public.set_user_disabled(target_user_id uuid, is_disabled boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_data set disabled = is_disabled where user_id = target_user_id and (select public.is_admin());
$$;

-- ── H1: list_user_data_backups 加 is_admin 校验（防 IDOR：任意用户枚举他人备份元数据）──
-- 改为 plpgsql 以支持 is_admin 判断；仅管理员可列出任意用户备份点
create or replace function public.list_user_data_backups(p_user_id uuid)
returns table (kind text, at_time timestamptz, source_updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'permission denied';
  end if;
  return query
    select 'history'::text, archived_at, updated_at_before
      from public.user_data_history where user_id = p_user_id
    union all
    select 'daily'::text, taken_at, updated_at
      from public.user_data_daily_snapshots where user_id = p_user_id
    order by 2 desc;
end;
$$;

-- ── 验证：应全部返回 security definer + search_path 固定 ──
select p.proname, p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'get_all_user_data', 'update_last_active', 'set_user_disabled', 'list_user_data_backups', 'restore_user_data_from_backup')
order by p.proname;
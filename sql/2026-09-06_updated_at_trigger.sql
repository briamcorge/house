-- ============================================
-- 2026-09-06 事故修复 A4：user_data.updated_at 改为数据库服务器时钟
-- ============================================
-- 背景：saveCloudData 在写入 payload 中显式带 updated_at = 客户端时钟
-- （supabase.ts upsert），所有历史 SQL 均无 updated_at trigger →
-- 云端 updated_at = 上次写入设备的墙钟。跨设备比较（dirtyAt vs 云端
-- updated_at）建立在各自墙钟上：某台设备时钟偏快/后写入即被误判为
-- "云端更新"，导致"内容更新但时间戳更早"的真实数据被旧档覆盖
-- （9-05 网页版 00:43 用更晚时钟写入旧档覆盖手机最新数据）。
--
-- 执行方式：Supabase Dashboard → SQL Editor 运行一次（本仓库无法远程 DDL）。
-- 执行后即使客户端仍传 updated_at，也会被 trigger 覆盖为服务器 now()。
-- ============================================

create or replace function public.touch_user_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_data_updated_at on public.user_data;
create trigger trg_user_data_updated_at
before insert or update on public.user_data
for each row execute function public.touch_user_data_updated_at();

-- 验证（应看到 BEFORE INSERT OR UPDATE 行）：
-- select tgname, tgtype, pg_get_triggerdef(oid) from pg_trigger
-- where tgname = 'trg_user_data_updated_at';

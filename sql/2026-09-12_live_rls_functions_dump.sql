-- =================================================================
-- LIVE DATABASE TRUTH  (auto-dumped via Supabase Management API)
-- Project ref : jvpkqqnfzkkcztkbzpdx
-- Dumped at   : 2026-09-12 14:08:06 (Asia/Shanghai)
-- Source      : POST /v1/projects/{ref}/database/query  (read-only)
-- WHY THIS FILE EXISTS:
--   The repo files admin-sql.sql / supabase-fix.sql / supabase-migration.sql
--   do NOT match what is actually live. The live user_data policies are
--   user_data_select_own / user_data_insert_own / user_data_update_own /
--   users_own_data / admins_read_all, and NONE of them check "disabled".
--   This dump is the source of truth as of the date above.
-- =================================================================

-- ---------- RLS status per public table ----------
--   active_sessions: rowsecurity=True force=False
--   admin_users: rowsecurity=True force=False
--   user_data: rowsecurity=True force=False
--   user_data_daily_snapshots: rowsecurity=True force=False
--   user_data_history: rowsecurity=True force=False

-- ---------- RLS policies ----------

-- table: active_sessions
CREATE POLICY "insert_own_session" ON public."active_sessions" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "select_own_session" ON public."active_sessions" FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "update_own_session" ON public."active_sessions" FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "user_can_insert_own" ON public."active_sessions" FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "user_can_select_own" ON public."active_sessions" FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "user_can_update_own" ON public."active_sessions" FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "用户写自己的设备锁" ON public."active_sessions" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "用户更新自己的设备锁" ON public."active_sessions" FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "用户查自己的设备锁" ON public."active_sessions" FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- table: admin_users
CREATE POLICY "users_can_check_own_admin" ON public."admin_users" FOR SELECT TO public USING ((auth.uid() = user_id));

-- table: user_data
CREATE POLICY "admins_read_all" ON public."user_data" FOR SELECT TO public USING ((auth.uid() IN ( SELECT admin_users.user_id
   FROM admin_users)));
CREATE POLICY "user_data_insert_own" ON public."user_data" FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "user_data_select_own" ON public."user_data" FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "user_data_update_own" ON public."user_data" FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "users_own_data" ON public."user_data" FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

-- table: user_data_daily_snapshots
CREATE POLICY "own_daily_insert" ON public."user_data_daily_snapshots" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "own_daily_read" ON public."user_data_daily_snapshots" FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- table: user_data_history
CREATE POLICY "own_history_insert" ON public."user_data_history" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "own_history_read" ON public."user_data_history" FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- ---------- Triggers ----------
CREATE TRIGGER trg_user_data_archive BEFORE DELETE OR UPDATE ON public.user_data FOR EACH ROW EXECUTE FUNCTION archive_user_data_history();
CREATE TRIGGER trg_user_data_updated_at BEFORE INSERT OR UPDATE ON public.user_data FOR EACH ROW EXECUTE FUNCTION touch_user_data_updated_at();

-- ---------- Functions ----------

CREATE OR REPLACE FUNCTION public.archive_user_data_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin if tg_op = 'DELETE' or old.data is distinct from new.data then insert into public.user_data_history (user_id, data, updated_at_before, reason) values (old.user_id, old.data, old.updated_at, case when tg_op = 'DELETE' then 'delete' else 'overwrite' end); end if; if random() < 0.01 then delete from public.user_data_history where archived_at < now() - interval '30 days'; end if; return coalesce(new, old); end; $function$


CREATE OR REPLACE FUNCTION public.get_all_user_data()
 RETURNS TABLE(user_id uuid, email text, data jsonb, updated_at timestamp with time zone, last_active_at timestamp with time zone, disabled boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.id, u.email, d.data, d.updated_at, d.last_active_at, coalesce(d.disabled, false)
  from public.user_data d
  join auth.users u on u.id = d.user_id
  where (select public.is_admin())
  order by d.updated_at desc nulls last;
$function$


CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$function$


CREATE OR REPLACE FUNCTION public.list_user_data_backups(p_user_id uuid)
 RETURNS TABLE(kind text, at_time timestamp with time zone, source_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.restore_user_data_from_backup(p_user_id uuid, p_kind text, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_data jsonb; begin if not (select public.is_admin()) then raise exception 'permission denied'; end if; if p_kind = 'history' then select data into v_data from public.user_data_history where user_id = p_user_id and archived_at = p_at order by id desc limit 1; elsif p_kind = 'daily' then select data into v_data from public.user_data_daily_snapshots where user_id = p_user_id and taken_at = p_at limit 1; else raise exception 'unknown kind'; end if; if v_data is null then raise exception 'backup not found'; end if; update public.user_data set data = v_data, updated_at = now() where user_id = p_user_id; return found; end; $function$


CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_user_disabled(target_user_id uuid, is_disabled boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.user_data set disabled = is_disabled where user_id = target_user_id and (select public.is_admin());
$function$


CREATE OR REPLACE FUNCTION public.take_user_data_snapshot()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare r record; begin for r in select user_id, data, updated_at from public.user_data loop insert into public.user_data_daily_snapshots (user_id, snap_date, data, updated_at) values (r.user_id, current_date, r.data, r.updated_at) on conflict (user_id, snap_date) do update set data = excluded.data, updated_at = excluded.updated_at, taken_at = now(); end loop; delete from public.user_data_daily_snapshots where snap_date < current_date - interval '90 days'; end; $function$


CREATE OR REPLACE FUNCTION public.touch_user_data_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin new.updated_at = now(); return new; end; $function$


CREATE OR REPLACE FUNCTION public.update_last_active()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.user_data set last_active_at = now() where user_id = auth.uid();
  select true;
$function$


-- ---------- Tables / columns (information_schema) ----------

-- table: active_sessions
--   user_id uuid NOT NULL
--   session_token text NOT NULL
--   created_at timestamp with time zone DEFAULT now()

-- table: admin_users
--   user_id uuid NOT NULL
--   created_at timestamp with time zone DEFAULT now()

-- table: user_data
--   id uuid NOT NULL DEFAULT gen_random_uuid()
--   user_id uuid NOT NULL
--   data jsonb NOT NULL DEFAULT '{}'::jsonb
--   updated_at timestamp with time zone DEFAULT now()
--   last_active_at timestamp with time zone
--   disabled boolean DEFAULT false

-- table: user_data_daily_snapshots
--   user_id uuid NOT NULL
--   snap_date date NOT NULL
--   data jsonb NOT NULL
--   updated_at timestamp with time zone
--   taken_at timestamp with time zone NOT NULL DEFAULT now()

-- table: user_data_history
--   id bigint NOT NULL
--   user_id uuid NOT NULL
--   data jsonb NOT NULL
--   updated_at_before timestamp with time zone
--   reason text NOT NULL DEFAULT 'overwrite'::text
--   archived_at timestamp with time zone NOT NULL DEFAULT now()

-- END OF LIVE DUMP

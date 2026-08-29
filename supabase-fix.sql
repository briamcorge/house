-- ============================================
-- Supabase 数据库修复脚本 - user_data 表权限
-- ============================================
-- 在 Supabase SQL Editor 中运行此脚本
-- 用于修复 Excel 导入后云端保存失败的问题
-- ============================================

-- 1. 检查 user_data 表是否存在
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'user_data'
) AS table_exists;

-- 2. 检查 RLS 是否启用
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'user_data';

-- 3. 启用 RLS（如果未启用）
ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

-- 4. 删除旧策略（如果有）
DROP POLICY IF EXISTS "Users can view own data" ON public.user_data;
DROP POLICY IF EXISTS "Users can insert own data" ON public.user_data;
DROP POLICY IF EXISTS "Users can update own data" ON public.user_data;
DROP POLICY IF EXISTS "Users can delete own data" ON public.user_data;
DROP POLICY IF EXISTS "Enable upsert for users" ON public.user_data;

-- 5. 创建新策略：允许用户查看、插入、更新自己的数据（被停用用户无权访问自己的行）
CREATE POLICY "Users can view own data" ON public.user_data
  FOR SELECT
  USING (auth.uid() = user_id AND NOT disabled);

CREATE POLICY "Users can insert own data" ON public.user_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND NOT disabled);

CREATE POLICY "Users can update own data" ON public.user_data
  FOR UPDATE
  USING (auth.uid() = user_id AND NOT disabled);

CREATE POLICY "Users can delete own data" ON public.user_data
  FOR DELETE
  USING (auth.uid() = user_id AND NOT disabled);

-- 6. 创建策略：允许用户 upsert（插入或更新）自己的数据
-- upsert 需要同时满足 INSERT 和 UPDATE 权限
CREATE POLICY "Enable upsert for authenticated users" ON public.user_data
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id AND NOT disabled)
  WITH CHECK (auth.uid() = user_id AND NOT disabled);

-- 7. 检查策略是否创建成功
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'user_data';

-- 8. 检查当前用户是否有权限
SELECT current_user, session_user;

-- 9. 测试插入（可选）
-- INSERT INTO public.user_data (user_id, data, updated_at)
-- VALUES ('test-user-id', '{"properties":[],"rooms":[],"tenants":[],"bills":[]}', NOW())
-- ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data;

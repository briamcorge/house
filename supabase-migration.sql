-- 房屋管理系统 - Supabase 数据表
-- 在 Supabase Dashboard → SQL Editor 中运行此脚本

-- 用户数据表（每用户一行，存整个 JSON）
CREATE TABLE IF NOT EXISTS user_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 允许用户只能读写自己的数据
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- 策略：用户可以 insert/update/select 自己的行
CREATE POLICY "users_own_data" ON user_data
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

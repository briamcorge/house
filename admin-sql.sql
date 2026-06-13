-- 1. 管理员用户表
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 2. 管理员可以看到所有 user_data
CREATE POLICY "admins_read_all" ON user_data
  FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- 3. 安全函数：检查当前用户是否是管理员
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;

-- 4. 安全函数：管理员获取所有用户数据
CREATE OR REPLACE FUNCTION get_all_user_data()
RETURNS TABLE(user_id UUID, email TEXT, data JSONB, updated_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT u.id, u.email, d.data, d.updated_at
  FROM user_data d
  JOIN auth.users u ON u.id = d.user_id
  WHERE (SELECT is_admin())
  ORDER BY d.updated_at DESC NULLS LAST;
$$;

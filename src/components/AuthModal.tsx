import { useState } from 'react'
import { X, Mail, Lock, Loader2, Eye, EyeOff, User, Phone } from 'lucide-react'
import { signIn, signUp, resetPassword } from '../lib/supabase'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  required?: boolean
}

export default function AuthModal({ isOpen, onClose, required = false }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'forgot') {
        const { error } = await resetPassword(email)
        if (error) {
          setError(error.message)
          return
        }
        setSuccess('密码重置链接已发送到你的邮箱，请查收')
        setMode('login')
      } else if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) {
          // 错误泛化（2026-09-06 安全加固）：不向用户展示 Supabase 原始错误，
          // 避免泄露内部细节（如账号状态、限流信息）
          setError('登录失败，请检查邮箱和密码')
          return
        }
        onClose()
      } else {
        if (password !== confirmPassword) {
          setError('两次密码不一致')
          setLoading(false)
          return
        }
        const { error: signUpErr } = await signUp(email, password, name, phone)
        if (signUpErr) {
          if (signUpErr.message.includes('already registered')) {
            setError('该邮箱已注册，请直接登录')
          } else {
            setError(signUpErr.message)
          }
          return
        }
        setSuccess('注册成功！请检查邮箱确认后登录（或直接登录即可）')
        setMode('login')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (!required && e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">
            {mode === 'login' ? '登录' : mode === 'forgot' ? '找回密码' : '注册'}
          </h2>
          {!required && (
            <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-5 pb-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="你的姓名"
                    required
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="你的手机号"
                    required
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            </>
          )}

          {mode !== 'forgot' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少8位密码"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    required
                    minLength={8}
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'forgot' ? '发送重置链接' : mode === 'login' ? '登录' : '注册'}
          </button>

          {mode === 'forgot' ? (
            <p className="text-center text-sm text-gray-500">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                className="text-blue-600 hover:underline"
              >
                返回登录
              </button>
            </p>
          ) : (
            <p className="text-center text-sm text-gray-500">
              {mode === 'login' ? '还没有账号？' : '已有账号？'}
              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); setConfirmPassword('') }}
                className="text-blue-600 hover:underline ml-1"
              >
                {mode === 'login' ? '注册' : '登录'}
              </button>
            </p>
          )}

          {mode === 'login' && (
            <p className="text-center">
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
                className="text-xs text-gray-400 hover:text-blue-500"
              >
                忘记密码？
              </button>
            </p>
          )}
        </form>
        </div>
      </div>
    </div>
  )
}

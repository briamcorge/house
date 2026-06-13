import { useState } from 'react'
import { X, Mail, Lock, Loader2 } from 'lucide-react'
import { signIn, signUp } from '../lib/supabase'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setError('邮箱或密码错误')
          } else {
            setError(error.message)
          }
          return
        }
        onClose()
      } else {
        const { error: signUpErr } = await signUp(email, password)
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
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-3xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少6位密码"
                required
                minLength={6}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

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
            {mode === 'login' ? '登录' : '注册'}
          </button>

          <p className="text-center text-sm text-gray-500">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess('') }}
              className="text-blue-600 hover:underline ml-1"
            >
              {mode === 'login' ? '注册' : '登录'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}

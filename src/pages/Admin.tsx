import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield, Mail, Loader2, ChevronDown, ChevronUp, Search, Ban, CheckCircle, ChevronRight } from 'lucide-react'
import { getAllUserData, checkIsAdmin, getCurrentUser, setUserDisabled } from '../lib/supabase'

interface UserData {
  user_id: string
  email: string
  data: {
    properties: any[]
    rooms: any[]
    tenants: any[]
    bills: any[]
    landlordContracts: any[]
    profitRecords: any[]
  }
  updated_at: string
  last_active_at: string | null
  disabled: boolean
}

export default function Admin() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)
  const [expandedProp, setExpandedProp] = useState<string | null>(null)
  const [expandedContract, setExpandedContract] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await getCurrentUser()
      if (!data?.user) { setLoading(false); return }
      const admin = await checkIsAdmin(data.user.id)
      setIsAdminUser(admin)
      if (admin) {
        try {
          const users = await getAllUserData()
          setUsers(users as UserData[])
        } catch (e) {
          console.error('Failed to load users:', e)
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleToggleDisabled = async (userId: string, currentDisabled: boolean) => {
    setTogglingUserId(userId)
    await setUserDisabled(userId, !currentDisabled)
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, disabled: !currentDisabled } : u))
    setTogglingUserId(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">无权访问</p>
          <button type="button" onClick={() => navigate('/more')} className="mt-4 text-blue-600 text-sm hover:underline">
            返回更多
          </button>
        </div>
      </div>
    )
  }

  const totalProperties = users.reduce((s, u) => s + (u.data?.properties?.length || 0), 0)
  const totalTenants = users.reduce((s, u) => s + (u.data?.tenants?.filter((t: any) => t.status === 'active')?.length || 0), 0)
  const filteredUsers = searchQuery
    ? users.filter(u => u.email?.toLowerCase().includes(searchQuery.toLowerCase()))
    : users

  const formatTime = (t: string | null) => {
    if (!t) return '从未登录'
    const d = new Date(t)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
    return d.toLocaleDateString('zh-CN')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-6 pb-3">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => navigate('/more')} className="p-1 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">管理后台</h1>
          </div>

          {/* 概览卡片 */}
          <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-blue-200" />
              <span className="text-blue-200 text-sm font-medium">管理员面板</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/10 rounded-xl p-2 text-center">
                <p className="text-lg font-bold text-white">{users.length}</p>
                <p className="text-blue-200 text-xs">用户数</p>
              </div>
              <div className="bg-white/10 rounded-xl p-2 text-center">
                <p className="text-lg font-bold text-white">{totalProperties}</p>
                <p className="text-blue-200 text-xs">房源总数</p>
              </div>
              <div className="bg-white/10 rounded-xl p-2 text-center">
                <p className="text-lg font-bold text-white">{totalTenants}</p>
                <p className="text-blue-200 text-xs">在租租客</p>
              </div>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="mt-3 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索用户邮箱..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-300"
            />
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="max-w-md mx-auto space-y-2">
          {filteredUsers.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">
              {searchQuery ? '没有匹配的用户' : '暂无用户数据'}
            </p>
          ) : filteredUsers.map((user) => (
            <div key={user.user_id} className={`bg-white rounded-xl ${user.disabled ? 'opacity-60' : ''}`}>
              <button
                type="button"
                onClick={() => { setExpandedUser(expandedUser === user.user_id ? null : user.user_id); setExpandedProp(null); setExpandedContract(null); }}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl transition-colors"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${user.disabled ? 'bg-gray-200' : 'bg-blue-100'}`}>
                  <Mail className={`w-4 h-4 ${user.disabled ? 'text-gray-400' : 'text-blue-600'}`} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium truncate ${user.disabled ? 'text-gray-400' : 'text-gray-900'}`}>{user.email}</p>
                    {user.disabled && <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-400">
                    {user.data?.properties?.length || 0} 房源 ·
                    {user.data?.tenants?.filter((t: any) => t.status === 'active')?.length || 0} 租客 ·
                    {user.data?.bills?.length || 0} 账单
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{formatTime(user.last_active_at)}</p>
                  {expandedUser === user.user_id ? <ChevronUp className="w-4 h-4 text-gray-400 mt-1 ml-auto" /> : <ChevronDown className="w-4 h-4 text-gray-400 mt-1 ml-auto" />}
                </div>
              </button>

              {expandedUser === user.user_id && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3" onClick={() => { setExpandedProp(null); setExpandedContract(null); }}>
                  {/* 停用/启用按钮 */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleToggleDisabled(user.user_id, user.disabled)}
                      disabled={togglingUserId === user.user_id}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        user.disabled
                          ? 'bg-green-50 text-green-600 hover:bg-green-100'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      {togglingUserId === user.user_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : user.disabled ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : (
                        <Ban className="w-3.5 h-3.5" />
                      )}
                      {user.disabled ? '启用用户' : '停用用户'}
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-900 font-medium">{user.data?.properties?.length || 0}</p>
                      <p className="text-gray-400">房源</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-900 font-medium">{user.data?.rooms?.length || 0}</p>
                      <p className="text-gray-400">房间</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-900 font-medium">{user.data?.tenants?.length || 0}</p>
                      <p className="text-gray-400">租客</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-900 font-medium">{user.data?.bills?.length || 0}</p>
                      <p className="text-gray-400">账单</p>
                    </div>
                  </div>

                  {/* 房源详情 */}
                  {user.data?.properties && user.data.properties.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">房源列表</p>
                      {user.data.properties.map((p: any) => {
                        const propRooms = user.data?.rooms?.filter((r: any) => r.propertyId === p.id) || []
                        const propTenants = user.data?.tenants?.filter((t: any) => propRooms.some((r: any) => r.id === t.roomId)) || []
                        const isExpanded = expandedProp === p.id
                        return (
                          <div key={p.id}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setExpandedProp(isExpanded ? null : p.id); setExpandedContract(null); }
                              }
                              className="w-full bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 mb-1 text-left transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-900">{p.address}</p>
                                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              </div>
                              <p className="text-xs text-gray-400">
                                {propRooms.length} 间房间 · {propTenants.length} 个租客
                              </p>
                            </button>
                            {isExpanded && (
                              <div className="pl-3 mb-1 space-y-1">
                                {propRooms.length === 0 ? (
                                  <p className="text-xs text-gray-400 py-1">暂无房间</p>
                                ) : propRooms.map((r: any) => {
                                  const roomTenants = propTenants.filter((t: any) => t.roomId === r.id)
                                  return (
                                    <div key={r.id} className="bg-white border border-gray-100 rounded-lg px-3 py-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-gray-700">{r.label}室 ({r.roomType})</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.status === 'occupied' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                          {r.status === 'occupied' ? '已租' : '空置'}
                                        </span>
                                      </div>
                                      {roomTenants.length > 0 && roomTenants.map((t: any) => (
                                        <div key={t.id} className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                          <span className="font-medium">{t.name}</span>
                                          <span className="text-gray-300">|</span>
                                          <span>{t.contractStart}~{t.contractEnd}</span>
                                          <span className="text-gray-300">|</span>
                                          <span>¥{t.monthlyRent}/月</span>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 合同详情 */}
                  {user.data?.landlordContracts && user.data.landlordContracts.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">业主合同 ({user.data.landlordContracts.length})</p>
                      {user.data.landlordContracts.map((c: any) => {
                        const isExpanded = expandedContract === c.id
                        return (
                          <div key={c.id}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setExpandedContract(isExpanded ? null : c.id); setExpandedProp(null); }
                              }
                              className="w-full bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-1.5 mb-1 text-left transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                  <span className="text-xs text-gray-700 font-medium">{c.landlordName} · {c.displayId}</span>
                                </div>
                                <span className="text-xs text-gray-500">¥{c.monthlyRent}/月</span>
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="pl-3 mb-1 bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-1">
                                <p><span className="text-gray-400">业主电话：</span>{c.landlordPhone || '未填写'}</p>
                                <p><span className="text-gray-400">合同期限：</span>{c.contractStart} ~ {c.contractEnd}</p>
                                <p><span className="text-gray-400">付款方式：</span>{c.paymentMethod === 'monthly' ? '月付' : c.paymentMethod === 'quarterly' ? '季付' : c.paymentMethod === 'semi-annual' ? '半年付' : '年付'}</p>
                                <p><span className="text-gray-400">状态：</span><span className={`${c.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>{c.status === 'active' ? '执行中' : '已结束'}</span></p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
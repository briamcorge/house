import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { TrashType } from '../types'
import ConfirmModal from '../components/ConfirmModal'
import AlertModal from '../components/AlertModal'
import { Trash2, RotateCcw, ChevronLeft, AlertTriangle, Search } from 'lucide-react'

const typeLabels: Record<TrashType, string> = {
  property: '房源',
  room: '房间',
  tenant: '租客',
  landlord_contract: '代理合同',
  bill: '账单',
}

const typeColors: Record<TrashType, string> = {
  property: 'bg-blue-100 text-blue-700',
  room: 'bg-purple-100 text-purple-700',
  tenant: 'bg-green-100 text-green-700',
  landlord_contract: 'bg-orange-100 text-orange-700',
  bill: 'bg-gray-100 text-gray-700',
}

const allTypes: TrashType[] = ['property', 'room', 'tenant', 'landlord_contract', 'bill']

export default function Trash() {
  const navigate = useNavigate()
  const { trash, tenants, rooms, landlordContracts, restoreFromTrash, permanentlyDelete, emptyTrash } = useStore()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmClear, setConfirmClear] = useState(false)
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TrashType | 'all'>('all')
  const [restoreError, setRestoreError] = useState<string | null>(null)

  // 恢复前校验：账单引用的租客/房间/业主合同必须存在，否则提示先恢复关联实体
  // restoringIds：批量恢复时同批勾选的项目视为已恢复（避免租客+其账单同批恢复被误拦），单条恢复时为 undefined
  const canRestore = (item: { type: TrashType; data: any }, restoringIds?: Set<string>): string | null => {
    if (item.type !== 'bill') return null
    const b = item.data
    const existsLive = (type: TrashType, originalId: string): boolean =>
      type === 'tenant' ? tenants.some(t => t.id === originalId)
        : type === 'room' ? rooms.some(r => r.id === originalId)
        : landlordContracts.some(c => c.id === originalId)
    // 同批勾选恢复的回收站项目视为已恢复
    const willRestore = (type: TrashType, originalId: string): boolean =>
      !!restoringIds && trash.some(t => restoringIds.has(t.id) && t.type === type && t.originalId === originalId)
    const checkRef = (type: TrashType, originalId: string, label: string): string | null => {
      if (!originalId) return null
      if (existsLive(type, originalId) || willRestore(type, originalId)) return null
      if (trash.some(t => t.type === type && t.originalId === originalId)) return `该账单关联的${label}仍在回收站，请同时勾选${label}一起恢复`
      return `该账单关联的${label}已被彻底删除，无法恢复`
    }
    return checkRef('tenant', b.tenantId, '租客') ?? checkRef('room', b.roomId, '房间') ?? checkRef('landlord_contract', b.landlordContractId, '业主合同')
  }

  const handleRestore = (item: { id: string; type: TrashType; data: any }) => {
    const err = canRestore(item)
    if (err) { setRestoreError(err); return }
    restoreFromTrash(item.id)
  }

  const handleBatchRestore = () => {
    const items = trash.filter(t => selected.has(t.id))
    const blocked = items.map(item => canRestore(item, selected)).find(Boolean)
    if (blocked) { setRestoreError(blocked); return }
    items.forEach(item => restoreFromTrash(item.id))
    setSelected(new Set())
  }

  const filteredTrash = useMemo(() => {
    return trash.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (searchQuery.trim() && !t.label.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [trash, typeFilter, searchQuery])

  // 筛选条件变化时清空选中
  useEffect(() => { setSelected(new Set()) }, [typeFilter, searchQuery])

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectAll = () => {
    if (selected.size === filteredTrash.length && filteredTrash.length > 0) setSelected(new Set())
    else setSelected(new Set(filteredTrash.map(t => t.id)))
  }

  const handleBatchDelete = () => {
    setBatchDeleteConfirm(true)
  }

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: trash.length }
    for (const t of allTypes) counts[t] = trash.filter(x => x.type === t).length
    return counts
  }, [trash])

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-6 pb-3">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => navigate('/more')} className="p-1 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">回收站</h1>
          </div>

          {trash.length > 0 && (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索已删除的内容..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
                )}
              </div>

              <div className="flex gap-2 mb-3 overflow-x-auto">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${typeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  全部 ({typeCounts.all})
                </button>
                {allTypes.map(t => typeCounts[t] > 0 ? (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${typeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {typeLabels[t]} ({typeCounts[t]})
                  </button>
                ) : null)}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selected.size === filteredTrash.length && filteredTrash.length > 0} onChange={selectAll} className="w-4 h-4" />
                  <span className="text-sm text-gray-600">全选{typeFilter !== 'all' && ` (${typeLabels[typeFilter]})`}</span>
                </label>
                <div className="flex gap-2">
                  {selected.size > 0 && (
                    <>
                      <button onClick={handleBatchRestore} className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" />恢复（{selected.size}）
                      </button>
                      <button onClick={handleBatchDelete} className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-1">
                        <Trash2 className="w-3 h-3" />删除
                      </button>
                    </>
                  )}
                  <button onClick={() => setConfirmClear(true)} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />清空
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto">
          {trash.length === 0 ? (
            <div className="text-center py-16">
              <Trash2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">回收站为空</p>
            </div>
          ) : filteredTrash.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">没有匹配项</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTrash.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).map(item => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="w-4 h-4 shrink-0"
                  />
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${typeColors[item.type]}`}>{typeLabels[item.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                    <p className="text-xs text-gray-400">删除于 {item.deletedAt}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleRestore(item)}
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600"
                      title="恢复"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSingleDeleteId(item.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-red-600"
                      title="永久删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmClear && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">清空回收站</h3>
            <p className="text-sm text-gray-500 mb-4">确定永久删除回收站中的所有项目？此操作不可恢复。</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClear(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium">取消</button>
              <button onClick={() => { emptyTrash(); setConfirmClear(false) }} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium">清空</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={batchDeleteConfirm}
        onClose={() => setBatchDeleteConfirm(false)}
        onConfirm={() => {
          selected.forEach(id => permanentlyDelete(id))
          setSelected(new Set())
        }}
        title="批量删除确认"
        message="确定永久删除选中的项目？此操作不可恢复！"
        variant="danger"
      />

      <ConfirmModal
        isOpen={singleDeleteId !== null}
        onClose={() => setSingleDeleteId(null)}
        onConfirm={() => {
          if (singleDeleteId) permanentlyDelete(singleDeleteId)
        }}
        title="永久删除确认"
        message="确定永久删除？"
        variant="danger"
      />

      <AlertModal
        isOpen={restoreError !== null}
        title="无法恢复"
        message={restoreError || ''}
        onClose={() => setRestoreError(null)}
      />
    </div>
  )
}

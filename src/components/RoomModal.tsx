import { useState, useEffect } from 'react'
import { Room, RoomLabel } from '../types'
import { X, Home } from 'lucide-react'

interface RoomModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (room: Omit<Room, 'id' | 'createdAt'>) => void
  propertyId: string
  editingRoom?: Room
  usedLabels: RoomLabel[]
}

const allLabels: RoomLabel[] = ['A', 'B', 'C', 'D', 'E', '整租']

// 整租：户型为几居/开间
const wholeRentTypes = ['一居', '两居', '三居', '开间']
// 分租：房间类型
const sharedRentTypes = ['主卧', '次卧', '小卧', '隔阳', '隔明', '暗间', '独卫']

const CUSTOM = '__custom__'

function showError(setter: (msg: string) => void, msg: string) {
  setter(msg)
  setTimeout(() => setter(''), 5000)
}

export default function RoomModal({ isOpen, onClose, onSave, propertyId, editingRoom, usedLabels }: RoomModalProps) {
  const [label, setLabel] = useState<RoomLabel>('A')
  const [roomType, setRoomType] = useState('主卧')
  const [error, setError] = useState('')

  // 整租：无编号，类型为一居/两居/三居/开间；分租：编号 A-E，类型为主卧等
  const isWholeRent = label === '整租'
  const roomTypes = isWholeRent ? wholeRentTypes : sharedRentTypes

  // 房间类型是否在预设列表内（不在 → 走自定义输入模式）
  const isPresetType = roomTypes.includes(roomType)
  const selectValue = isPresetType ? roomType : CUSTOM

  const availableLabels = allLabels.filter(l => !usedLabels.includes(l) || editingRoom?.label === l)

  // 切换编号时：若当前类型不在新模式预设中，自动切到该模式默认类型
  const handleLabelChange = (l: RoomLabel) => {
    setLabel(l)
    const types = l === '整租' ? wholeRentTypes : sharedRentTypes
    if (!types.includes(roomType)) setRoomType(types[0])
  }

  useEffect(() => {
    const avail = allLabels.filter(l => !usedLabels.includes(l) || editingRoom?.label === l)
    if (editingRoom) {
      setLabel(editingRoom.label)
      setRoomType(editingRoom.roomType)
    } else {
      setLabel(avail[0] || 'A')
      setRoomType('主卧')
    }
    setError('')
  }, [isOpen, editingRoom, propertyId, usedLabels.length])

  // ESC键关闭
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    if (!label) {
      showError(setError, '请选择房间编号')
      return
    }
    if (!propertyId) {
      showError(setError, '缺少房源信息')
      return
    }
    if (!roomType) {
      showError(setError, isPresetType ? '请选择房间类型' : '请输入房间类型')
      return
    }

    onSave({
      propertyId,
      label,
      roomType,
      status: editingRoom?.status || 'vacant',
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{editingRoom ? '编辑房间' : '添加房间'}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Home className="w-4 h-4 inline mr-1" />
              房间编号
            </label>
            {editingRoom ? (
              <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 font-medium">
                {editingRoom.label === '整租' ? '整租' : `${editingRoom.label} 室`}
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {availableLabels.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => handleLabelChange(l)}
                    className={`flex-1 min-w-[48px] py-3 rounded-xl font-medium transition-all ${
                      label === l
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    {l === '整租' ? '整租' : `${l} 室`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">房间类型</label>
            <select
              value={selectValue}
              onChange={(e) => {
                // 选择"自定义"时保留当前输入值；选择预设项时直接使用
                if (e.target.value === CUSTOM) {
                  setRoomType(isPresetType ? '' : roomType)
                } else {
                  setRoomType(e.target.value)
                }
              }}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {roomTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value={CUSTOM}>自定义…</option>
            </select>
            {selectValue === CUSTOM && (
              <input
                type="text"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                placeholder={isWholeRent ? '请输入房间类型，如：四居、五居' : '请输入房间类型，如：一居、整租'}
                className="mt-2 w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

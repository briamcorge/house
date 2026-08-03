import { useState, useEffect } from 'react'
import { Property } from '../types'
import { X, Building2 } from 'lucide-react'
import ConfirmModal from './ConfirmModal'

interface PropertyModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (property: Omit<Property, 'id' | 'createdAt'>) => void
  editingProperty?: Property
}

const houseTypes = ['一居', '两居', '三居', '开间']

const CUSTOM = '__custom__'

function showError(setter: (msg: string) => void, msg: string) {
  setter(msg)
  setTimeout(() => setter(''), 5000)
}

export default function PropertyModal({ isOpen, onClose, onSave, editingProperty }: PropertyModalProps) {
  const [address, setAddress] = useState('')
  const [houseType, setHouseType] = useState('一居')
  const [area, setArea] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  // 户型是否在预设内（不在 → 自定义输入）
  const isPresetHouseType = houseTypes.includes(houseType)
  const houseSelectValue = isPresetHouseType ? houseType : CUSTOM

  useEffect(() => {
    if (editingProperty) {
      setAddress(editingProperty.address)
      setHouseType(editingProperty.houseType || '一居')
      setArea(editingProperty.area ? String(editingProperty.area) : '')
      setDescription(editingProperty.description || '')
    } else {
      setAddress('')
      setHouseType('一居')
      setArea('')
      setDescription('')
    }
    setError('')
  }, [isOpen, editingProperty])

  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const isDirty = editingProperty
    ? address !== editingProperty.address ||
      houseType !== (editingProperty.houseType || '一居') ||
      area !== (editingProperty.area ? String(editingProperty.area) : '') ||
      description !== (editingProperty.description || '')
    : address !== '' || houseType !== '一居' || area !== '' || description !== ''

  const handleClose = () => {
    if (isDirty) {
      setShowCloseConfirm(true)
      return
    }
    onClose()
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    if (!address.trim()) {
      showError(setError, '请输入房源地址')
      return
    }

    const areaNum = area.trim() ? Number(area) : undefined
    if (area.trim() && (isNaN(areaNum!) || areaNum! <= 0)) {
      showError(setError, '请输入有效的面积（正数，单位平方米）')
      return
    }

    onSave({
      address: address.trim(),
      houseType: houseType.trim() || undefined,
      area: areaNum,
      description: description.trim() || undefined,
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={handleClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{editingProperty ? '编辑房源' : '添加房源'}</h2>
            <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full">
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
              <Building2 className="w-4 h-4 inline mr-1" />
房源地址
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例如：朝阳区建国路88号"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">户型</label>
              <select
                value={houseSelectValue}
                onChange={(e) => {
                  if (e.target.value === CUSTOM) {
                    setHouseType(isPresetHouseType ? '' : houseType)
                  } else {
                    setHouseType(e.target.value)
                  }
                }}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {houseTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value={CUSTOM}>自定义…</option>
              </select>
              {houseSelectValue === CUSTOM && (
                <input
                  type="text"
                  value={houseType}
                  onChange={(e) => setHouseType(e.target.value)}
                  placeholder="如：四居、复式"
                  className="mt-2 w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">面积（㎡）</label>
              <input
                type="number"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="如：89"
                min="0"
                step="0.1"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注（选填）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：与房东合同年付，每月15日交租"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
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

      <ConfirmModal
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={() => { setShowCloseConfirm(false); onClose() }}
        title="放弃修改"
        message="有未保存的修改，确定要放弃吗？"
        variant="default"
      />
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Property } from '../types'
import { X, Building2 } from 'lucide-react'

interface PropertyModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (property: Omit<Property, 'id' | 'createdAt'>) => void
  editingProperty?: Property
}

function showError(setter: (msg: string) => void, msg: string) {
  setter(msg)
  setTimeout(() => setter(''), 3000)
}

export default function PropertyModal({ isOpen, onClose, onSave, editingProperty }: PropertyModalProps) {
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (editingProperty) {
      setAddress(editingProperty.address)
      setDescription(editingProperty.description || '')
    } else {
      setAddress('')
      setDescription('')
    }
    setError('')
  }, [isOpen, editingProperty])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    if (!address.trim()) {
      showError(setError, '请输入房源地址')
      return
    }

    onSave({ address: address.trim(), description: description.trim() || undefined })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]">
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{editingProperty ? '编辑房源' : '添加房源'}</h2>
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

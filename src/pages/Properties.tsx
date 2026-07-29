import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Property } from '../types'
import PropertyCard from '../components/PropertyCard'
import PropertyModal from '../components/PropertyModal'
import LandlordContractModal from '../components/LandlordContractModal'
import BillSummaryModal from '../components/BillSummaryModal'
import ConfirmModal from '../components/ConfirmModal'
import AlertModal from '../components/AlertModal'
import { add30Days, formatDate } from '../utils/calculator'
import { Edit2, Trash2, MoreVertical, Plus, Search, FileText, User } from 'lucide-react'

export default function Properties() {
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, landlordContracts, addProperty, updateProperty, deleteProperty, addBill, addLandlordContract, updateLandlordContract } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | undefined>()
  const [propertyMenu, setPropertyMenu] = useState<string | null>(null)
  const [landlordPropertyId, setLandlordPropertyId] = useState<string | null>(null)
  const [summaryPropertyId, setSummaryPropertyId] = useState<string | null>(null)
  const [landlordEdit, setLandlordEdit] = useState<{ pid: string; rent: number; method: import('../types').PaymentMethod; start: string; end: string; name?: string; phone?: string; deposit?: number } | null>(null)
  const [simpleEdit, setSimpleEdit] = useState<{ pid: string; name?: string; phone?: string } | null>(null)
  const [alertState, setAlertState] = useState<{ title: string; message: string } | null>(null)
  const [deleteStep1, setDeleteStep1] = useState<string | null>(null)
  const [deleteStep2, setDeleteStep2] = useState<string | null>(null)

  const getRoomCount = (propertyId: string) =>
    rooms.filter(r => r.propertyId === propertyId).length

  const handleSaveProperty = (data: Omit<Property, 'id' | 'createdAt'>) => {
    if (editingProperty) {
      updateProperty(editingProperty.id, data)
    } else {
      addProperty(data)
    }
    setEditingProperty(undefined)
    setShowModal(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-2">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">房源管理</h1>
            <button
              type="button"
              onClick={() => {
                setEditingProperty(undefined)
                setShowModal(true)
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加房源
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto">
          <div className="space-y-3">
            {properties.map((property) => (
              <div key={property.id} className="relative group">
                <PropertyCard
                  property={property}
                  roomCount={getRoomCount(property.id)}
                  occupiedCount={rooms.filter(r => r.propertyId === property.id && r.status === 'occupied').length}
                  onClick={() => navigate(`/properties/${property.id}`)}
                  landlordName={(() => {
                    const lc = landlordContracts.filter(c => c.propertyId === property.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                    return lc?.landlordName || undefined
                  })()}
                  landlordMonthlyRent={(() => {
                    const lc = landlordContracts.filter(c => c.propertyId === property.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                    return lc?.monthlyRent || undefined
                  })()}
                  billReceivable={(() => {
                    const propRoomIds = rooms.filter(r => r.propertyId === property.id).map(r => r.id)
                    const propBills = bills.filter(b => b.roomId && propRoomIds.includes(b.roomId) && b.direction === 'receivable' && b.type !== 'deposit')
                    const total = propBills.reduce((s, b) => s + b.amount, 0)
                    const paid = propBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0)
                    return total > 0 ? { paid, total } : undefined
                  })()}
                  billPayable={(() => {
                    const propBills = bills.filter(b => b.propertyId === property.id && b.direction === 'payable' && b.type !== 'deposit')
                    const total = propBills.reduce((s, b) => s + b.amount, 0)
                    const paid = propBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0)
                    return total > 0 ? { paid, total } : undefined
                  })()}
                  onClickBill={() => setSummaryPropertyId(property.id)}
                />
                <div className="absolute top-3 right-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPropertyMenu(propertyMenu === property.id ? null : property.id)
                    }}
                    className="p-2 hover:bg-white/80 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-5 h-5 text-gray-500" />
                  </button>
                  {propertyMenu === property.id && (
                    <>
                      <div className="fixed inset-0 z-[5]" onClick={() => setPropertyMenu(null)} />
                    <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 min-w-[140px] z-[60]">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProperty(property)
                          setShowModal(true)
                          setPropertyMenu(null)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        编辑地址
                      </button>
                      {(() => {
                        const latestLC = landlordContracts.filter(c => c.propertyId === property.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                        const hasPayable = landlordContracts.some(c => c.propertyId === property.id && c.status === 'active')
                        return hasPayable ? (
                        <>
                          {latestLC?.landlordName && (
                            <div className="px-4 py-1.5 text-xs text-gray-400">
                              业主：{latestLC.landlordName}{latestLC.landlordPhone ? ` · ${latestLC.landlordPhone}` : ''}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSimpleEdit({
                                pid: property.id,
                                name: latestLC?.landlordName || undefined,
                                phone: latestLC?.landlordPhone || undefined,
                              })
                              setPropertyMenu(null)
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <User className="w-4 h-4" />
                            编辑业主
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const lc = landlordContracts.filter(c => c.propertyId === property.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                              const pb = bills.filter(b => b.propertyId === property.id && b.direction === 'payable')
                              const origEnd = lc?.contractEnd || pb.sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0]?.dueDate || ''
                              const newStart = formatDate(add30Days(new Date(origEnd), 1))
                              setLandlordEdit({
                                pid: property.id,
                                rent: lc?.monthlyRent || Math.round(pb.reduce((s, b) => s + b.amount, 0) / Math.max(1, pb.length) / 3),
                                method: lc?.paymentMethod || 'quarterly',
                                start: newStart,
                                end: formatDate(add30Days(new Date(newStart), 359)),
                                name: lc?.landlordName || undefined,
                                phone: lc?.landlordPhone || undefined,
                                deposit: lc?.deposit,
                              })
                              setPropertyMenu(null)
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" />
                            代理续约
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setLandlordPropertyId(property.id); setLandlordEdit(null); setPropertyMenu(null) }}
                          className="w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
                        >
                           <FileText className="w-4 h-4" />
                           签代理合同
                         </button>
                      )
                      })()}
                      <button
                        type="button"
                        onClick={() => {
                          // 前置检查：活跃租客 + 活跃业主合同
                          const propRoomIds = rooms.filter(r => r.propertyId === property.id).map(r => r.id)
                          const activeTenants = tenants.filter(t => propRoomIds.includes(t.roomId) && t.status === 'active').length
                          const activeContracts = landlordContracts.filter(c => c.propertyId === property.id && c.status === 'active').length
                          const warnings: string[] = []
                          if (activeTenants > 0) warnings.push(`${activeTenants} 份活跃租客合同`)
                          if (activeContracts > 0) warnings.push(`${activeContracts} 份活跃业主合同`)
                          if (warnings.length > 0) {
                            setAlertState({ title: '提示', message: `该房源下有 ${warnings.join(' / ')}，请先处理后再删除` })
                            setPropertyMenu(null)
                            return
                          }
                          setDeleteStep1(property.id)
                          setPropertyMenu(null)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        删除
                      </button>
                    </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {properties.length === 0 && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-500">暂无房源</p>
                <p className="text-sm text-gray-400 mt-1">点击右上角添加房源</p>
              </div>
            )}
          </div>

        </div>
      </div>

      <PropertyModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSaveProperty}
        editingProperty={editingProperty}
      />
      <LandlordContractModal
        isOpen={landlordPropertyId !== null || landlordEdit !== null || simpleEdit !== null}
        onClose={() => { setLandlordPropertyId(null); setLandlordEdit(null); setSimpleEdit(null) }}
        onConfirm={(draftBills, rent, name, phone, cs, ce, deposit) => {
          draftBills.forEach((bill) => {
            addBill({
              propertyId: landlordPropertyId!,
              amount: bill.amount,
              type: bill.type === 'deposit' ? 'deposit' : 'rent',
              status: 'pending',
              direction: 'payable',
              dueDate: bill.dueDate,
              description: bill.description,
              periodStart: bill.periodStart,
              periodEnd: bill.periodEnd,
            })
          })
          addLandlordContract({
            propertyId: landlordPropertyId!,
            landlordName: name,
            landlordPhone: phone,
            monthlyRent: rent || 0,
            paymentMethod: 'quarterly',
            contractStart: cs || draftBills[0]?.dueDate || '',
            contractEnd: ce || draftBills[draftBills.length - 1]?.dueDate || '',
            status: 'active',
            deposit: deposit,
          })
          setLandlordPropertyId(null)
        }}
        onUpdate={(draftBills, rent, name, phone, cs, ce, deposit) => {
          const pid = landlordEdit?.pid
          if (!pid) return
          const now = new Date().toISOString().slice(0, 7)
          draftBills.forEach((bill) => {
            addBill({
              propertyId: pid,
              amount: bill.amount,
              type: bill.type === 'deposit' ? 'deposit' : 'rent',
              status: 'pending',
              direction: 'payable',
              dueDate: bill.dueDate,
              description: `[续约${now}] ${bill.description}`,
              periodStart: bill.periodStart,
              periodEnd: bill.periodEnd,
            })
          })
          // 结束旧合同
          const oldContract = landlordContracts.find(c => c.propertyId === pid && c.status === 'active')
          if (oldContract) {
            updateLandlordContract(oldContract.id, { status: 'ended' })
          }
          addLandlordContract({
            propertyId: pid,
            landlordName: name,
            landlordPhone: phone,
            monthlyRent: rent || 0,
            paymentMethod: 'quarterly',
            contractStart: cs || draftBills[0]?.dueDate || '',
            contractEnd: ce || draftBills[draftBills.length - 1]?.dueDate || '',
            status: 'active',
            deposit: deposit,
          })
          setLandlordEdit(null)
        }}
        propertyAddress={properties.find(p => p.id === (landlordPropertyId || landlordEdit?.pid || simpleEdit?.pid))?.address || ''}
        existingRent={landlordEdit?.rent}
        existingPaymentMethod={landlordEdit?.method}
        existingStart={landlordEdit?.start}
        existingEnd={landlordEdit?.end}
        existingName={landlordEdit?.name || simpleEdit?.name}
        existingPhone={landlordEdit?.phone || simpleEdit?.phone}
        existingDeposit={landlordEdit?.deposit}
        isSimpleEdit={simpleEdit !== null}
        isRenewal={landlordEdit !== null}
        onSaveEdit={(name, phone) => {
          if (!simpleEdit?.pid) return
          const existing = landlordContracts.filter(c => c.propertyId === simpleEdit.pid).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          if (existing) {
            updateLandlordContract(existing.id, { landlordName: name, landlordPhone: phone })
          }
          setSimpleEdit(null)
        }}
      />
      <BillSummaryModal
        isOpen={summaryPropertyId !== null}
        onClose={() => setSummaryPropertyId(null)}
        propertyId={summaryPropertyId || undefined}
      />

      <ConfirmModal
        isOpen={deleteStep1 !== null}
        onClose={() => setDeleteStep1(null)}
        onConfirm={() => {
          if (deleteStep1) {
            setDeleteStep2(deleteStep1)
            setDeleteStep1(null)
          }
        }}
        title="删除确认"
        message="确定要删除这个房源吗？"
        variant="danger"
      />

      <ConfirmModal
        isOpen={deleteStep2 !== null}
        onClose={() => {
          if (deleteStep2) deleteProperty(deleteStep2, false)
          setDeleteStep2(null)
        }}
        onConfirm={() => {
          if (deleteStep2) deleteProperty(deleteStep2, true)
          setDeleteStep2(null)
        }}
        title="确认操作"
        message={'是否保留已付清的账单及流水？\n\n选择"确定"= 保留已付账单\n选择"取消"= 删除所有关联账单'}
        variant="default"
        confirmText="保留已付账单"
        cancelText="全部删除"
      />

      <AlertModal
        isOpen={alertState !== null}
        onClose={() => setAlertState(null)}
        title={alertState?.title || ''}
        message={alertState?.message || ''}
        variant="error"
      />
    </div>
  )
}

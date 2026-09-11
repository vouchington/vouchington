'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { PointValuation } from '@/types/my'
import { ValuationSummary } from './valuation-summary'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CurrencySelect } from '@/components/shared/currency-select'
import type { CurrencyCode } from '@ts-shared/money'

interface EditForm {
  value_per_point: string
  currency: CurrencyCode
  note: string
}
interface ValuationListProps {
  confirmingDeleteId: string | null
  editForm: EditForm
  editingId: string | null
  loadingIds: Set<string>
  valuations: PointValuation[]
  onDelete: (id: string) => void
  onSave: (id: string) => void
  onStartEdit: (valuation: PointValuation) => void
  setConfirmingDeleteId: (id: string | null) => void
  setEditForm: (updater: (form: EditForm) => EditForm) => void
  setEditingId: (id: string | null) => void
}
export function ValuationList({
  confirmingDeleteId,
  editForm,
  editingId,
  loadingIds,
  valuations,
  onDelete,
  onSave,
  onStartEdit,
  setConfirmingDeleteId,
  setEditForm,
  setEditingId,
}: ValuationListProps) {
  return (
    <ul className='space-y-3'>
      {valuations.map(valuation => (
        <li
          key={valuation.id}
          className='rounded-md border p-3 sm:p-4'
        >
          {editingId === valuation.id ? (
            <ValuationEditForm
              editForm={editForm}
              loading={loadingIds.has(valuation.id)}
              valuation={valuation}
              onCancel={() => setEditingId(null)}
              onSave={() => onSave(valuation.id)}
              setEditForm={setEditForm}
            />
          ) : (
            <ValuationSummary
              confirmingDeleteId={confirmingDeleteId}
              loading={loadingIds.has(valuation.id)}
              valuation={valuation}
              onCancelDelete={() => setConfirmingDeleteId(null)}
              onConfirmDelete={() => {
                setConfirmingDeleteId(null)
                onDelete(valuation.id)
              }}
              onStartDelete={() => setConfirmingDeleteId(valuation.id)}
              onStartEdit={() => onStartEdit(valuation)}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
function ValuationEditForm({
  editForm,
  loading,
  valuation,
  onCancel,
  onSave,
  setEditForm,
}: {
  editForm: EditForm
  loading: boolean
  valuation: PointValuation
  onCancel: () => void
  onSave: () => void
  setEditForm: (updater: (form: EditForm) => EditForm) => void
}) {
  const t = useTranslations()
  return (
    <form
      className='space-y-3'
      onSubmit={e => {
        e.preventDefault()
        if (loading) return
        onSave()
      }}
    >
      <p className='font-medium'>{valuation.rewards_program.name}</p>
      <div className='space-y-1'>
        <Label htmlFor={`cpp-${valuation.id}`}>
          {t('extracted.pointValuationsManager.valuationList.valuePerPoint_fa9d9f8a')}
        </Label>
        <Input
          id={`cpp-${valuation.id}`}
          type='text'
          inputMode='decimal'
          value={editForm.value_per_point}
          onChange={e => setEditForm(f => ({ ...f, value_per_point: e.target.value }))}
          placeholder={t('extracted.pointValuationsManager.valuationList.00000_297d62f3')}
          data-pw='point-valuation-edit-cpp-input'
        />
      </div>
      <CurrencySelect
        id={`point-value-currency-${valuation.id}`}
        value={editForm.currency}
        onValueChange={currency => setEditForm(form => ({ ...form, currency }))}
      />
      <div className='space-y-1'>
        <Label htmlFor={`note-${valuation.id}`}>
          {t('extracted.pointValuationsManager.valuationList.note_d8da2c49')}
        </Label>
        <Textarea
          id={`note-${valuation.id}`}
          value={editForm.note}
          onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
          rows={2}
          placeholder={t('extracted.pointValuationsManager.valuationList.optionalNote_951ddd37')}
        />
      </div>
      <div className='flex gap-2'>
        <Button
          size='sm'
          type='submit'
          loading={loading}
          disabled={loading}
          data-pw='point-valuation-edit-save-button'
        >
          {t('extracted.pointValuationsManager.valuationList.save_1509f561')}
        </Button>
        <Button
          size='sm'
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('extracted.pointValuationsManager.valuationList.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}

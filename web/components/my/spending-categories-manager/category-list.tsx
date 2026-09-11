'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { SpendingCategory } from '@/types/my'
import { CategorySummary } from './category-summary'
import { FrequencySelect, type SpendingFrequency } from './frequency-select'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CurrencySelect } from '@/components/shared/currency-select'
import { compatibleMoneyInputValue } from '@/lib/money'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { CurrencyCode } from '@ts-shared/money'

export interface EditForm {
  amount: string
  currency: CurrencyCode
  spending_frequency: SpendingFrequency
  note: string
}

interface CategoryListProps {
  categories: SpendingCategory[]
  confirmingDeleteId: string | null
  editForm: EditForm
  editingId: string | null
  loadingIds: Set<string>
  onDelete: (id: string) => void
  onSave: (id: string) => void
  onStartEdit: (category: SpendingCategory) => void
  setConfirmingDeleteId: (id: string | null) => void
  setEditForm: (updater: (form: EditForm) => EditForm) => void
  setEditingId: (id: string | null) => void
}

export function CategoryList({
  categories,
  confirmingDeleteId,
  editForm,
  editingId,
  loadingIds,
  onDelete,
  onSave,
  onStartEdit,
  setConfirmingDeleteId,
  setEditForm,
  setEditingId,
}: CategoryListProps) {
  return (
    <ul className='space-y-3'>
      {categories.map(category => (
        <li
          key={category.id}
          className='rounded-md border p-3 sm:p-4'
        >
          {editingId === category.id && category.can_manage !== false ? (
            <CategoryEditForm
              category={category}
              editForm={editForm}
              loading={loadingIds.has(category.id)}
              onCancel={() => setEditingId(null)}
              onSave={() => onSave(category.id)}
              setEditForm={setEditForm}
            />
          ) : (
            <CategorySummary
              category={category}
              confirmingDeleteId={confirmingDeleteId}
              loading={loadingIds.has(category.id)}
              onCancelDelete={() => setConfirmingDeleteId(null)}
              onConfirmDelete={() => {
                setConfirmingDeleteId(null)
                onDelete(category.id)
              }}
              onStartDelete={() => setConfirmingDeleteId(category.id)}
              onStartEdit={() => onStartEdit(category)}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function CategoryEditForm({
  category,
  editForm,
  loading,
  onCancel,
  onSave,
  setEditForm,
}: {
  category: SpendingCategory
  editForm: EditForm
  loading: boolean
  onCancel: () => void
  onSave: () => void
  setEditForm: (updater: (form: EditForm) => EditForm) => void
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <form
      className='space-y-3'
      onSubmit={e => {
        e.preventDefault()
        if (loading) return
        onSave()
      }}
    >
      <p className='font-medium'>{category.spending_category.name}</p>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Label htmlFor={`amount-${category.id}`}>
            {t('extracted.spendingCategoriesManager.categoryList.amount_49e96d7c')}
          </Label>
          <Input
            id={`amount-${category.id}`}
            type='text'
            inputMode='decimal'
            value={editForm.amount}
            onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
            placeholder={t('extracted.spendingCategoriesManager.categoryList.000_561b2814')}
            data-pw='spending-category-edit-amount-input'
          />
        </div>
        <CurrencySelect
          id={`spending-currency-${category.id}`}
          value={editForm.currency}
          onValueChange={currency =>
            setEditForm(form => ({
              ...form,
              amount: compatibleMoneyInputValue(form.amount, currency, uiLocale),
              currency,
            }))
          }
        />
        <div className='space-y-1'>
          <Label htmlFor={`freq-${category.id}`}>
            {t('extracted.spendingCategoriesManager.categoryList.frequency_16b6668d')}
          </Label>
          <FrequencySelect
            id={`freq-${category.id}`}
            value={editForm.spending_frequency}
            onChange={value => setEditForm(f => ({ ...f, spending_frequency: value }))}
          />
        </div>
      </div>
      <div className='space-y-1'>
        <Label htmlFor={`note-${category.id}`}>
          {t('extracted.spendingCategoriesManager.categoryList.note_d8da2c49')}
        </Label>
        <Textarea
          id={`note-${category.id}`}
          value={editForm.note}
          onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
          rows={2}
          placeholder={t('extracted.spendingCategoriesManager.categoryList.optionalNote_951ddd37')}
        />
      </div>
      <div className='flex gap-2'>
        <Button
          size='sm'
          type='submit'
          loading={loading}
          disabled={loading}
          data-pw='spending-category-edit-save-button'
        >
          {t('extracted.spendingCategoriesManager.categoryList.save_1509f561')}
        </Button>
        <Button
          size='sm'
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('extracted.spendingCategoriesManager.categoryList.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}

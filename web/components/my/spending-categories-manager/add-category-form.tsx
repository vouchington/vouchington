'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { FrequencySelect, type SpendingFrequency } from './frequency-select'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CurrencySelect } from '@/components/shared/currency-select'
import { compatibleMoneyInputValue } from '@/lib/money'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { CurrencyCode } from '@ts-shared/money'

interface AddCategoryFormProps {
  loading: boolean
  newAmount: string
  newCurrency: CurrencyCode
  newCategoryId: string | null
  newCategoryLabel: string
  newFrequency: SpendingFrequency
  newNote: string
  onAdd: () => void
  setNewAmount: (value: string) => void
  setNewCurrency: (value: CurrencyCode) => void
  setNewCategoryId: (id: string | null) => void
  setNewCategoryLabel: (label: string) => void
  setNewFrequency: (value: SpendingFrequency) => void
  setNewNote: (value: string) => void
}

export function AddCategoryForm({
  loading,
  newAmount,
  newCurrency,
  newCategoryId,
  newCategoryLabel,
  newFrequency,
  newNote,
  onAdd,
  setNewAmount,
  setNewCurrency,
  setNewCategoryId,
  setNewCategoryLabel,
  setNewFrequency,
  setNewNote,
}: AddCategoryFormProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <form
      className='space-y-3 rounded-md border p-3 sm:p-4'
      onSubmit={e => {
        e.preventDefault()
        if (loading) return
        onAdd()
      }}
    >
      <p
        className='text-sm font-medium'
        data-pw='spending-categories-add-form-heading'
      >
        {t('extracted.spendingCategoriesManager.addCategoryForm.addASpendingCategory_0214ba9e')}
      </p>
      <TopicAutocomplete
        value={newCategoryId}
        label={newCategoryLabel}
        onChange={(id, name) => {
          setNewCategoryId(id)
          setNewCategoryLabel(name)
        }}
        spendingCategory
        placeholder={t(
          'extracted.spendingCategoriesManager.addCategoryForm.searchSpendingCategories_a0c47f67',
        )}
      />
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Label
            htmlFor='new-amount'
            data-pw='spending-categories-add-amount-label'
          >
            {t('extracted.spendingCategoriesManager.addCategoryForm.amount_49e96d7c')}
          </Label>
          <Input
            id='new-amount'
            type='text'
            inputMode='decimal'
            value={newAmount}
            onChange={e => setNewAmount(e.target.value)}
            placeholder={t('extracted.spendingCategoriesManager.addCategoryForm.000_561b2814')}
          />
        </div>
        <CurrencySelect
          id='new-spending-currency'
          value={newCurrency}
          onValueChange={currency => {
            setNewAmount(compatibleMoneyInputValue(newAmount, currency, uiLocale))
            setNewCurrency(currency)
          }}
        />
        <div className='space-y-1'>
          <Label
            htmlFor='new-frequency'
            data-pw='spending-categories-add-frequency-label'
          >
            {t('extracted.spendingCategoriesManager.addCategoryForm.frequency_16b6668d')}
          </Label>
          <FrequencySelect
            id='new-frequency'
            value={newFrequency}
            onChange={setNewFrequency}
          />
        </div>
      </div>
      <div className='space-y-1'>
        <Label htmlFor='new-note'>
          {t('extracted.spendingCategoriesManager.addCategoryForm.noteOptional_f9b73e1a')}
        </Label>
        <Textarea
          id='new-note'
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          rows={2}
          placeholder={t(
            'extracted.spendingCategoriesManager.addCategoryForm.optionalNote_951ddd37',
          )}
        />
      </div>
      <div className='flex gap-2'>
        <Button
          size='sm'
          type='submit'
          loading={loading}
          disabled={loading || !newCategoryId}
        >
          {t('extracted.spendingCategoriesManager.addCategoryForm.add_9fd728c6')}
        </Button>
      </div>
    </form>
  )
}

'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CurrencySelect } from '@/components/shared/currency-select'
import type { CurrencyCode } from '@ts-shared/money'

interface AddValuationFormProps {
  loading: boolean
  newValuePerPoint: string
  newCurrency: CurrencyCode
  newNote: string
  newProgramId: string | null
  newProgramLabel: string
  onAdd: () => void
  setNewValuePerPoint: (value: string) => void
  setNewCurrency: (value: CurrencyCode) => void
  setNewNote: (value: string) => void
  setNewProgramId: (id: string | null) => void
  setNewProgramLabel: (label: string) => void
}

export function AddValuationForm({
  loading,
  newValuePerPoint,
  newCurrency,
  newNote,
  newProgramId,
  newProgramLabel,
  onAdd,
  setNewValuePerPoint,
  setNewCurrency,
  setNewNote,
  setNewProgramId,
  setNewProgramLabel,
}: AddValuationFormProps) {
  const t = useTranslations()
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
        data-pw='point-valuations-add-form-heading'
      >
        {t('extracted.pointValuationsManager.addValuationForm.addAPointValuation_29ced576')}
      </p>
      <TopicAutocomplete
        value={newProgramId}
        label={newProgramLabel}
        onChange={(id, name) => {
          setNewProgramId(id)
          setNewProgramLabel(name)
        }}
        topicTypes={['rewards_program']}
        placeholder={t(
          'extracted.pointValuationsManager.addValuationForm.searchRewardsPrograms_990e4fa0',
        )}
      />
      <div className='space-y-1'>
        <Label
          htmlFor='new-cpp'
          data-pw='point-valuations-add-cpp-label'
        >
          {t('extracted.pointValuationsManager.addValuationForm.valuePerPoint_fa9d9f8a')}
        </Label>
        <Input
          id='new-cpp'
          type='text'
          inputMode='decimal'
          value={newValuePerPoint}
          onChange={e => setNewValuePerPoint(e.target.value)}
          placeholder={t('extracted.pointValuationsManager.addValuationForm.00000_297d62f3')}
        />
      </div>
      <CurrencySelect
        id='new-point-value-currency'
        value={newCurrency}
        onValueChange={setNewCurrency}
      />
      <div className='space-y-1'>
        <Label htmlFor='new-note'>
          {t('extracted.pointValuationsManager.addValuationForm.noteOptional_f9b73e1a')}
        </Label>
        <Textarea
          id='new-note'
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          rows={2}
          placeholder={t('extracted.pointValuationsManager.addValuationForm.optionalNote_951ddd37')}
        />
      </div>
      <div className='flex gap-2'>
        <Button
          size='sm'
          type='submit'
          loading={loading}
          disabled={loading || !newProgramId}
        >
          {t('extracted.pointValuationsManager.addValuationForm.add_9fd728c6')}
        </Button>
      </div>
    </form>
  )
}

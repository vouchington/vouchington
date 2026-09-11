'use client'
import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { IndividualCard } from '@/types/my'
import type { CardEditForm } from './types'
import { useTranslations } from '@/lib/i18n/use-translations'
import { AuthorizedUserSelect } from './authorized-user-select'
import { CurrencySelect } from '@/components/shared/currency-select'
import { compatibleMoneyInputValue } from '@/lib/money'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'

export function CardEditFormView({
  card,
  cards,
  editForm,
  loading,
  loadingMore,
  canLoadMore,
  loadMoreError,
  setEditForm,
  onLoadMore,
  onSave,
  onCancel,
}: {
  card: IndividualCard
  cards: IndividualCard[]
  editForm: CardEditForm
  loading: boolean
  loadingMore: boolean
  canLoadMore: boolean
  loadMoreError: Error | null
  setEditForm: Dispatch<SetStateAction<CardEditForm>>
  onLoadMore: () => void
  onSave: () => void
  onCancel: () => void
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
      <p className='font-medium'>{card.card.name}</p>
      <div className='grid gap-3 sm:grid-cols-2'>
        <DateInput
          id={`opened-${card.id}`}
          label={t('extracted.cardsManager.cardEditForm.openedOn_8444a9ea')}
          value={editForm.opened_on}
          field='opened_on'
          setEditForm={setEditForm}
        />
        <DateInput
          id={`closed-${card.id}`}
          label={t('extracted.cardsManager.cardEditForm.closedOn_dd416be7')}
          value={editForm.closed_on}
          field='closed_on'
          setEditForm={setEditForm}
        />
        <DateInput
          id={`bonus-${card.id}`}
          label={t('extracted.cardsManager.cardEditForm.signUpBonusReceivedOn_ada12a16')}
          value={editForm.received_sign_up_bonus_on}
          field='received_sign_up_bonus_on'
          setEditForm={setEditForm}
        />
        <div className='space-y-1'>
          <Label htmlFor={`limit-${card.id}`}>
            {t('extracted.cardsManager.cardEditForm.creditLimit_914a45ea')}
          </Label>
          <Input
            id={`limit-${card.id}`}
            type='text'
            inputMode='decimal'
            value={editForm.credit_limit}
            onChange={e => setEditForm(f => ({ ...f, credit_limit: e.target.value }))}
            placeholder={t('extracted.cardsManager.cardEditForm.000_561b2814')}
          />
        </div>
        <CurrencySelect
          id={`limit-currency-${card.id}`}
          value={editForm.currency}
          onValueChange={currency =>
            setEditForm(form => ({
              ...form,
              credit_limit: compatibleMoneyInputValue(form.credit_limit, currency, uiLocale),
              currency,
            }))
          }
        />
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox
          id={`auth-${card.id}`}
          checked={editForm.is_authorized_user}
          onCheckedChange={(checked: boolean | 'indeterminate') =>
            setEditForm(f => ({
              ...f,
              is_authorized_user: checked === true,
              ...(checked !== true ? { authorized_user_of_id: '' } : {}),
            }))
          }
        />
        <Label htmlFor={`auth-${card.id}`}>
          {t('extracted.cardsManager.cardEditForm.authorizedUser_96d4d4bf')}
        </Label>
      </div>
      {editForm.is_authorized_user ? (
        <AuthorizedUserSelect
          card={card}
          cards={cards}
          editForm={editForm}
          setEditForm={setEditForm}
          loadingMore={loadingMore}
          canLoadMore={canLoadMore}
          loadMoreError={loadMoreError}
          onLoadMore={onLoadMore}
        />
      ) : null}
      <div className='space-y-1'>
        <Label htmlFor={`note-${card.id}`}>
          {t('extracted.cardsManager.cardEditForm.note_d8da2c49')}
        </Label>
        <Textarea
          id={`note-${card.id}`}
          value={editForm.note}
          onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
          rows={2}
          placeholder={t('extracted.cardsManager.cardEditForm.optionalNote_951ddd37')}
        />
      </div>
      <div className='flex gap-2'>
        <Button
          type='submit'
          size='sm'
          loading={loading}
          data-pw='cards-edit-save-button'
        >
          {t('extracted.cardsManager.cardEditForm.save_1509f561')}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={onCancel}
          data-pw='cards-edit-cancel-button'
        >
          {t('extracted.cardsManager.cardEditForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
function DateInput({
  id,
  label,
  value,
  field,
  setEditForm,
}: {
  id: string
  label: string
  value: string
  field: keyof Pick<CardEditForm, 'opened_on' | 'closed_on' | 'received_sign_up_bonus_on'>
  setEditForm: Dispatch<SetStateAction<CardEditForm>>
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type='date'
        value={value}
        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
      />
    </div>
  )
}

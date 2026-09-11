'use client'

import { Button } from '@/components/ui/button'
import type { IndividualCard } from '@/types/my'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatMoney } from '@/lib/money'

export function CardDisplayRow({
  card,
  cards,
  confirmingDeleteId,
  loading,
  onEdit,
  onConfirmDelete,
  onCancelDelete,
  onStartDelete,
}: {
  card: IndividualCard
  cards: IndividualCard[]
  confirmingDeleteId: string | null
  loading: boolean
  onEdit: React.MouseEventHandler<HTMLButtonElement>
  onConfirmDelete: React.MouseEventHandler<HTMLButtonElement>
  onCancelDelete: React.MouseEventHandler<HTMLButtonElement>
  onStartDelete: React.MouseEventHandler<HTMLButtonElement>
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
      <div>
        <p
          className='font-medium'
          data-pw='cards-row-name'
        >
          {card.card.name}
        </p>
        <div className='flex flex-wrap gap-3 text-xs text-muted-foreground'>
          {card.opened_on ? (
            <span>
              {t('extracted.cardsManager.cardRow.openedOpenedon_8c43923d', {
                openedOn: card.opened_on,
              })}
            </span>
          ) : null}
          {card.closed_on ? (
            <span>
              {t('extracted.cardsManager.cardRow.closedClosedon_6f185f46', {
                closedOn: card.closed_on,
              })}
            </span>
          ) : null}
          {card.received_sign_up_bonus_on ? (
            <span>
              {t('extracted.cardsManager.cardRow.bonusBonusdate_59ced0a5', {
                bonusDate: card.received_sign_up_bonus_on,
              })}
            </span>
          ) : null}
          {card.credit_limit ? (
            <span>
              {t('extracted.cardsManager.cardRow.limitCreditlimit_3373ff55', {
                creditLimit: formatMoney(card.credit_limit, uiLocale),
              })}
            </span>
          ) : null}
          {card.is_authorized_user && card.authorized_user_of_id ? (
            <span>
              {t('extracted.cardsManager.cardRow.authUserOfAuthorizedusername_c8afc64d', {
                authorizedUserName:
                  cards.find(c => c.id === card.authorized_user_of_id)?.card.name ??
                  card.authorized_user_of_card?.card.name ??
                  t('extracted.cardsManager.cardRow.authorizedUser_96d4d4bf'),
              })}
            </span>
          ) : null}
          {card.is_authorized_user && !card.authorized_user_of_id ? (
            <span>{t('extracted.cardsManager.cardRow.authorizedUser_96d4d4bf')}</span>
          ) : null}
        </div>
        {card.note ? <p className='mt-1 text-sm text-muted-foreground'>{card.note}</p> : null}
      </div>
      <div className='flex gap-2'>
        {confirmingDeleteId === card.id ? (
          <>
            <span className='self-center text-sm text-destructive'>
              {t('extracted.cardsManager.cardRow.removeCard_ce640ee3')}
            </span>
            <Button
              size='sm'
              variant='destructive'
              onClick={onConfirmDelete}
              disabled={loading}
            >
              {t('extracted.cardsManager.cardRow.confirm_eebdd24a')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={onCancelDelete}
            >
              {t('extracted.cardsManager.cardRow.cancel_19766ed6')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size='sm'
              variant='outline'
              onClick={onEdit}
              disabled={loading}
              data-pw='cards-row-edit-button'
            >
              {t('extracted.cardsManager.cardRow.edit_464c4ffd')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={onStartDelete}
              disabled={loading}
            >
              {t('extracted.cardsManager.cardRow.remove_c3812fc4')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

'use client'
import type { Dispatch, SetStateAction } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { IndividualCard } from '@/types/my'
import type { CardEditForm } from './types'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getAuthorizedUserParentOptions } from './cards-state'

export function AuthorizedUserSelect({
  card,
  cards,
  editForm,
  setEditForm,
  loadingMore,
  canLoadMore,
  loadMoreError,
  onLoadMore,
}: {
  card: IndividualCard
  cards: IndividualCard[]
  editForm: CardEditForm
  setEditForm: Dispatch<SetStateAction<CardEditForm>>
  loadingMore: boolean
  canLoadMore: boolean
  loadMoreError: Error | null
  onLoadMore: () => void
}) {
  const t = useTranslations()
  const eligibleCards = getAuthorizedUserParentOptions(
    card,
    cards,
    editForm.authorized_user_of_id || null,
  )
  return (
    <div className='space-y-1'>
      <Label htmlFor={`auth-of-${card.id}`}>
        {t('extracted.cardsManager.cardEditForm.authorizedUserOf_5012dc53')}
      </Label>
      <Select
        value={editForm.authorized_user_of_id || '__none__'}
        onValueChange={val =>
          setEditForm(f => ({ ...f, authorized_user_of_id: val === '__none__' ? '' : val }))
        }
      >
        <SelectTrigger id={`auth-of-${card.id}`}>
          <SelectValue placeholder={t('extracted.cardsManager.cardEditForm.none_dc937b59')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='__none__'>
            {t('extracted.cardsManager.cardEditForm.none_dc937b59')}
          </SelectItem>
          {eligibleCards.map(c => (
            <SelectItem
              key={c.id}
              value={c.id}
            >
              {c.card.name}
              {c.opened_on
                ? ` ${t('extracted.cardsManager.authorizedUserSelect.openedOpenedon_52504e48', { openedOn: c.opened_on })}`
                : ''}
              {c.closed_on
                ? ` ${t('extracted.cardsManager.authorizedUserSelect.closedClosedon_91de9f16', { closedOn: c.closed_on })}`
                : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canLoadMore ? (
        <Button
          type='button'
          size='sm'
          variant='outline'
          loading={loadingMore}
          disabled={loadingMore}
          onClick={onLoadMore}
          data-pw='cards-parent-load-more'
        >
          {loadMoreError
            ? t('extracted.shared.paginatedListFooter.retry_942087cc')
            : t('extracted.my.referralLinksManager.loadMore_ac8991ef')}
        </Button>
      ) : null}
    </div>
  )
}

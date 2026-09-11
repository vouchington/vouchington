'use client'

import { useRef, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { createMyCard, deleteMyCard, updateMyCard } from '@/lib/api/client'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { AddCardForm } from './cards-manager/add-card-form'
import { CardEditFormView } from './cards-manager/card-edit-form'
import { CardDisplayRow } from './cards-manager/card-row'
import { buildCardUpdatePayload, cardToEditForm } from './cards-manager/payload'
import { mergeCardPages } from './cards-manager/cards-state'
import type { IndividualCard } from '@/types/my'
import type { ListResponse } from '@/types/api-responses'
import type { CardEditForm } from './cards-manager/types'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'

interface Props {
  initialData: ListResponse<IndividualCard>
}

export function CardsManager({ initialData }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/my/cards', { limit: 25 })
  const [upserts, setUpserts] = useState(new Map<string, IndividualCard>())
  const [deletedIds, setDeletedIds] = useState(new Set<string>())
  const cards = mergeCardPages(pages, { upserts, deletedIds })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const { loadingIds, runWithLoadingId } = useLoadingIds()
  const addingRef = useRef(false)
  const [newCardId, setNewCardId] = useState<string | null>(null)
  const [newCardLabel, setNewCardLabel] = useState('')
  const [editForm, setEditForm] = useState<CardEditForm>({
    opened_on: '',
    closed_on: '',
    received_sign_up_bonus_on: '',
    credit_limit: '',
    currency: 'usd',
    is_authorized_user: false,
    authorized_user_of_id: '',
    note: '',
  })

  async function handleAdd(cardId: string) {
    if (addingRef.current || loadingIds.has('add')) return
    addingRef.current = true
    try {
      await runWithLoadingId('add', async () => {
        const { card } = await createMyCard({ card_id: cardId })
        setUpserts(prev => new Map(prev).set(card.id, card))
        setNewCardId(null)
        setNewCardLabel('')
        onSuccess(t('extracted.my.cardsManager.cardAdded_399e2969'))
      })
    } catch (error) {
      onError(error, { fallback: t('extracted.my.cardsManager.failedToAddCard_ba5777be') })
    } finally {
      addingRef.current = false
    }
  }

  function startEdit(card: IndividualCard) {
    setEditingId(card.id)
    setEditForm(cardToEditForm(card))
  }

  async function handleSave(id: string) {
    const payload = buildCardUpdatePayload(
      cards.find(c => c.id === id),
      editForm,
      uiLocale,
    )
    if (payload === 'invalid-credit-limit') {
      onError(new Error('Credit limit must be a non-negative number'), {
        fallback: t('extracted.my.cardsManager.creditLimitMustBeANon_6b867c34'),
        skipSentry: true,
      })
      return
    }
    if (payload === null) {
      setEditingId(null)
      return
    }
    try {
      await runWithLoadingId(id, async () => {
        const { card: updated } = await updateMyCard(id, payload)
        setUpserts(prev => new Map(prev).set(id, updated))
        setEditingId(null)
        onSuccess(t('extracted.my.cardsManager.cardUpdated_59f297ef'))
      })
    } catch (error) {
      onError(error, { fallback: t('extracted.my.cardsManager.failedToUpdateCard_595f6bd2') })
    }
  }

  async function handleDelete(id: string) {
    try {
      await runWithLoadingId(id, async () => {
        await deleteMyCard(id)
        setDeletedIds(prev => new Set(prev).add(id))
        setUpserts(prev => {
          const next = new Map(prev)
          next.delete(id)
          return next
        })
        setEditForm(prev =>
          prev.authorized_user_of_id === id ? { ...prev, authorized_user_of_id: '' } : prev,
        )
        setConfirmingDeleteId(null)
        onSuccess(t('extracted.my.cardsManager.cardRemoved_0e75e7b8'))
      })
    } catch (error) {
      onError(error, { fallback: t('extracted.my.cardsManager.failedToRemoveCard_2774e228') })
    }
  }

  return (
    <div
      className='space-y-4'
      data-pw='cards-manager'
    >
      <InfiniteScroll
        hasNextPage={hasNextPage}
        endCursor={endCursor}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
        resetKey={resetKey}
      >
        <ul className='space-y-3'>
          {cards.map(card => (
            <li
              key={card.id}
              className='rounded-md border p-3 sm:p-4'
            >
              {editingId === card.id ? (
                <CardEditFormView
                  card={card}
                  cards={cards}
                  editForm={editForm}
                  loading={loadingIds.has(card.id)}
                  loadingMore={loadingMore}
                  canLoadMore={hasNextPage}
                  loadMoreError={fetchError}
                  setEditForm={setEditForm}
                  onLoadMore={() => {
                    if (fetchError) clearError()
                    void loadMore()
                  }}
                  onSave={() => handleSave(card.id)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <CardDisplayRow
                  card={card}
                  cards={cards}
                  confirmingDeleteId={confirmingDeleteId}
                  loading={loadingIds.has(card.id)}
                  onEdit={() => startEdit(card)}
                  onConfirmDelete={() => {
                    void handleDelete(card.id)
                  }}
                  onCancelDelete={() => setConfirmingDeleteId(null)}
                  onStartDelete={() => setConfirmingDeleteId(card.id)}
                />
              )}
            </li>
          ))}
        </ul>
      </InfiniteScroll>
      <AddCardForm
        newCardId={newCardId}
        newCardLabel={newCardLabel}
        loading={loadingIds.has('add')}
        onCardChange={(id, name) => {
          setNewCardId(id)
          setNewCardLabel(name)
          if (id) void handleAdd(id)
        }}
        onAdd={() => {
          if (newCardId) void handleAdd(newCardId)
        }}
      />
    </div>
  )
}

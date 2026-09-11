'use client'

import { Button } from '@/components/ui/button'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AddCardForm({
  newCardId,
  newCardLabel,
  loading,
  onCardChange,
  onAdd,
}: {
  newCardId: string | null
  newCardLabel: string
  loading: boolean
  onCardChange: (id: string, name: string) => void
  onAdd: () => void
}) {
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
        data-pw='cards-add-form-heading'
      >
        {t('extracted.cardsManager.addCardForm.addACard_be8f51d2')}
      </p>
      <TopicAutocomplete
        value={newCardId}
        label={newCardLabel}
        onChange={onCardChange}
        topicTypes={['card']}
        placeholder={t('extracted.cardsManager.addCardForm.searchCards_d981a5ad')}
        disabled={loading}
      />
      <Button
        type='submit'
        size='sm'
        className='sr-only'
        loading={loading}
        disabled={loading || !newCardId}
        tabIndex={-1}
      >
        {t('extracted.cardsManager.addCardForm.add_9fd728c6')}
      </Button>
    </form>
  )
}

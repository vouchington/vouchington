'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addCommunityListItemByType } from '@/lib/api/client'
import onError, { onSuccess } from '@/lib/on-error'
import { CommunityListAutocomplete } from './community-list-autocomplete'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'
import type { CommunityListItemType } from '@voucha/types/entities/community'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AddCommunityListItemFormProps {
  communitySlug: string
  itemType: CommunityListItemType
}

export function AddCommunityListItemForm({
  communitySlug,
  itemType,
}: AddCommunityListItemFormProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isBusy = isSubmitting || isPending

  const handleSelect = async (entityId: string) => {
    if (isBusy) return
    const { label } = communityListItemTypeCatalog[itemType]
    setIsSubmitting(true)
    try {
      await addCommunityListItemByType(communitySlug, itemType, entityId)
      startTransition(() => refresh())
      onSuccess(
        t('extracted.communities.addCommunityListItemForm.labelAddedToList_6fb6fe6e', { label }),
      )
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.addCommunityListItemForm.failedToAddLabel_22332393', {
          label,
        }),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const { label } = communityListItemTypeCatalog[itemType]

  return (
    <div className='space-y-3 rounded-md border bg-card p-4'>
      <div>
        <h2 className='text-base font-semibold'>
          {t('extracted.communities.addCommunityListItemForm.addLabel_511a3a5d', { label })}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.communities.addCommunityListItemForm.searchAndSelectAnItemTo_70e3aeeb')}
        </p>
      </div>
      <CommunityListAutocomplete
        itemType={itemType}
        onSelect={handleSelect}
        disabled={isBusy}
      />
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { removeCommunityListItem } from '@/lib/api/client'
import onError, { onSuccess } from '@/lib/on-error'
import type {
  CommunityListItem,
  CommunityListItemType,
  CommunityListPageData,
} from '@/types/api-responses'
import { CommunityListItemContent } from './community-list-item-content'
import { getCommunityListItemLabel } from './community-list-item-label'
import { useTranslations } from '@/lib/i18n/use-translations'

const RemoveIcon = EntityActionIcons.delete

interface CommunityListItemCardProps {
  item: CommunityListItem
  itemType: CommunityListItemType
  data: CommunityListPageData
  communitySlug: string
  canManage?: boolean
}

export function CommunityListItemCard({
  item,
  itemType,
  data,
  communitySlug,
  canManage = false,
}: CommunityListItemCardProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [isRemoving, setIsRemoving] = useState(false)
  const [isPending, startTransition] = useTransition()
  const label = getCommunityListItemLabel(item, itemType, data)
  const isBusy = isRemoving || isPending

  async function handleRemove() {
    if (isBusy) return
    setIsRemoving(true)
    try {
      await removeCommunityListItem(communitySlug, itemType, item.id)
      startTransition(() => refresh())
      onSuccess(
        t('extracted.communities.communityListItemCard.labelRemovedFromList_02b1f933', { label }),
      )
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.communityListItemCard.failedToRemoveLabelFromList_fc3847da',
          {
            label,
          },
        ),
      })
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div
      data-pw='community-list-item-card'
      className='flex items-center justify-between gap-3 rounded-md border bg-card p-4'
    >
      <div className='min-w-0'>
        <CommunityListItemContent
          item={item}
          itemType={itemType}
          data={data}
        />
      </div>
      {canManage && (
        <Button
          type='button'
          variant='outline'
          size='touchIcon'
          onClick={handleRemove}
          disabled={isBusy}
          aria-label={t(
            'extracted.communities.communityListItemCard.removeLabelFromList_53c74c73',
            {
              label,
            },
          )}
          data-pw='community-list-item-remove-button'
        >
          <RemoveIcon data-icon='trash-2' />
        </Button>
      )}
    </div>
  )
}

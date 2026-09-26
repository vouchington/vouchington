'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useUnpublishFromCommunity } from './use-unpublish-from-community'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UnpublishFromCommunityMenuItemProps {
  communityId: string
  postId: string
}

export function UnpublishFromCommunityMenuItem({
  communityId,
  postId,
}: UnpublishFromCommunityMenuItemProps) {
  const t = useTranslations()
  const targetKey = `${communityId}:${postId}`
  const [seenTargetKey, setSeenTargetKey] = useState(targetKey)
  const [open, setOpen] = useState(false)
  const [unpublished, setUnpublished] = useState(false)
  if (seenTargetKey !== targetKey) {
    setSeenTargetKey(targetKey)
    setOpen(false)
    setUnpublished(false)
  }
  const { isUnpublishing, handleUnpublish } = useUnpublishFromCommunity({ communityId, postId })

  return (
    <>
      <DropdownMenuItem
        disabled={unpublished}
        onSelect={e => {
          e.preventDefault()
          if (!unpublished) setOpen(true)
        }}
        data-pw='post-unpublish-from-community-trigger'
      >
        {unpublished
          ? t('extracted.posts.unpublishFromCommunityMenuItem.unpublished_b6e07310')
          : t('extracted.posts.unpublishFromCommunityMenuItem.unpublish_2db04a54')}
      </DropdownMenuItem>
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
      >
        <AlertDialogContent data-pw='post-unpublish-from-community-dialog'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('extracted.posts.unpublishFromCommunityMenuItem.unpublishFromCommunity_a77d2489')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'extracted.posts.unpublishFromCommunityMenuItem.removeThisPostFromTheCommunity_721fa01a',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnpublishing}>
              {t('extracted.posts.unpublishFromCommunityMenuItem.cancel_19766ed6')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isUnpublishing}
              onClick={e => {
                e.preventDefault()
                void handleUnpublish().then(didUnpublish => {
                  if (!didUnpublish) return
                  setOpen(false)
                  setUnpublished(true)
                })
              }}
              data-pw='post-unpublish-from-community-confirm'
            >
              {isUnpublishing ? 'Unpublishing...' : 'Unpublish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

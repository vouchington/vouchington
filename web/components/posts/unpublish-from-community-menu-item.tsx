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
  const [open, setOpen] = useState(false)
  const { isUnpublishing, handleUnpublish } = useUnpublishFromCommunity({ communityId, postId })

  return (
    <>
      <DropdownMenuItem
        onSelect={e => {
          e.preventDefault()
          setOpen(true)
        }}
        data-pw='post-unpublish-from-community-trigger'
      >
        {t('extracted.posts.unpublishFromCommunityMenuItem.unpublish_2db04a54')}
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
                void handleUnpublish()
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

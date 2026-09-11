'use client'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Community, CommunityMember } from '@/types/api-responses'
import type { CommunityMembersManagerState } from './use-community-members-manager'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  community: Community
  member: CommunityMember
  state: CommunityMembersManagerState
  username?: string | null
}

export function TransferOwnershipDialog({ community, member, state, username }: Props) {
  const t = useTranslations()
  const transferLoading =
    state.loading !== null &&
    state.loading.userId === member.user_id &&
    state.loading.action === 'transfer'
  return (
    <AlertDialog
      open={state.transferDialogUserId === member.user_id}
      onOpenChange={(open: boolean) => {
        if (!open && transferLoading) return
        state.setTransferDialogUserId(open ? member.user_id : null)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          size='sm'
          variant='outline'
        >
          {t('extracted.communities.communityTransferOwnershipDialog.transferOwnership_f49cda3a')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('extracted.communities.communityTransferOwnershipDialog.transferOwnership_f49cda3a')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'extracted.communities.communityTransferOwnershipDialog.areYouSureYouWantTo_3365249e',
            )}{' '}
            <strong>{community.name}</strong>{' '}
            {t(
              'extracted.communities.communityTransferOwnershipDialog.toUsernameYouWillBecomeA_493d73ea',
              {
                username: username
                  ? `@${username}`
                  : t('extracted.communities.communityTransferOwnershipDialog.thisUser_0913f7bb'),
              },
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={transferLoading}>
            {t('extracted.communities.communityTransferOwnershipDialog.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={transferLoading}
            onClick={e => {
              e.preventDefault()
              state.handleTransferOwnership(member.user_id).catch(() => {})
            }}
          >
            {transferLoading
              ? t('extracted.communities.communityTransferOwnershipDialog.transferring_c24da486')
              : t(
                  'extracted.communities.communityTransferOwnershipDialog.transferOwnership_f49cda3a',
                )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

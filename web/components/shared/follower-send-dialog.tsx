'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PublicUser } from '@/types/user'
import type { Audience } from './follower-share-actions-utils'
import { FollowerSendAudienceToggle } from './follower-send-audience-toggle'
import { FollowerSendPicker } from './follower-send-picker'
import { useTranslations } from '@/lib/i18n/use-translations'

interface FollowerSendDialogProps {
  open: boolean
  audience: Audience
  currentUserId: string
  isSendPending: boolean
  selectedFollowers: PublicUser[]
  onAudienceChange: (audience: Audience) => void
  onOpenChange: (open: boolean) => void
  onSend: () => void
  onToggleFollowerSelection: (follower: PublicUser) => void
}

export function FollowerSendDialog({
  open,
  audience,
  currentUserId,
  isSendPending,
  selectedFollowers,
  onAudienceChange,
  onOpenChange,
  onSend,
  onToggleFollowerSelection,
}: FollowerSendDialogProps) {
  const t = useTranslations()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle data-pw='follower-send-dialog-title'>
            {t('extracted.shared.followerSendDialog.sendToFollowers_2359fc98')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'extracted.shared.followerSendDialog.notificationsAreOnlyDeliveredToPeople_ffe546a1',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <FollowerSendAudienceToggle
            audience={audience}
            onAudienceChange={onAudienceChange}
          />

          {audience === 'selected_followers' ? (
            <FollowerSendPicker
              currentUserId={currentUserId}
              selectedFollowers={selectedFollowers}
              onToggleFollowerSelection={onToggleFollowerSelection}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('extracted.shared.followerSendDialog.cancel_19766ed6')}
          </Button>
          <Button
            type='button'
            loading={isSendPending}
            disabled={isSendPending}
            onClick={onSend}
            data-pw='follower-send-dialog-send-button'
          >
            {isSendPending
              ? t('extracted.shared.followerSendDialog.sending_286a3af7')
              : t('extracted.shared.followerSendDialog.sendNow_58803287')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

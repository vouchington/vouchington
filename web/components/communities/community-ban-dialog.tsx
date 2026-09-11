'use client'

import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Community, CommunityMember } from '@/types/api-responses'
import type { CommunityMembersManagerState } from './use-community-members-manager'
import { durationToExpiresAt } from './community-ban-duration'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  banLoading: boolean
  community: Community
  member: CommunityMember
  state: CommunityMembersManagerState
  username?: string | null
}

export function BanDialog({ banLoading, community, member, state, username }: Props) {
  const t = useTranslations()
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState<string>('permanent')

  return (
    <AlertDialog
      open={state.banDialogUserId === member.user_id}
      onOpenChange={(open: boolean) => {
        if (!open && banLoading) return
        state.setBanDialogUserId(open ? member.user_id : null)
        if (!open) {
          setReason('')
          setDuration('permanent')
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          size='sm'
          variant='destructive'
          data-pw='community-ban-button'
        >
          {t('extracted.communities.communityBanDialog.ban_520ed297')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('extracted.communities.communityBanDialog.banUsername_04e31eee', {
              username: username
                ? `@${username}`
                : t('extracted.communities.communityBanDialog.thisUser_0913f7bb'),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('extracted.communities.communityBanDialog.banningThisUserFrom_49d3df6d')}{' '}
            <strong>{community.name}</strong>{' '}
            {t(
              'extracted.communities.communityBanDialog.willRemoveThemImmediatelyAndPrevent_a12de058',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='space-y-3 py-2'>
          <div className='space-y-1'>
            <Label htmlFor={`ban-reason-${member.user_id}`}>
              {t('extracted.communities.communityBanDialog.reasonOptional_0f7d4664')}
            </Label>
            <Textarea
              id={`ban-reason-${member.user_id}`}
              placeholder={t(
                'extracted.communities.communityBanDialog.enterAReasonVisibleToModerators_12946daf',
              )}
              value={reason}
              onChange={e => setReason(e.target.value)}
              data-pw='community-ban-reason'
              rows={3}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor={`ban-duration-${member.user_id}`}>
              {t('extracted.communities.communityBanDialog.duration_4fc52a3c')}
            </Label>
            <Select
              value={duration}
              onValueChange={setDuration}
            >
              <SelectTrigger
                id={`ban-duration-${member.user_id}`}
                aria-label={t('extracted.communities.communityBanDialog.banDuration_e6862630')}
                data-pw='community-ban-duration'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='permanent'>
                  {t('extracted.communities.communityBanDialog.permanent_455a9549')}
                </SelectItem>
                <SelectItem value='1'>
                  {t('extracted.communities.communityBanDialog.1Day_fa665d95')}
                </SelectItem>
                <SelectItem value='7'>
                  {t('extracted.communities.communityBanDialog.7Days_7f920bb6')}
                </SelectItem>
                <SelectItem value='30'>
                  {t('extracted.communities.communityBanDialog.30Days_ffd72805')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={banLoading}>
            {t('extracted.communities.communityBanDialog.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={banLoading}
            data-pw='community-ban-confirm'
            onClick={e => {
              e.preventDefault()
              state
                .handleBan(member.user_id, {
                  reason: reason || undefined,
                  expiresAt: durationToExpiresAt(duration),
                })
                .catch(() => {})
            }}
          >
            {banLoading
              ? t('extracted.communities.communityBanDialog.banning_0a933b8e')
              : t('extracted.communities.communityBanDialog.banUser_29b589a6')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

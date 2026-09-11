'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { CommunityInvite } from '@/types/api-responses/pagination-and-entities'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  invite: CommunityInvite
  loading: boolean
  onRevoke: (inviteId: string) => void
}

export function InviteItem({ invite, loading, onRevoke }: Props) {
  const t = useTranslations()
  const isPending = !invite.revoked_at && !invite.accepted_at && !invite.declined_at
  const status = isPending
    ? { label: t('extracted.communities.inviteItem.pending_331551b0'), variant: 'outline' as const }
    : invite.revoked_at
      ? {
          label: t('extracted.communities.inviteItem.revoked_f6f738d0'),
          variant: 'destructive' as const,
        }
      : invite.accepted_at
        ? {
            label: t('extracted.communities.inviteItem.accepted_a00fb0c5'),
            variant: 'default' as const,
          }
        : {
            label: t('extracted.communities.inviteItem.declined_dce083a2'),
            variant: 'secondary' as const,
          }

  return (
    <div className='flex items-center justify-between rounded-md border bg-card p-4'>
      <div>
        <p className='text-sm font-medium'>
          {invite.invited_email ??
            invite.invited_user_id ??
            t('extracted.communities.inviteItem.unknownRecipient_5c401ba0')}
        </p>
        <p
          className='text-xs text-muted-foreground'
          suppressHydrationWarning
        >
          {t('extracted.communities.inviteItem.codeCodeSentSentdate_a7693ef0', {
            code: invite.code,
            sentDate: new Date(invite.created_at).toLocaleDateString(),
          })}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Badge variant={status.variant}>{status.label}</Badge>
        {isPending && (
          <Button
            size='sm'
            variant='outline'
            loading={loading}
            disabled={loading}
            onClick={() => onRevoke(invite.id)}
          >
            {loading
              ? t('extracted.communities.inviteItem.revoking_cab1ba57')
              : t('extracted.communities.inviteItem.revoke_87e6d00b')}
          </Button>
        )}
      </div>
    </div>
  )
}

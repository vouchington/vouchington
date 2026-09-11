'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { redeemInviteCode } from '@/lib/api/client'
import { createCommunityPathname } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'

interface InviteRedemptionProps {
  code: string
}

export function InviteRedemption({ code }: InviteRedemptionProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const [loading, setLoading] = useState(false)
  const [redeemed, setRedeemed] = useState(false)

  async function handleRedeem() {
    setLoading(true)
    try {
      const result = await redeemInviteCode(code)
      setRedeemed(true)
      push(createCommunityPathname(result.community_invite.community_id))
    } catch (error: unknown) {
      /* c8 ignore next -- error path requires injecting a redeem invite failure */
      const status = (error as { status?: number }).status
      if (status === 404) {
        toast.error('This invite link is invalid or has already been used.')
      } else if (status === 403) {
        toast.error('This invite was sent to a specific user.')
      } else if (status === 409) {
        toast.error('You are already a member of this community.')
      } else {
        toast.error('Failed to redeem invite. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (redeemed) {
    return (
      <div className='rounded-md border bg-card p-4 text-center'>
        <h1 className='text-xl font-semibold'>
          {t('extracted.communities.inviteRedemption.joiningCommunity_dfab6534')}
        </h1>
      </div>
    )
  }

  return (
    <div className='rounded-md border bg-card p-4 text-center space-y-4'>
      <h1 className='text-2xl font-bold'>
        {t('extracted.communities.inviteRedemption.youVeBeenInvited_ac8e57b9')}
      </h1>
      <p className='text-muted-foreground'>
        {t('extracted.communities.inviteRedemption.youHaveBeenInvitedToJoin_6562fdfe')}
      </p>
      <Button
        onClick={handleRedeem}
        loading={loading}
        disabled={loading}
        size='lg'
      >
        {loading ? 'Joining...' : 'Accept Invite'}
      </Button>
    </div>
  )
}

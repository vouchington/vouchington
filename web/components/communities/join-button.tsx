'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { joinCommunity, leaveCommunity } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/context'
import { createCommunityPathname } from '@/lib/links/entity-href'
import type { CommunityMember, CommunityVisibility } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface JoinButtonProps {
  communitySlug: string
  visibility: CommunityVisibility
  membership?: CommunityMember | null
  hasPendingApplication?: boolean
}

export default function JoinButton({
  communitySlug,
  visibility,
  membership,
  hasPendingApplication,
}: JoinButtonProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const pathname = usePathname()
  const { currentUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [memberOverride, setMemberOverride] = useState<boolean | null>(null)
  const membershipKey = `${communitySlug}:${membership == null}:${membership?.removed_at ?? ''}`
  const [seenMembershipKey, setSeenMembershipKey] = useState(membershipKey)
  if (seenMembershipKey !== membershipKey) {
    setSeenMembershipKey(membershipKey)
    setMemberOverride(null)
  }

  if (!currentUser) {
    const loginHref = `/login?next=${encodeURIComponent(pathname)}`
    return (
      <Button
        size='touchSm'
        asChild
        data-pw='join-button-signed-out'
      >
        <Link
          href={loginHref}
          prefetch={false}
        >
          {t('extracted.communities.joinButton.join_fd30fe68')}
        </Link>
      </Button>
    )
  }

  const isMember = memberOverride ?? (membership != null && membership.removed_at == null)
  const isPrivate = visibility === 'private'

  if (!isMember && isPrivate && hasPendingApplication) {
    return (
      <Button
        size='touchSm'
        variant='outline'
        disabled
        data-pw='join-button-application-pending'
      >
        {t('extracted.communities.joinButton.applicationPending_07bf3b11')}
      </Button>
    )
  }

  if (!isMember && isPrivate) {
    return (
      <Button
        asChild
        size='touchSm'
        variant='outline'
      >
        <Link
          href={createCommunityPathname(communitySlug, '/apply')}
          prefetch={false}
        >
          {t('extracted.communities.joinButton.applyToJoin_8e81ad87')}
        </Link>
      </Button>
    )
  }

  async function handleJoin() {
    setLoading(true)
    try {
      await joinCommunity(communitySlug)
      setMemberOverride(true)
      refresh()
    } catch {
      toast.error('Failed to join community. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLeave() {
    setLoading(true)
    try {
      await leaveCommunity(communitySlug)
      setMemberOverride(false)
      refresh()
    } catch {
      toast.error('Failed to leave community. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (isMember) {
    return (
      <Button
        variant='outline'
        size='touchSm'
        loading={loading}
        disabled={loading}
        onClick={handleLeave}
      >
        {loading ? 'Leaving...' : 'Leave'}
      </Button>
    )
  }

  return (
    <Button
      size='touchSm'
      loading={loading}
      disabled={loading}
      onClick={handleJoin}
      data-pw='community-join-button'
    >
      {loading ? 'Joining...' : 'Join'}
    </Button>
  )
}

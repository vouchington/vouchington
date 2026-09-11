'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useLoginHref } from '@/hooks/use-login-href'
import { useAuth } from '@/lib/auth/context'
import { EntityBookmarkButton } from './entity-bookmark-button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface FollowButtonProps {
  entityType: string
  entityId: string
  isFollowing?: boolean
  tooltip?: string
  currentUserId?: string | null
  'data-pw'?: string
  inactiveLabel?: string
  activeLabel?: string
  onChange?: (isActive: boolean) => void
}

export function FollowButton({
  entityType,
  entityId,
  isFollowing,
  tooltip,
  currentUserId,
  'data-pw': dataPw = 'follow-button',
  inactiveLabel,
  activeLabel,
  onChange,
}: FollowButtonProps) {
  const t = useTranslations()
  const { currentUser, isAuthenticated } = useAuth()
  const loginHref = useLoginHref('follow')
  const resolvedInactiveLabel = inactiveLabel ?? t('extracted.shared.followButton.follow_641d1ef6')
  const resolvedActiveLabel = activeLabel ?? t('extracted.shared.followButton.following_344b4271')

  if (entityType === 'user' && (currentUserId ?? currentUser?.id) === entityId) {
    return null
  }

  if (!isAuthenticated) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='default'
              size='touchSm'
              asChild
            >
              <Link
                href={loginHref}
                prefetch={false}
                aria-label={t(
                  'extracted.shared.followButton.inactivelabelSignInToFollow_a4f126b5',
                  { inactiveLabel: resolvedInactiveLabel },
                )}
                data-pw='signed-out-follow-link'
              >
                {resolvedInactiveLabel}
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t('extracted.shared.followButton.signInToFollow_35dd4152')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <EntityBookmarkButton
      entityType={entityType}
      entityId={entityId}
      predicate='follow'
      activeLabel={resolvedActiveLabel}
      inactiveLabel={resolvedInactiveLabel}
      errorLabel='follow'
      initialActive={isFollowing}
      tooltip={tooltip}
      data-pw={dataPw}
      onChange={onChange}
    />
  )
}

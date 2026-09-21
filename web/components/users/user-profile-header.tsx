'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserAvatar } from '@/components/shared/user-avatar'
import { RssFeedLink } from '@/components/shared/rss-feed-link'
import { UserOfficialBadge } from '@/components/shared/user-official-badge'
import { Button } from '@/components/ui/button'
import { MARKDOWN_CONTENT_FEATURES_UTM } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { UserProfileLinks } from './profile-links'
import { IdentityVerifiedBadge } from './identity-verified-badge'
import { getDisplayName } from '@/lib/users/user-helpers'
import { useAuth } from '@/lib/auth/context'
import type { User, UserMetrics, ProfileLink } from '@/types/user'
import { createUserPathname, userHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import { isOfficialAccount } from '@/lib/auth/official-account'
import type { FollowButton as FollowButtonComponent } from '@/components/shared/follow-button'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowButton = dynamic<Parameters<typeof FollowButtonComponent>[0]>(() =>
  import('@/components/shared/follow-button').then(mod => mod.FollowButton),
)

interface UserProfileHeaderProps {
  user: Pick<
    User,
    | 'id'
    | 'username'
    | 'profile_image_id'
    | 'profile_image_placement'
    | 'is_official_account'
    | 'is_agent'
    | 'display_account'
    | 'verification_status'
    | 'verified_badge_visible'
    | 'verified_display_name'
  > & { roles?: readonly string[] }
  metrics?: Pick<UserMetrics, 'count'>
  profileLinks?: Array<Pick<ProfileLink, 'id' | 'link_type' | 'url' | 'handle' | 'name'>>
  aboutHtml?: string | null
  isAdmin?: boolean
}

export function UserProfileHeader({
  user,
  metrics,
  profileLinks,
  aboutHtml,
  isAdmin = false,
}: UserProfileHeaderProps) {
  const t = useTranslations()
  const router = useRouter()
  const { currentUser } = useAuth()
  const currentUserId = currentUser?.id
  const displayName = getDisplayName(user)
  const avatarLabel =
    user.username || displayName || t('extracted.users.userProfileHeader.user_b512d97e')
  const canFollow = currentUserId !== user.id
  const showOfficialBadge = user.is_official_account ?? isOfficialAccount(user)
  const summaryItems = [
    metrics?.count.reviews
      ? t('shared.countLabel.format', { count: metrics.count.reviews, unit: 'review' })
      : null,
    metrics?.count.discussions
      ? t('shared.countLabel.format', { count: metrics.count.discussions, unit: 'discussion' })
      : null,
    metrics?.count.comments
      ? t('shared.countLabel.format', { count: metrics.count.comments, unit: 'comment' })
      : null,
  ].filter(Boolean)

  return (
    <div
      data-pw='user-profile-header'
      className='rounded-lg border bg-card p-4'
    >
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
        <UserAvatar
          profileImageId={user.profile_image_id}
          profileImagePlacement={user.profile_image_placement}
          username={avatarLabel}
          size='lg'
        />
        <div className='min-w-0'>
          <h1 className='text-3xl font-bold'>
            <Link
              href={userHref(user)}
              prefetch={false}
              className='hover:underline focus-visible:underline'
            >
              {displayName}
            </Link>
          </h1>
          <div className='flex items-center gap-1.5'>
            {user.username && (
              <Link
                href={userHref(user)}
                prefetch={false}
                className='inline-flex min-h-7 items-center text-muted-foreground transition-colors hover:text-foreground'
              >
                {t('extracted.users.userProfileHeader.username_6da31ba5', {
                  username: user.username,
                })}
              </Link>
            )}
            <UserOfficialBadge
              isOfficial={showOfficialBadge}
              isAgent={user.is_agent}
            />
            {user.verification_status === 'verified' && user.verified_badge_visible && (
              <IdentityVerifiedBadge />
            )}
          </div>
          {user.verified_display_name && (
            <p className='text-sm text-muted-foreground'>{user.verified_display_name}</p>
          )}
          {summaryItems.length > 0 && (
            <p className='mt-2 text-sm text-muted-foreground'>{summaryItems.join(' • ')}</p>
          )}
          <div className='mt-4 flex flex-wrap items-center gap-2'>
            {profileLinks && profileLinks.length > 0 && (
              <UserProfileLinks
                variant='badges'
                links={profileLinks}
                t={t}
              />
            )}
            {user.username && (
              <RssFeedLink href={`/rss/posts?user=${encodeURIComponent(user.username)}`} />
            )}
            {canFollow && (
              <FollowButton
                entityType='user'
                entityId={user.id}
                tooltip={t('extracted.users.userProfileHeader.theyLlBeNotifiedWhenYou_4020b06b')}
                onChange={isFollowing => {
                  if (isFollowing && currentUser && !isOfficialAccount(currentUser)) {
                    router.refresh()
                  }
                }}
              />
            )}
            {isAdmin && (
              <Button
                asChild
                variant='outline'
              >
                <Link
                  href={createUserPathname(encodeURIComponent(user.username ?? user.id), '/admin')}
                  prefetch={false}
                >
                  {t('extracted.users.userProfileHeader.admin_c1c224b0')}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
      {aboutHtml && (
        <MarkdownContent
          html={aboutHtml}
          className='prose prose-sm mt-4 max-w-none dark:prose-invert line-clamp-4 [&_img]:hidden [&_pre]:hidden [&_table]:hidden'
          features={MARKDOWN_CONTENT_FEATURES_UTM}
        />
      )}
    </div>
  )
}

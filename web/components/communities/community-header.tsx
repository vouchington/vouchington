'use client'

import dynamic from 'next/dynamic'
import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { CommunityProxyBookmarkButton } from './community-proxy-bookmark-button'
import { getImageUrl } from '@/lib/utils/image-url'
import type { Community, CommunityMember, CommunityMetrics } from '@/types/api-responses'
import { communityHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const JoinButton = dynamic(() => import('./join-button'))
// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const MessageModsButton = dynamic(() => import('./message-mods-button'))

interface CommunityHeaderProps {
  community: Community
  metrics?: CommunityMetrics
  membership?: CommunityMember | null
  hasPendingApplication?: boolean
}

export function CommunityHeader({
  community,
  metrics,
  membership,
  hasPendingApplication,
}: CommunityHeaderProps) {
  const t = useTranslations()
  const isMember = membership != null && membership.removed_at == null
  const isMod = isMember && (membership.role === 'owner' || membership.role === 'moderator')

  return (
    <div className='space-y-4'>
      {community.banner_image_id && (
        <div className='relative h-40 w-full overflow-hidden rounded-xl bg-muted lg:h-56'>
          <Image
            src={getImageUrl(community.banner_image_id, { width: 1200 })}
            alt={t('extracted.communities.communityHeader.nameBanner_9c730ecf', {
              name: community.name,
            })}
            fill
            sizes='(max-width: 1200px) 100vw, 1200px'
            unoptimized
            className='object-cover'
          />
        </div>
      )}
      <div className='flex flex-col gap-3'>
        <div className='flex items-start gap-3'>
          {community.profile_image_id && (
            <div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted'>
              <Image
                src={getImageUrl(community.profile_image_id, { width: 128 })}
                alt={t('extracted.communities.communityHeader.nameProfile_8fa6c108', {
                  name: community.name,
                })}
                fill
                sizes='64px'
                unoptimized
                className='object-cover'
              />
            </div>
          )}
          <div>
            <div className='flex flex-wrap items-center gap-2'>
              <h1
                className='text-2xl font-bold'
                data-pw='community-header-name'
              >
                <Link
                  href={communityHref(community)}
                  prefetch={false}
                  className='hover:underline focus-visible:underline'
                >
                  {community.name}
                </Link>
              </h1>
              {community.visibility === 'private' && (
                <Badge variant='secondary'>
                  {t('extracted.communities.communityHeader.private_c63eb672')}
                </Badge>
              )}
            </div>
            {metrics && (
              <p
                className='text-sm text-muted-foreground'
                data-pw='community-header-metrics'
              >
                {t('extracted.communities.communityHeader.membercountPostcount_008daebc', {
                  memberCount: t('shared.countLabel.format', {
                    count: metrics.member_count,
                    unit: 'member',
                  }),
                  postCount: t('shared.countLabel.format', {
                    count: metrics.post_count,
                    unit: 'post',
                  }),
                })}
              </p>
            )}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {community.list_type && (
            <CommunityProxyBookmarkButton
              communityId={community.id}
              kind={community.list_type}
              variant='default'
            />
          )}
          <JoinButton
            communitySlug={community.slug}
            visibility={community.visibility}
            membership={membership}
            hasPendingApplication={hasPendingApplication}
          />
          {isMember && !isMod && <MessageModsButton communitySlug={community.slug} />}
        </div>
      </div>
    </div>
  )
}

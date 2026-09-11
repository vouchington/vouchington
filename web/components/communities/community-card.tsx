'use client'

import Link from 'next/link'
import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/badge'
import { HoverableCard } from '@/components/shared/hoverable-card'
import { getImageUrl } from '@/lib/utils/image-url'
import { communityHref } from '@/lib/links/entity-href'
import type { Community, CommunityMember, CommunityMetrics } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const JoinButton = dynamic(() => import('./join-button'))

interface CommunityCardProps {
  community: Pick<Community, 'slug' | 'name' | 'visibility' | 'markdown' | 'profile_image_id'>
  metrics?: Pick<CommunityMetrics, 'member_count' | 'post_count' | 'list_item_count'>
  membership?: CommunityMember | null
  hasPendingApplication?: boolean
  hideJoinButton?: boolean
}

export function CommunityCard({
  community,
  metrics,
  membership,
  hasPendingApplication,
  hideJoinButton = false,
}: CommunityCardProps) {
  const t = useTranslations()
  const isMember = membership != null && membership.removed_at == null

  const metricsParts: string[] = []
  if (metrics) {
    metricsParts.push(
      t('shared.countLabel.format', { count: metrics.member_count, unit: 'member' }),
    )
    metricsParts.push(t('shared.countLabel.format', { count: metrics.post_count, unit: 'post' }))
    if (metrics.list_item_count > 0) {
      metricsParts.push(
        t('shared.countLabel.format', { count: metrics.list_item_count, unit: 'listItem' }),
      )
    }
  }

  return (
    <HoverableCard data-pw='community-card'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <Link
              href={communityHref(community)}
              prefetch={false}
              className='truncate text-base font-semibold hover:underline'
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
              data-pw={`community-card-link-${community.slug}`}
            >
              {community.name}
            </Link>
            {community.visibility === 'private' && (
              <Badge variant='secondary'>
                {t('extracted.communities.communityCard.private_c63eb672')}
              </Badge>
            )}
            {isMember && (
              <Badge
                variant='outline'
                data-pw='community-card-joined-badge'
              >
                {t('extracted.communities.communityCard.joined_69318b0c')}
              </Badge>
            )}
          </div>
          {community.markdown && (
            <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>{community.markdown}</p>
          )}
          {metricsParts.length > 0 && (
            <p className='mt-1 text-sm text-muted-foreground'>{metricsParts.join(' · ')}</p>
          )}
        </div>
        <div className='flex shrink-0 flex-col items-end gap-2'>
          {community.profile_image_id && (
            <Image
              src={getImageUrl(community.profile_image_id, { width: 80 })}
              alt={`${community.name} icon`}
              width={40}
              height={40}
              unoptimized
              className='rounded-md object-cover'
            />
          )}
          {!hideJoinButton && (
            <JoinButton
              communitySlug={community.slug}
              visibility={community.visibility}
              membership={membership}
              hasPendingApplication={hasPendingApplication}
            />
          )}
        </div>
      </div>
    </HoverableCard>
  )
}

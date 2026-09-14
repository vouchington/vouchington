'use client'

import { useRouter } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from '@/components/users/relation-management-action'
import type { ViewRssFeed } from '@/types/rss-feeds'
import type { FollowButton as FollowButtonComponent } from '@/components/shared/follow-button'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowButton = nextDynamic<Parameters<typeof FollowButtonComponent>[0]>(() =>
  import('@/components/shared/follow-button').then(m => ({ default: m.FollowButton })),
)

export type RssFeedListItemAction =
  | { kind: 'follow' }
  | { kind: 'relation'; config: RelationManagementActionConfig }

interface RssFeedActionSlotProps {
  feed: ViewRssFeed
  action: RssFeedListItemAction
  isFollowing: boolean
  isFollowingTopic: boolean
  refreshOnUnfollow?: boolean
}

export function RssFeedActionSlot({
  feed,
  action,
  isFollowing,
  isFollowingTopic,
  refreshOnUnfollow = false,
}: RssFeedActionSlotProps) {
  const router = useRouter()

  if (action.kind === 'relation') {
    return (
      <RelationManagementAction
        entityId={feed.id}
        config={action.config}
      />
    )
  }

  return (
    <>
      <FollowButton
        entityType='rss_feed'
        entityId={feed.id}
        isFollowing={isFollowing}
        inactiveLabel='Follow Source'
        activeLabel='Following Source'
        data-pw='source-list-follow-source-button'
        onChange={refreshOnUnfollow ? (active: boolean) => !active && router.refresh() : undefined}
      />
      <FollowButton
        entityType='topic'
        entityId={feed.topic.id}
        isFollowing={isFollowingTopic}
        inactiveLabel='Follow Topic'
        activeLabel='Following Topic'
        data-pw='source-list-follow-topic-button'
      />
    </>
  )
}

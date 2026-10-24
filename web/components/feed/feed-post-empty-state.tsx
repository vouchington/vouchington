import Link from 'next/link'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import type { PostFeedRouteConfig } from '@/lib/feed-route-configs'

export function FeedPostEmptyState({
  feedType,
  labels,
}: {
  feedType: PostFeedRouteConfig['feedType']
  labels: {
    yourFeedIsEmpty: string
    followTopicsAndPeople: string
    noPostsFromPeople: string
    followPeople: string
    noPostsYet: string
    followSomeTopics: string
    browseTopics: string
    browseFollowedTopics: string
    findFriends: string
  }
}) {
  if (feedType === 'any') {
    return (
      <EmptyState
        icon='message-square'
        title={labels.yourFeedIsEmpty}
        description={labels.followTopicsAndPeople}
      >
        <div className='flex gap-2'>
          <Button
            asChild
            variant='outline'
            size='default'
          >
            <Link
              data-pw='feed-post-list-page-any-browse-topics'
              href='/topics'
              prefetch={false}
            >
              {labels.browseTopics}
            </Link>
          </Button>
          <Button
            asChild
            variant='outline'
            size='default'
          >
            <Link
              data-pw='feed-post-list-page-any-find-friends'
              href='/my/friend-recommendations'
              prefetch={false}
            >
              {labels.findFriends}
            </Link>
          </Button>
        </div>
      </EmptyState>
    )
  }
  if (feedType === 'follow_users') {
    return (
      <EmptyState
        icon='message-square'
        title={labels.noPostsFromPeople}
        description={labels.followPeople}
      >
        <Button
          asChild
          variant='outline'
          size='default'
        >
          <Link
            data-pw='feed-post-list-page-follow-users-find-friends'
            href='/my/friend-recommendations'
            prefetch={false}
          >
            {labels.findFriends}
          </Link>
        </Button>
      </EmptyState>
    )
  }
  if (feedType === 'follow_topics') {
    return (
      <EmptyState
        icon='message-square'
        title={labels.noPostsYet}
        description={labels.followSomeTopics}
      >
        <Button
          asChild
          variant='outline'
          size='default'
        >
          <Link
            data-pw='feed-post-list-page-follow-topics-browse-topics'
            href='/topics'
            prefetch={false}
          >
            {labels.browseFollowedTopics}
          </Link>
        </Button>
      </EmptyState>
    )
  }
  return null
}

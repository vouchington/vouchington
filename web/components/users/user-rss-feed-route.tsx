import { notFound } from 'next/navigation'
import { getUserRssFeedsCollection } from '@/lib/api/server'
import { EmptyState } from '@/components/shared/empty-state'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function UserViewedRssFeedRoute({
  idOrUsername,
  feedType,
  emptyTitle,
  emptyDescription,
}: {
  idOrUsername: string
  feedType?: 'article' | 'podcast' | 'video'
  emptyTitle?: string
  emptyDescription?: string
}) {
  const t = await getTranslations()
  const feedsData = await getUserRssFeedsCollection(idOrUsername, 'viewed', { feedType })
  if (!feedsData) notFound()

  if (feedsData.results.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? t('extracted.users.userRssFeedRoute.noRecentlyViewedFeeds_a76ac15f')}
        description={
          emptyDescription ??
          t('extracted.users.userRssFeedRoute.thereAreNoRecentlyViewedFeeds_722a13c8')
        }
      />
    )
  }

  const bookmarks = feedsData.bookmarks ?? {}
  const topicElections = feedsData.topic_elections ?? {}
  const hostnameElections = feedsData.hostname_elections ?? {}
  const electionVotes = feedsData.election_votes ?? {}

  return (
    <div className='space-y-4'>
      {feedsData.results.map(feed => (
        <RssFeedListItem
          key={feed.id}
          feed={feed}
          action={{ kind: 'follow' }}
          isFollowing={bookmarks[feed.id]?.follow === true}
          isFollowingTopic={feed.topic ? bookmarks[feed.topic.id]?.follow === true : false}
          hostnameElection={feed.hostname?.id ? hostnameElections[feed.hostname.id] : undefined}
          topicElection={feed.topic ? topicElections[feed.topic.id] : undefined}
          electionVoteChoice={
            feed.topic
              ? (electionVotes[feed.topic.id]?.choice as
                  | import('@/lib/api/client/elections').SentimentChoice
                  | undefined)
              : undefined
          }
        />
      ))}
    </div>
  )
}

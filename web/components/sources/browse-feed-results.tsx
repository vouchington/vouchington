import type { MessageKey } from '@ts-shared/ui-messages'
import type { getTranslations } from '@/lib/i18n/get-translations'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSearchError } from '@/components/shared/list-search-error'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import type { SentimentChoice } from '@/lib/api/client/elections'
import type { RssFeedsListResponseBody } from '@/types/api-responses'

type Translator = Awaited<ReturnType<typeof getTranslations>>

export function BrowseFeedResults({
  listTestId = 'channels-list',
  t,
  q,
  searchError,
  feeds,
  emptyTitleKey,
  emptySearchKey,
  emptyDefaultKey,
  includeHostnameElections,
}: {
  listTestId?: 'channels-list' | 'news-sources-list' | 'podcasts-list'
  t: Translator
  q: string | undefined
  searchError: string | null
  feeds: RssFeedsListResponseBody | null
  emptyTitleKey: MessageKey
  emptySearchKey: MessageKey
  emptyDefaultKey: MessageKey
  includeHostnameElections: boolean
}) {
  const bookmarks = feeds?.bookmarks ?? {}
  const hostnameElections = feeds?.hostname_elections ?? {}
  const topicElections = feeds?.topic_elections ?? {}
  const electionVotes = feeds?.election_votes ?? {}

  return (
    <div
      className='space-y-4'
      data-pw={listTestId}
    >
      {searchError && (
        <ListSearchError
          t={t}
          message={searchError}
        />
      )}
      {feeds && feeds.results.length === 0 && (
        <EmptyState
          title={t(emptyTitleKey)}
          description={q ? t(emptySearchKey) : t(emptyDefaultKey)}
          icon='search'
        />
      )}
      {feeds &&
        feeds.results.map(feed => (
          <RssFeedListItem
            key={feed.id}
            feed={feed}
            isFollowing={bookmarks[feed.id]?.follow === true}
            isFollowingTopic={bookmarks[feed.topic.id]?.follow === true}
            hostnameElection={
              includeHostnameElections && feed.hostname?.id
                ? hostnameElections[feed.hostname.id]
                : undefined
            }
            topicElection={feed.topic ? topicElections[feed.topic.id] : undefined}
            electionVoteChoice={
              feed.topic
                ? (electionVotes[feed.topic.id]?.choice as SentimentChoice | undefined)
                : undefined
            }
          />
        ))}
    </div>
  )
}

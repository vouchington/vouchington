export const dynamic = 'force-dynamic'

import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSearchError } from '@/components/shared/list-search-error'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { getRssFeeds } from '@/lib/api/server/rss-feeds'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { createPageMetadata } from '@/lib/seo/metadata'
import { createBreadcrumbSchema, createCollectionPageSchema } from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { PageWithAside } from '@/components/page-with-aside'
import { PageHeader } from '@/components/shared/page-header'
import { podcastsHref } from '@/lib/links/entity-href'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PageProps {
  params: Promise<{ category: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: PageProps) {
  const { category } = await params
  const displayName = category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return createPageMetadata({
    title: `${displayName} Podcasts`,
    description: `Browse ${displayName} podcast shows on Voucha.`,
    path: `/podcasts/${category}`,
  })
}

export default async function PodcastCategoryPage({ params, searchParams }: PageProps) {
  const t = await getTranslations()
  const [{ category }, queryParams] = await Promise.all([params, searchParams])
  const q = typeof queryParams.q === 'string' ? queryParams.q : undefined
  const displayName = category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const [currentUser, feedsResult] = await Promise.all([
    getCurrentUser(),
    getRssFeeds({
      searchParams: {
        feed_type: 'podcast',
        discoverable: true,
        // The category slug is resolved to a topic_id by the backend search-params parser.
        category,
        q,
        enabled: true,
        limit: 50,
      },
    }).catch(error => {
      const message = getListSearchErrorMessage(error)
      if (!message) throw error
      return { error: message }
    }),
  ])

  const hasSearchError = isListSearchErrorResult(feedsResult)
  const searchError = hasSearchError ? feedsResult.error : null
  const feeds = hasSearchError ? null : feedsResult

  const bookmarks = feeds?.bookmarks ?? {}
  const topicElections = feeds?.topic_elections ?? {}
  const electionVotes = feeds?.election_votes ?? {}

  const breadcrumbItems = buildBreadcrumbsForPath(`/podcasts/${category}`, {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [
      { name: t('extracted.category.page.podcasts_e7f8091a'), path: podcastsHref() },
      { name: displayName, path: `/podcasts/${category}` },
    ],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: `${displayName} Podcasts`,
            description: `Browse ${displayName} podcast shows on Voucha.`,
            path: `/podcasts/${category}`,
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <PageHeader
          title={t('extracted.category.page.displaynamePodcasts_70092df4', { displayName })}
          description={t('extracted.category.page.podcastShowsInTheDisplaynameCategory_f8091a2b', {
            displayName,
          })}
        />

        <div
          className='space-y-4'
          data-pw='podcasts-category-list'
        >
          {searchError && (
            <ListSearchError
              t={t}
              message={searchError}
            />
          )}
          {feeds && feeds.results.length === 0 && (
            <EmptyState
              title={t('extracted.category.page.noDisplaynamePodcastsFound_558cd966', {
                displayName,
              })}
              description={t('extracted.category.page.noPodcastShowsHaveBeenAdded_091a2b3c')}
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
      </div>
    </PageWithAside>
  )
}

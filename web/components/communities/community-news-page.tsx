import { notFound } from 'next/navigation'
import { LinkSelectDropdown } from '@/components/shared/link-select-dropdown'
import { NewsItemClusterList } from '@/components/news/news-item-cluster-list'
import { EmptyState } from '@/components/shared/empty-state'
import { RssFeedItemModal } from '@/components/rss-feed-items/rss-feed-item-modal'
import { NewsFilters } from '@/components/news/news-filters'
import { ListSearchError } from '@/components/shared/list-search-error'
import { getCommunity, getCommunityNews } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createCommunityPathname } from '@/lib/links/entity-href'
import type { NewsFeedType } from '@/lib/feed-route-configs'

interface CommunityNewsFilter {
  feedType: Extract<NewsFeedType, 'any' | 'follow_rss_feeds' | 'follow_topics'>
  label: string
  segment?: string
}

interface CommunityNewsPageProps {
  filter: CommunityNewsFilter
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const COMMUNITY_NEWS_FILTERS: CommunityNewsFilter[] = [
  { feedType: 'any', label: 'All' },
  { feedType: 'follow_rss_feeds', label: 'Sources', segment: 'sources' },
  { feedType: 'follow_topics', label: 'Topics', segment: 'topics' },
]

const communityNewsEmptyState = (
  <EmptyState
    icon='inbox'
    title='No news yet'
    description='Add topics or feeds to this community list to show news here.'
  />
)

export async function CommunityNewsPage({ filter, params, searchParams }: CommunityNewsPageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const resolvedSearchParams = await searchParams
  const q = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : undefined
  const communityData = await getCommunity(slug)

  if (!communityData || communityData.has_pending_application) {
    notFound()
  }

  const nextPageParams = { limit: 25, feed_type: filter.feedType, ...(q ? { q } : {}) }
  const [currentUser, newsDataResult] = await Promise.all([
    getCurrentUser(),
    getCommunityNews(slug, { searchParams: nextPageParams }).catch(error => {
      const message = getListSearchErrorMessage(error)
      if (!message) throw error
      return { error: message }
    }),
  ])
  const hasSearchError = isListSearchErrorResult(newsDataResult)
  const searchError = hasSearchError ? newsDataResult.error : null
  const newsData = hasSearchError ? null : newsDataResult

  const { community } = communityData
  const basePath = createCommunityPathname(community, '/news')
  const pathname = filter.segment ? `${basePath}/${filter.segment}` : basePath
  const canDiscussInCommunity = Boolean(
    currentUser &&
    (currentUser.roles.includes('administrator') ||
      (communityData.membership && !communityData.membership.removed_at)),
  )
  const communityDiscussionTarget = canDiscussInCommunity
    ? {
        id: community.id,
        name: community.name,
        slug: community.slug,
        visibility: community.visibility,
        post_approval_required_at: community.post_approval_required_at ?? null,
      }
    : undefined

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <LinkSelectDropdown
          label={filter.label}
          ariaLabel='Select community news filter'
          items={COMMUNITY_NEWS_FILTERS.map(item => {
            const href = item.segment ? `${basePath}/${item.segment}` : basePath
            const finalHref = q ? `${href}?q=${encodeURIComponent(q)}` : href
            return { label: item.label, href: finalHref, active: item.feedType === filter.feedType }
          })}
        />
        <NewsFilters />
      </div>
      {newsData ? (
        <NewsItemClusterList
          data={newsData}
          nextPageEndpoint={`/api/v1/communities/${encodeURIComponent(community.slug)}/news`}
          nextPageParams={nextPageParams}
          emptyState={communityNewsEmptyState}
          communityDiscussionTarget={communityDiscussionTarget}
        >
          <RssFeedItemModal
            pathname={pathname}
            searchParams={resolvedSearchParams}
            communityDiscussionTarget={communityDiscussionTarget}
          />
        </NewsItemClusterList>
      ) : (
        <ListSearchError
          t={t}
          message={searchError ?? 'Search failed'}
        />
      )}
    </div>
  )
}

export const COMMUNITY_NEWS_ALL_FILTER = COMMUNITY_NEWS_FILTERS[0]!
export const COMMUNITY_NEWS_SOURCES_FILTER = COMMUNITY_NEWS_FILTERS[1]!
export const COMMUNITY_NEWS_TOPICS_FILTER = COMMUNITY_NEWS_FILTERS[2]!

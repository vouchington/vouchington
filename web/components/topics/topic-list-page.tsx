/**
 * Topic list page component (Server Component)
 * Fetches topics data and renders filters, sort, and list
 */

import { getTopics } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { TopicFilters } from './topic-filters'
import { TopicList } from './topic-list'
import type { TopicRouteConfig } from '@/lib/route-configs'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { createBreadcrumbSchema, createCollectionPageSchema } from '@/lib/seo/structured-data'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { FollowTopicsAside } from '@/components/asides/follow-topics-aside'
import { TrendingTopicsAside } from '@/components/asides/trending-topics-aside'
import { RecommendedTopicsAside } from '@/components/asides/recommended-topics-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'
import { PageHeader } from '@/components/shared/page-header'
import { PageWithAside } from '@/components/page-with-aside'
import { getActiveIntent } from '@/lib/navigation/intents'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { TopicsResponseBody } from '@/types/api-responses'

export interface TopicListLoadOptions {
  searchParams: Record<string, string | number | boolean | undefined>
}

export interface TopicListLoadResult {
  data: TopicsResponseBody
  nextPageEndpoint?: string
  nextPageParams?: Record<string, string | number | boolean | undefined>
}

export type TopicListLoader = (
  options: TopicListLoadOptions,
) => Promise<TopicsResponseBody | TopicListLoadResult>

interface TopicListPageProps {
  config: TopicRouteConfig
  searchParams: Promise<Record<string, string | string[] | undefined>>
  loadPage?: TopicListLoader
  nextPageEndpoint?: string
  includeTopicTypeFilter?: boolean
  normalizeFediversePages?: boolean
}

export async function TopicListPage({
  config,
  searchParams,
  loadPage = getTopics,
  nextPageEndpoint = '/api/v1/topics',
  includeTopicTypeFilter = true,
  normalizeFediversePages = false,
}: TopicListPageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const resolvedIntentId = getActiveIntent(`/${config.pluralPath}`)
  const showRecommendedTopics = resolvedIntentId === 'topics'

  // Extract search params
  const q = typeof params.q === 'string' ? params.q : undefined
  const sort = typeof params.sort === 'string' ? params.sort : 'new'

  const queryParams = {
    ...(q ? { q } : {}),
    ...(includeTopicTypeFilter && config.topicTypes
      ? { topic_types: config.topicTypes.join(',') }
      : {}),
    ...(config.spendingCategory ? { spending_category: true } : {}),
    sort,
    limit: 25,
  }

  // Fetch page 1 server-side; subsequent pages are fetched client-side by TopicList
  const [loadResult, currentUser] = await Promise.all([
    loadPage({ searchParams: queryParams }),
    getCurrentUser(),
  ])
  const data = 'data' in loadResult ? loadResult.data : loadResult
  const resolvedNextPageEndpoint =
    ('data' in loadResult && loadResult.nextPageEndpoint) || nextPageEndpoint
  const resolvedNextPageParams = ('data' in loadResult && loadResult.nextPageParams) || queryParams

  const breadcrumbItems = buildBreadcrumbsForPath(`/${config.pluralPath}`, {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ nameKey: config.title, path: `/${config.pluralPath}` }],
  })

  return (
    <PageWithAside
      aside={
        <>
          <AboutVouchaAside />
          <SequentialAsideSuspense>
            {showRecommendedTopics && <RecommendedTopicsAside />}
            <FollowTopicsAside />
            <TrendingTopicsAside />
          </SequentialAsideSuspense>
        </>
      }
    >
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: t(config.title),
            description: t(config.description),
            path: `/${config.pluralPath}`,
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        )}

        <Breadcrumbs items={breadcrumbItems} />

        <PageHeader
          title={t(config.title)}
          description={t(config.description)}
        />

        {/* Filters */}
        <TopicFilters allowedTypes={config.topicTypes} />

        {/* Topic list */}
        <TopicList
          data={data}
          nextPageEndpoint={resolvedNextPageEndpoint}
          nextPageParams={resolvedNextPageParams}
          normalizeFediversePages={normalizeFediversePages}
        />
      </div>
    </PageWithAside>
  )
}

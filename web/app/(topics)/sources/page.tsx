import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { SourcesFilterForm } from '@/components/topics/sources-filter-form'
import { SubmitSourceButton } from '@/components/sources/submit-source-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSearchError } from '@/components/shared/list-search-error'
import { SourcesListClient } from '@/components/sources/sources-list-client'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getRssFeeds } from '@/lib/api/server/rss-feeds'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { createPageMetadata } from '@/lib/seo/metadata'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createItemListSchema,
} from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { PageWithAside } from '@/components/page-with-aside'
import { PageHeader } from '@/components/shared/page-header'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createPageMetadata({
  title: 'Sources',
  description: 'Browse RSS feeds, linked topics, and domains on Voucha.',
  path: '/sources',
})

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SourcesPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const publisherType =
    typeof params.publisher_type === 'string' ? params.publisher_type : undefined

  const [currentUser, feedsResult] = await Promise.all([
    getCurrentUser(),
    getRssFeeds({
      searchParams: {
        q,
        publisher_type: publisherType,
        include_descendants: true,
        enabled: true,
        apply_mutes: true,
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

  const breadcrumbItems = buildBreadcrumbsForPath('/sources', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Sources', path: '/sources' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: 'Sources',
            description: 'Browse RSS feeds, linked topics, and domains on Voucha.',
            path: '/sources',
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        )}
        {feeds && (
          <AnonymousStructuredDataScript
            data={createItemListSchema(
              feeds.results.slice(0, 10).map(feed => ({
                name: feed.title,
                url: feed.home_page_url?.url ?? feed.rss_feed_url.url,
              })),
              'Sources',
            )}
          />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <PageHeader
            title={t('extracted.sources.page.sources_caf85b08')}
            description={t('extracted.sources.page.browseRssFeedsJumpIntoTheLinked_9c1f4b52')}
          />
          {currentUser && <SubmitSourceButton />}
        </div>

        <SourcesFilterForm defaultPublisherType={publisherType} />

        <div className='space-y-4'>
          {searchError && (
            <ListSearchError
              t={t}
              message={searchError}
            />
          )}
          {feeds && feeds.results.length === 0 && (
            <EmptyState
              title={t('extracted.sources.page.noSourcesFound_183845bf')}
              description={
                q
                  ? t('extracted.sources.page.noSourcesMatchYourFiltersTry_bb4063ac')
                  : t('extracted.sources.page.noRssSourcesHaveBeenAdded_14f0c6db')
              }
              icon='search'
            />
          )}
          {feeds && feeds.results.length > 0 && (
            <SourcesListClient
              initialData={feeds}
              searchParams={{ q, publisherType }}
            />
          )}
        </div>
      </div>
    </PageWithAside>
  )
}

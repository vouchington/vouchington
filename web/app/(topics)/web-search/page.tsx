import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { ClientSearchForm } from '@/components/shared/client-search-form'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSearchError } from '@/components/shared/list-search-error'
import { WebSearchListClient } from '@/components/web-search/web-search-list-client'
import { getWebSearch } from '@/lib/api/server/web-search'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { createPageMetadata } from '@/lib/seo/metadata'
import { createBreadcrumbSchema, createCollectionPageSchema } from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { PageWithAside } from '@/components/page-with-aside'
import { PageHeader } from '@/components/shared/page-header'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createPageMetadata({
  title: 'Web Search',
  description: 'Search indexed pages and URLs on Voucha.',
  path: '/web-search',
})

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function WebSearchPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const query = typeof params.query === 'string' ? params.query.trim() : undefined

  const [currentUser, searchResult] = await Promise.all([
    getCurrentUser(),
    query && query.length >= 3
      ? getWebSearch({ searchParams: { query } }).catch(error => {
          const message = getListSearchErrorMessage(error)
          if (!message) throw error
          return { error: message }
        })
      : Promise.resolve(null),
  ])

  const hasSearchError = isListSearchErrorResult(searchResult)
  const searchError = hasSearchError ? searchResult.error : null
  const data = hasSearchError ? null : searchResult

  const breadcrumbItems = buildBreadcrumbsForPath('/web-search', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Web Search', path: '/web-search' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: 'Web Search',
            description: 'Search indexed pages and URLs on Voucha.',
            path: '/web-search',
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <PageHeader
          title={t('extracted.webSearch.page.webSearch_d04fc7d7')}
          description={t('extracted.webSearch.page.searchIndexedPagesAndUrls_2f8e51ac')}
        />
        <ClientSearchForm
          searchParamName='query'
          defaultValue={query}
          placeholder={t('extracted.webSearch.page.searchTheWeb_e5e6bff7')}
          label={t('extracted.webSearch.page.webSearch_d04fc7d7')}
        />
        <div className='space-y-4'>
          {searchError && (
            <ListSearchError
              t={t}
              message={searchError}
            />
          )}
          {!query || query.length < 3 ? (
            <EmptyState
              icon='search'
              title={t('extracted.webSearch.page.searchTheWeb_0d3d9dd6')}
              description={t('extracted.webSearch.page.enterAtLeast3Characters_7a19c3d1')}
            />
          ) : data ? (
            <WebSearchListClient
              initialData={data}
              query={query}
            />
          ) : null}
        </div>
      </div>
    </PageWithAside>
  )
}

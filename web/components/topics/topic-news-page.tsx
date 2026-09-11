import { getRssFeedItems } from '@/lib/api/server'
import { NewsItemList } from '@/components/feed/news-item-list'
import { RssFeedItemModal } from '@/components/rss-feed-items/rss-feed-item-modal'
import { NewsFilters } from '@/components/news/news-filters'
import { ListSearchError } from '@/components/shared/list-search-error'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function TopicNewsPage({
  id,
  pathname,
  searchParams,
}: {
  id: string
  pathname: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const t = await getTranslations()
  const q = typeof searchParams.q === 'string' ? searchParams.q : undefined
  const queryParams = { category_topic: id, ...(q ? { q } : {}), limit: 25 }
  const dataResult = await getRssFeedItems({ searchParams: queryParams }).catch(error => {
    const message = getListSearchErrorMessage(error)
    if (!message) throw error
    return { error: message }
  })
  const hasSearchError = isListSearchErrorResult(dataResult)

  return (
    <div className='space-y-4'>
      <NewsFilters />
      {hasSearchError ? (
        <ListSearchError
          t={t}
          message={dataResult.error}
        />
      ) : (
        <NewsItemList
          data={dataResult}
          nextPageEndpoint='/api/v1/rss-feed-items'
          nextPageParams={queryParams}
        >
          <RssFeedItemModal
            pathname={pathname}
            searchParams={searchParams}
          />
        </NewsItemList>
      )}
    </div>
  )
}

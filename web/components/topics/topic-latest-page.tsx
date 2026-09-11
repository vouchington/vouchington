import { getRssFeedItems } from '@/lib/api/server'
import { NewsItemList } from '@/components/feed/news-item-list'
import { RssFeedItemModal } from '@/components/rss-feed-items/rss-feed-item-modal'

export async function TopicLatestPage({
  id,
  pathname,
  searchParams,
}: {
  id: string
  pathname: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const queryParams = { topic: id, limit: 25 }
  const data = await getRssFeedItems({
    searchParams: queryParams,
  })

  return (
    <NewsItemList
      data={data}
      nextPageEndpoint='/api/v1/rss-feed-items'
      nextPageParams={queryParams}
    >
      <RssFeedItemModal
        pathname={pathname}
        searchParams={searchParams}
      />
    </NewsItemList>
  )
}

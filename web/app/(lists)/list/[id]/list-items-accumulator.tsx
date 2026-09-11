'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { ListItemRow } from '@/components/lists/list-item-row'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ListItem, ListItemsResponseBody } from '@/types/api-responses'

interface Props {
  activeTab: string
  initialData: ListItemsResponseBody
  listId: string
  mediaType?: string
}

export function ListItemsAccumulator({ activeTab, initialData, listId, mediaType }: Props) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, `/api/v1/lists/${listId}/items`, { media_type: mediaType })
  const items = uniqueItems(
    pages.flatMap(page =>
      page.results.flatMap(result => {
        const item = page.list_items[result.id]
        return item ? [item] : []
      }),
    ),
  )

  return (
    <InfiniteScroll
      hasNextPage={hasNextPage}
      endCursor={endCursor}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
      {items.length === 0 ? (
        <p
          className='text-muted-foreground'
          data-pw='list-empty'
        >
          {activeTab === 'all'
            ? t('extracted.id.page.thisListIsEmpty_7c8d9e0f')
            : t('extracted.id.page.noActivetabItemsYet_1a2b3c4d', { activeTab })}
        </p>
      ) : (
        <ul
          className='space-y-2'
          data-pw='list-items'
        >
          {items.map(item => (
            <li
              key={item.id}
              data-pw='list-item'
            >
              <ListItemRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </InfiniteScroll>
  )
}

function uniqueItems(items: ListItem[]): ListItem[] {
  return [...new Map(items.map(item => [item.id, item])).values()]
}

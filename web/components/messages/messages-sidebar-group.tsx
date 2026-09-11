'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { getMyMessagesClient } from '@/lib/api/client/messages'
import { useOptionalMessagesSidebar } from '@/lib/messages-sidebar-context'
import onError from '@/lib/on-error'
import { MessagesSidebarGroupView } from './messages-sidebar-group-view'
import { useTranslations } from '@/lib/i18n/use-translations'

const FIRST_PAGE_RETRY_DELAY_MS = 5000
const FIRST_PAGE_MAX_ATTEMPTS = 3

function scheduleFirstPageRetry(callback: () => void, attempt: number) {
  return setTimeout(callback, FIRST_PAGE_RETRY_DELAY_MS * attempt)
}

export function MessagesSidebarGroup() {
  const t = useTranslations()
  const pathname = usePathname()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [fetchError, setFetchError] = useState<Error | null>(null)
  const messagesSidebar = useOptionalMessagesSidebar()
  const isLoaded = messagesSidebar?.isLoaded
  const replaceFirstPage = messagesSidebar?.replaceFirstPage

  useEffect(() => {
    if (isLoaded || !replaceFirstPage) return
    const replaceLoadedFirstPage = replaceFirstPage
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function fetchFirstPage(attempt: number) {
      getMyMessagesClient()
        .then(result => {
          if (!cancelled) replaceLoadedFirstPage(result.results, result.page_info)
        })
        .catch(error => {
          if (!cancelled) {
            if (attempt < FIRST_PAGE_MAX_ATTEMPTS) {
              retryTimer = scheduleFirstPageRetry(() => fetchFirstPage(attempt + 1), attempt)
            } else {
              onError(error, {
                fallback: t(
                  'extracted.messages.messagesSidebarGroup.failedToLoadMessages_eeaaa7b4',
                ),
              })
            }
          }
        })
    }

    fetchFirstPage(1)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [isLoaded, replaceFirstPage, t])

  if (!messagesSidebar) return null

  const { conversations, pageInfo, appendPage } = messagesSidebar

  async function handleLoadMore() {
    if (isLoadingMore || !pageInfo?.end_cursor) return
    setIsLoadingMore(true)
    setFetchError(null)
    try {
      const result = await getMyMessagesClient(pageInfo.end_cursor)
      appendPage(result.results, result.page_info)
    } catch (error) {
      setFetchError(error instanceof Error ? error : new Error(String(error)))
      onError(error, {
        fallback: t('extracted.messages.messagesSidebarGroup.failedToLoadMoreMessages_d37c5429'),
      })
    } finally {
      setIsLoadingMore(false)
    }
  }

  const canLoadMore = pageInfo?.has_next_page === true && pageInfo.end_cursor !== null

  return (
    <InfiniteScroll
      hasNextPage={canLoadMore}
      endCursor={pageInfo?.end_cursor ?? null}
      onLoadMore={handleLoadMore}
      loadingMore={isLoadingMore}
      fetchError={fetchError}
      clearError={() => setFetchError(null)}
      resetKey={isLoaded}
    >
      <MessagesSidebarGroupView
        conversations={conversations}
        pathname={pathname}
      />
    </InfiniteScroll>
  )
}

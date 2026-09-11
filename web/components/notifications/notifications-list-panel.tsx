'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import type { NotificationsResponseBody } from '@/types/api-responses'
import { NotificationList, type NotificationListNotification } from './notification-list'

interface NotificationsListPanelProps {
  endCursor: string | null
  fetchError: Error | null
  hasNextPage: boolean
  notifications: NotificationsResponseBody
  resetKey: unknown
  loadingMore: boolean
  clearError: () => void
  loadMore: () => Promise<void | boolean>
  onDelete: (notificationId: string) => void
  onOpen: (notification: NotificationListNotification) => void
}

export function NotificationsListPanel({
  endCursor,
  fetchError,
  hasNextPage,
  notifications,
  resetKey,
  loadingMore,
  clearError,
  loadMore,
  onDelete,
  onOpen,
}: NotificationsListPanelProps) {
  return (
    <div className='overflow-hidden rounded-lg border bg-card'>
      <InfiniteScroll
        hasNextPage={hasNextPage}
        endCursor={endCursor}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
        resetKey={resetKey}
      >
        <NotificationList
          notifications={notifications}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      </InfiniteScroll>
    </div>
  )
}

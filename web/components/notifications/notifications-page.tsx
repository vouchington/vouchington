'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import type {
  NotificationsResponseBody,
  WebPushSubscriptionsResponseBody,
} from '@/types/api-responses'
import {
  deleteMyNotification,
  markAllMyNotificationsRead,
  markMyNotificationReadKeepalive,
} from '@/lib/api/client/my'
import { navigateToTarget, resolveNotificationTarget } from './utils'
import type { NotificationListNotification } from './notification-list-notification'
import { toast } from 'sonner'
import { PushNotificationsPanel } from './push-notifications-panel'
import { mergeNotificationPages } from './merged-notifications'
import { NotificationsHeader } from './notifications-header'
import { NotificationsListPanel } from './notifications-list-panel'
import { useNotificationPushActions } from './use-notification-push-actions'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'

import type { NotificationPushSubscription } from './notification-push-subscription'
export type { NotificationPushSubscription } from './notification-push-subscription'

export function NotificationsPage({
  initialNotifications,
  initialSubscriptions,
}: {
  initialNotifications: NotificationsResponseBody
  initialSubscriptions: WebPushSubscriptionsResponseBody | NotificationPushSubscription[]
}) {
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialNotifications, '/api/v1/my/notifications', {})
  const pushActions = useNotificationPushActions(initialSubscriptions)
  const handleLoadMorePushSubscriptions = pushActions.pagination.loadMore
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [readAtById, setReadAtById] = useState<Record<string, string>>({})

  const notifications = mergeNotificationPages(pages, deletedIds, readAtById)

  // Zero-arg `new Date()` stays inside the state updaters. Render reads `read_at`, so a clock
  // read in the handler body is an impure render.
  async function handleMarkRead(notification: NotificationListNotification) {
    const readAt = readAtById[notification.id] ?? notification.read_at
    setReadAtById(prev => ({
      ...prev,
      [notification.id]: readAt ?? new Date().toISOString(),
    }))
    markMyNotificationReadKeepalive(notification.id).catch(Sentry.captureException)
    const target = resolveNotificationTarget(notification, notifications.communities)
    if (target) navigateToTarget(target)
  }

  async function handleDelete(notificationId: string) {
    try {
      await deleteMyNotification(notificationId)
      setDeletedIds(prev => new Set([...prev, notificationId]))
    } catch {
      toast.error('Failed to delete notification.')
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllMyNotificationsRead()
      setReadAtById(() => {
        const now = new Date().toISOString()
        return Object.fromEntries(
          notifications.results.map(result => [result.id, result.read_at ?? now]),
        )
      })
    } catch {
      toast.error('Failed to mark notifications as read.')
    }
  }

  return (
    <div className='space-y-4'>
      <NotificationsHeader
        canMarkAllRead={!notifications.results.every(result => result.read_at)}
        onMarkAllRead={handleMarkAllRead}
      />

      <InfiniteScroll
        hasNextPage={pushActions.pagination.hasNextPage}
        endCursor={pushActions.pagination.endCursor}
        onLoadMore={handleLoadMorePushSubscriptions}
        loadingMore={pushActions.pagination.loadingMore}
        fetchError={pushActions.pagination.fetchError}
        clearError={pushActions.pagination.clearError}
        resetKey={pushActions.pagination.resetKey}
      >
        <PushNotificationsPanel
          currentSubscriptionId={pushActions.currentSubscriptionId}
          pushEnabled={pushActions.pushEnabled}
          pushStatus={pushActions.pushStatus}
          onDisablePush={pushActions.handleDisablePush}
          onEnablePush={pushActions.handleEnablePush}
        />
      </InfiniteScroll>

      <NotificationsListPanel
        endCursor={endCursor}
        fetchError={fetchError}
        hasNextPage={hasNextPage}
        notifications={notifications}
        loadingMore={loadingMore}
        clearError={clearError}
        resetKey={resetKey}
        loadMore={loadMore}
        onDelete={handleDelete}
        onOpen={handleMarkRead}
      />
    </div>
  )
}

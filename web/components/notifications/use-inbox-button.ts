'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Notification, NotificationsUnreadSummaryResponseBody } from '@/types/api-responses'
import {
  deleteMyNotification,
  getMyUnreadNotificationsSummaryClient,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from '@/lib/api/client/my'
import { resolveNotificationTarget } from './utils'

const EMPTY_SUMMARY: NotificationsUnreadSummaryResponseBody = {
  unread_count: 0,
  results: [],
  notifications: {},
  communities: {},
}

interface InboxSnapshot {
  loading: boolean
  summary: NotificationsUnreadSummaryResponseBody
}

let requestId = 0
let initialized = false
let snapshot: InboxSnapshot = { loading: false, summary: EMPTY_SUMMARY }
const listeners = new Set<() => void>()

export function useInboxButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { loading, summary } = useSyncExternalStore(
    subscribeInboxStore,
    getInboxSnapshot,
    getInboxSnapshot,
  )

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) await refreshInboxStore()
  }

  async function handleMarkAllRead() {
    try {
      await markAllMyNotificationsRead()
      invalidateInflightRequests()
      await refreshInboxStore()
    } catch {
      toast.error('Failed to mark notifications as read.')
    }
  }

  async function handleClickNotification(notification: Notification) {
    try {
      await markMyNotificationRead(notification.id)
      invalidateInflightRequests()
      setInboxSnapshot({ summary: removeNotification(snapshot.summary, notification.id) })
      const safeTarget = resolveNotificationTarget(notification, snapshot.summary.communities)
      if (!safeTarget) {
        toast.error('Invalid notification target.')
        return
      }
      router.push(safeTarget)
    } catch {
      toast.error('Failed to open notification.')
    }
  }

  async function handleDeleteNotification(notificationId: string) {
    try {
      await deleteMyNotification(notificationId)
      invalidateInflightRequests()
      setInboxSnapshot({ summary: removeNotification(snapshot.summary, notificationId) })
    } catch {
      toast.error('Failed to delete notification.')
    }
  }

  return {
    handleClickNotification,
    handleDeleteNotification,
    handleMarkAllRead,
    handleOpenChange,
    loading,
    open,
    setOpen,
    summary,
  }
}

function subscribeInboxStore(listener: () => void) {
  listeners.add(listener)
  if (!initialized) {
    initialized = true
    void refreshInboxStore({ showError: false })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) initialized = false
  }
}

function getInboxSnapshot() {
  return snapshot
}

function setInboxSnapshot(next: Partial<InboxSnapshot>) {
  snapshot = { ...snapshot, ...next }
  for (const listener of listeners) listener()
}

function invalidateInflightRequests() {
  requestId += 1
}

async function refreshInboxStore({ showError = true }: { showError?: boolean } = {}) {
  const nextRequestId = requestId + 1
  requestId = nextRequestId
  setInboxSnapshot({ loading: true })
  try {
    const summary = await getMyUnreadNotificationsSummaryClient()
    if (nextRequestId !== requestId) return false
    setInboxSnapshot({ summary })
    return true
  } catch {
    if (showError && nextRequestId === requestId) toast.error('Failed to load notifications.')
    return false
  } finally {
    if (nextRequestId === requestId) setInboxSnapshot({ loading: false })
  }
}

function removeNotification(
  summary: NotificationsUnreadSummaryResponseBody,
  notificationId: string,
): NotificationsUnreadSummaryResponseBody {
  return {
    unread_count: Math.max(summary.unread_count - 1, 0),
    results: summary.results.filter(result => result.id !== notificationId),
    notifications: Object.fromEntries(
      Object.entries(summary.notifications).filter(([id]) => id !== notificationId),
    ),
    communities: summary.communities,
  }
}

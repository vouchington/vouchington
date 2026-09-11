'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  createMyWebPushSubscription,
  deleteMyWebPushSubscription,
  getMyWebPushSubscriptionsClient,
} from '@/lib/api/client/my'
import { ApiError } from '@/lib/api/error'
import type { NotificationPushSubscription } from './notifications-page'
import { getCurrentSubscription, getPushManager } from './push-utils'
import { useCurrentPushBinding } from './use-current-push-binding'
import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'
import type { ListResponse, WebPushSubscriptionsResponseBody } from '@/types/api-responses'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { clearPushBinding } from '@/lib/push-service-worker'
import {
  PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS,
  waitForActiveServiceWorker,
} from '@/lib/service-worker-activation'
import { withWebPushOwnershipLock } from '@/lib/push-ownership-lock'
import { bootstrapPushBinding, registerAndSavePush } from './push-registration'

const EMPTY_FIRST_PAGE: ListResponse<NotificationPushSubscription> = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}
const BOOTSTRAP_RETRY_DELAY_MS = 5000

export function useNotificationPushActions(
  initialSubscriptions: WebPushSubscriptionsResponseBody | NotificationPushSubscription[],
) {
  const { webPushPublicKey } = useRuntimePublicConfig()
  const firstPage = useMemo<ListResponse<NotificationPushSubscription>>(
    () =>
      Array.isArray(initialSubscriptions)
        ? initialSubscriptions.length === 0
          ? EMPTY_FIRST_PAGE
          : {
              results: initialSubscriptions,
              page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
            }
        : { results: initialSubscriptions.results, page_info: initialSubscriptions.page_info },
    [initialSubscriptions],
  )
  const pagination = usePaginatedList(
    firstPage,
    '/api/v1/my/notifications/push-subscriptions',
    {},
    { loadPage: after => getMyWebPushSubscriptionsClient({ after }) },
  )
  const [createdSubscriptions, setCreatedSubscriptions] = useState<NotificationPushSubscription[]>(
    [],
  )
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(() => new Set())
  const subscriptions = [
    ...createdSubscriptions,
    ...pagination.pages.flatMap(page => page.results),
  ].filter(
    (subscription, index, all) =>
      !deletedIds.has(subscription.id) &&
      all.findIndex(candidate => candidate.id === subscription.id) === index,
  )
  const [pushStatus, setPushStatus] = useState<'idle' | 'working'>('idle')
  const { currentBinding, setCurrentBinding } = useCurrentPushBinding()
  const subscriptionIdentity = subscriptions
    .map(subscription => `${subscription.id}:${subscription.endpoint}`)
    .join('|')

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined

    function scheduleRetry() {
      if (cancelled || retryTimer !== undefined) return
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined
        void bootstrap()
      }, BOOTSTRAP_RETRY_DELAY_MS)
    }

    async function bootstrap() {
      try {
        const binding = await bootstrapPushBinding()
        if (!cancelled) setCurrentBinding(binding)
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          try {
            await withWebPushOwnershipLock(async () => {
              if (cancelled) return
              const registration = await getActivePushRegistration()
              if (cancelled) return
              await clearPushBinding(registration)
            })
            if (!cancelled) setCurrentBinding(null)
          } catch {
            scheduleRetry()
          }
          return
        }
        scheduleRetry()
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [subscriptionIdentity, setCurrentBinding])

  async function handleEnablePush() {
    const publicKey = webPushPublicKey
    if (!publicKey) {
      toast.error('Web push is not configured.')
      return
    }
    if (!('serviceWorker' in navigator) || window.PushManager === undefined || !navigator.locks) {
      toast.error('This browser does not support push notifications.')
      return
    }

    setPushStatus('working')
    try {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          toast.error('Push permission was not granted.')
          return
        }
      }
      if (Notification.permission !== 'granted') {
        toast.error('Push permission is blocked in this browser.')
        return
      }

      /* c8 ignore next 3 -- requires service worker and push notification browser APIs */
      const saved = await registerAndSavePush(publicKey)
      setCurrentBinding({ endpoint: saved.endpoint, subscription_id: saved.id })
      setCreatedSubscriptions(prev => [saved, ...prev.filter(item => item.id !== saved.id)])
      setDeletedIds(prev => {
        const next = new Set(prev)
        next.delete(saved.id)
        return next
      })
    } catch {
      toast.error('Failed to enable push notifications.')
    } finally {
      setPushStatus('idle')
    }
  }

  async function handleDisablePush() {
    setPushStatus('working')
    try {
      await withWebPushOwnershipLock(async () => {
        const registration = await getActivePushRegistration()
        const state = await clearPushBinding(registration)
        if (!state.binding) throw new Error('The disabled push binding is unavailable.')
        const disabledSubscriptionId = state.binding.subscription_id
        await deleteMyWebPushSubscription(disabledSubscriptionId)
        await getPushManager(registration)
          .getSubscription()
          .then(subscription => subscription?.unsubscribe())
          .catch(() => undefined)
        setCurrentBinding(null)
        setDeletedIds(prev => new Set(prev).add(disabledSubscriptionId))
      })
    } catch {
      toast.error('Failed to disable push notifications.')
    } finally {
      setPushStatus('idle')
    }
  }

  const currentSubscription = getCurrentSubscription(subscriptions, currentBinding)
  return {
    currentSubscriptionId: currentSubscription?.id,
    handleDisablePush,
    handleEnablePush,
    pushEnabled: Boolean(currentSubscription),
    pushStatus,
    pagination,
  }
}

async function getActivePushRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.')
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) throw new Error('The push service worker is unavailable.')
  return waitForActiveServiceWorker(registration, {
    timeoutMs: PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS,
  })
}

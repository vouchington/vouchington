'use client'

import { useEffect } from 'react'
import { getMyWebPushSubscriptionsClient } from '@/lib/api/client/my'
import { ApiError } from '@/lib/api/error'
import { bootstrapAuthenticatedPushBinding } from '@/lib/push-bootstrap'
import { clearPushBinding } from '@/lib/push-service-worker'
import { waitForActiveServiceWorker } from '@/lib/service-worker-activation'
import { withWebPushOwnershipLock } from '@/lib/push-ownership-lock'

const bootstrapInFlight = new Map<string, Promise<void>>()
const ANONYMOUS_RETRY_DELAY_MS = 5000

export function ServiceWorkerRegistrar({ currentUserId }: { currentUserId?: string }) {
  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined
    let attemptInFlight: Promise<void> | undefined

    function scheduleRetry() {
      if (cancelled || retryTimer !== undefined) return
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined
        void startAttempt()
      }, ANONYMOUS_RETRY_DELAY_MS)
    }

    async function runAttempt(): Promise<void> {
      if (cancelled) return
      const registration = await navigator.serviceWorker.register('/service-worker.js')
      const activeRegistration = await waitForActiveServiceWorker(registration)
      if (cancelled) return
      if (!currentUserId) {
        if (document.querySelector('meta[name="voucha-offline-fallback"]') && !navigator.onLine)
          return
        await withWebPushOwnershipLock(async () => {
          if (cancelled) return
          try {
            await getMyWebPushSubscriptionsClient({ limit: 1 })
            return
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 401) throw error
          }
          if (cancelled) return
          await clearPushBinding(activeRegistration)
        })
        return
      }
      if (!('PushManager' in window)) return
      const inFlight = bootstrapInFlight.get(currentUserId)
      if (inFlight) return inFlight
      const next = bootstrapAuthenticatedPushBinding(activeRegistration)
        .then(() => undefined)
        .finally(() => bootstrapInFlight.delete(currentUserId))
      bootstrapInFlight.set(currentUserId, next)
      try {
        return await next
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error
        await withWebPushOwnershipLock(async () => {
          if (cancelled) return
          await clearPushBinding(activeRegistration)
        })
      }
    }

    function startAttempt() {
      if (attemptInFlight) return attemptInFlight
      attemptInFlight = runAttempt()
        .catch(() => {
          scheduleRetry()
        })
        .finally(() => {
          attemptInFlight = undefined
        })
      return attemptInFlight
    }

    if (!('serviceWorker' in navigator)) return
    if (navigator.webdriver) return
    void startAttempt()
    const retryOnline = () => {
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer)
        retryTimer = undefined
      }
      void startAttempt()
    }
    window.addEventListener('online', retryOnline)
    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      window.removeEventListener('online', retryOnline)
    }
  }, [currentUserId])

  return null
}

'use client'

import { postLogout } from '@/lib/api/client'
import { admissionIdempotency } from '@/lib/api/client/admission-idempotency'
import { clearPushBinding } from '@/lib/push-service-worker'
import {
  PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS,
  waitForActiveServiceWorker,
} from '@/lib/service-worker-activation'
import { withWebPushOwnershipLock } from '@/lib/push-ownership-lock'
import { getPushManager } from '@/components/notifications/push-utils'

export async function logout(
  reloadPage: () => void = () => window.location.reload(),
): Promise<void> {
  admissionIdempotency.pause()
  try {
    await admissionIdempotency.drain()
    if (navigator.locks) await withWebPushOwnershipLock(logoutWithPushCleanup)
    else await postLogout()
  } catch (error) {
    admissionIdempotency.resume()
    throw error
  }
  reloadPage()
}

async function logoutWithPushCleanup(): Promise<void> {
  let registrationForCleanup: ServiceWorkerRegistration | undefined
  let activeRegistration: ServiceWorkerRegistration | undefined
  let binding:
    | {
        endpoint: string
        subscription_id: string
      }
    | undefined
  try {
    const registration =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    registrationForCleanup = registration
    if (registration) {
      try {
        activeRegistration = await waitForActiveServiceWorker(registration, {
          timeoutMs: PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS,
        })
      } catch {
        activeRegistration = undefined
      }
      if (activeRegistration) {
        try {
          const state = await clearPushBinding(activeRegistration)
          binding = state.binding
        } catch {
          binding = undefined
        }
      }
    }
  } catch {
    activeRegistration = undefined
    binding = undefined
  }
  if (binding) {
    await postLogout({
      web_push_endpoint: binding.endpoint,
      web_push_subscription_id: binding.subscription_id,
    })
  } else {
    await postLogout()
  }
  if (registrationForCleanup) await unsubscribeFromPush(registrationForCleanup)
}

async function unsubscribeFromPush(registration: ServiceWorkerRegistration): Promise<void> {
  try {
    await (await getPushManager(registration).getSubscription())?.unsubscribe()
  } catch {
    // Server revocation is complete, and the durable worker tombstone prevents display.
  }
}

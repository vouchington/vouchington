import { createMyWebPushSubscription, deleteMyWebPushSubscription } from '@/lib/api/client/my'
import { bindPushBinding, clearPushBinding } from '@/lib/push-service-worker'
import {
  PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS,
  waitForActiveServiceWorker,
} from '@/lib/service-worker-activation'
import { bootstrapAuthenticatedPushBinding } from '@/lib/push-bootstrap'
import { withWebPushOwnershipLock } from '@/lib/push-ownership-lock'
import { base64UrlToUint8Array } from './utils'
import { getPushManager } from './push-utils'
import type { WebPushSubscription } from '@/types/api-responses'

type NotificationPushSubscription = Pick<WebPushSubscription, 'id' | 'endpoint'>

export async function registerAndSavePush(
  publicKey: string,
): Promise<NotificationPushSubscription> {
  return withWebPushOwnershipLock(() => registerAndSavePushLocked(publicKey))
}

async function registerAndSavePushLocked(publicKey: string): Promise<NotificationPushSubscription> {
  const activeRegistration = await registerActivePushWorker()
  const { barrierRevision, saved } = await replacePushGeneration(activeRegistration, publicKey)
  return bindSavedPushGeneration(activeRegistration, saved, barrierRevision)
}

async function registerActivePushWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/service-worker.js')
  return waitForActiveServiceWorker(registration, {
    timeoutMs: PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS,
  })
}

async function replacePushGeneration(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<{ barrierRevision: string; saved: NotificationPushSubscription }> {
  const barrier = await clearPushBinding(registration)
  const saved = await getAndSaveSubscription(registration, publicKey)
  return { barrierRevision: barrier.revision, saved }
}

async function getAndSaveSubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<NotificationPushSubscription> {
  const subscription = await getOrCreateSubscription(registration, publicKey)
  return saveSubscription(subscription)
}

async function bindSavedPushGeneration(
  registration: ServiceWorkerRegistration,
  saved: NotificationPushSubscription,
  barrierRevision: string,
): Promise<NotificationPushSubscription> {
  try {
    await bindPushBinding(
      registration,
      { endpoint: saved.endpoint, subscription_id: saved.id },
      barrierRevision,
    )
    return saved
  } catch (error) {
    await deleteMyWebPushSubscription(saved.id).catch(() => undefined)
    throw error
  }
}

export async function bootstrapPushBinding(): Promise<{
  endpoint: string
  subscription_id: string
} | null> {
  if (!('serviceWorker' in navigator) || window.PushManager === undefined) return null
  const registration = (await navigator.serviceWorker.getRegistration()) as
    | (ServiceWorkerRegistration & { pushManager?: PushManager })
    | undefined
  if (!registration?.pushManager) return null
  const activeRegistration = await waitForActiveServiceWorker(registration, {
    timeoutMs: PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS,
  })
  return bootstrapAuthenticatedPushBinding(activeRegistration)
}

async function getOrCreateSubscription(registration: ServiceWorkerRegistration, publicKey: string) {
  const existingSubscription = await getPushManager(registration).getSubscription()
  return (
    existingSubscription ??
    (await getPushManager(registration).subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    }))
  )
}

async function saveSubscription(
  subscription: PushSubscription,
): Promise<NotificationPushSubscription> {
  const json = subscription.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    await subscription.unsubscribe()
    throw new Error('Push subscription data is incomplete.')
  }
  const response = await createMyWebPushSubscription({
    endpoint,
    p256dh,
    auth,
    expiration_time_ms: json.expirationTime ?? null,
    user_agent: navigator.userAgent,
  })
  return {
    id: response.web_push_subscription.id,
    endpoint: response.web_push_subscription.endpoint,
  }
}

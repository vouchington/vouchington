import { getMyWebPushSubscriptionsClient } from '@/lib/api/client/my'
import {
  beginPushBindingReconciliation,
  bindPushBinding,
  clearPushBinding,
  readOrInitializePushBinding,
  type WebPushBinding,
  type WebPushWorkerState,
} from '@/lib/push-service-worker'
import type { WebPushSubscription } from '@/types/api-responses'
import { withWebPushOwnershipLock } from './push-ownership-lock'

type PushRegistration = ServiceWorkerRegistration & { pushManager: PushManager }
type PushSubscriptionRecord = Pick<WebPushSubscription, 'id' | 'endpoint'>

/** Reconciles only an exact currently owned server generation; it never creates one. */
export async function bootstrapAuthenticatedPushBinding(
  registration: ServiceWorkerRegistration,
): Promise<WebPushBinding | null> {
  return withWebPushOwnershipLock(() => bootstrapAuthenticatedPushBindingLocked(registration))
}

async function bootstrapAuthenticatedPushBindingLocked(
  registration: ServiceWorkerRegistration,
): Promise<WebPushBinding | null> {
  const state = await readOrInitializePushBinding(registration)
  if (state.status === 'disabled') return null
  const priorBinding = state.status === 'uninitialized' ? undefined : state.binding
  const barrier = await beginPushBindingReconciliationAtAuthenticationBoundary(registration)
  const physical = await (registration as PushRegistration).pushManager.getSubscription()
  if (!physical) return clearUnprovenBinding(registration, priorBinding)
  if (priorBinding && physical.endpoint !== priorBinding.endpoint)
    return clearUnprovenBinding(registration, priorBinding)
  const subscription = await findSubscriptionByEndpoint(
    physical.endpoint,
    priorBinding?.subscription_id,
  )
  if (!subscription) return clearUnprovenBinding(registration, priorBinding)
  const initialized = await bindPushBinding(
    registration,
    { endpoint: subscription.endpoint, subscription_id: subscription.id },
    barrier.revision,
  )
  return initialized.status === 'bound' ? initialized.binding : null
}

async function clearUnprovenBinding(
  registration: ServiceWorkerRegistration,
  priorBinding: WebPushBinding | undefined,
): Promise<null> {
  if (priorBinding) await clearPushBinding(registration)
  return null
}

export async function beginPushBindingReconciliationAtAuthenticationBoundary(
  registration: ServiceWorkerRegistration,
): Promise<Extract<WebPushWorkerState, { status: 'reconciling' }>> {
  try {
    return await beginPushBindingReconciliation(registration)
  } catch (error) {
    await registration.unregister()
    throw error
  }
}

async function findSubscriptionByEndpoint(
  endpoint: string,
  subscriptionId?: string,
): Promise<PushSubscriptionRecord | null> {
  let after: string | undefined
  do {
    // eslint-disable-next-line no-await-in-loop -- Cursor pagination is sequential by contract.
    const page = await getMyWebPushSubscriptionsClient({ after, limit: 100 })
    const current = page.results.find(
      subscription =>
        subscription.endpoint === endpoint &&
        (subscriptionId === undefined || subscription.id === subscriptionId),
    )
    if (current) return current
    after = page.page_info.has_next_page ? (page.page_info.end_cursor ?? undefined) : undefined
  } while (after)
  return null
}

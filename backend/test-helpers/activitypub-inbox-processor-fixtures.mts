import dns from 'node:dns'
import { vi } from 'vitest'
import { activityPubInboxDeliveryTransitions } from '../services/ap-inbox-activities/index.mts'
import { getApInboxActivitiesWorkLimit } from '../services/ap-inbox-activities/work-limits.mts'
import { rearmFailedDeliveries } from '../workers/activitypub/processors/inbox.mts'
import {
  enqueueBulkActivityPubInboxDeliveries,
  enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
} from '../queues/activitypub/enqueues/inbox.mts'

/** Run the production page and real enqueues against only this test's delivery IDs. */
export function rearmScopedActivityPubInboxDeliveries(
  deliveryIds: readonly string[],
  afterId?: string,
): ReturnType<typeof rearmFailedDeliveries> {
  return rearmFailedDeliveries(afterId, {
    rearmFailed: cursor => activityPubInboxDeliveryTransitions.rearm(deliveryIds, cursor),
    enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
    enqueueContinuation: enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
    pageSize: () => getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size'),
  })
}

export function stubUnresolvableHostname(hostname: string) {
  const originalLookup = dns.promises.lookup
  return vi.spyOn(dns.promises, 'lookup').mockImplementation(((
    requested: string,
    options?: unknown,
  ) => {
    if (requested === hostname) {
      const err: NodeJS.ErrnoException = new Error(`getaddrinfo ENOTFOUND ${hostname}`)
      err.code = 'ENOTFOUND'
      return Promise.reject(err)
    }
    return Reflect.apply(originalLookup, dns.promises, [requested, options])
  }) as typeof dns.promises.lookup)
}

export async function markActivityPubInboxDeliveryVerified(
  deliveryId: string,
  remoteActorId: string,
) {
  return (
    (await activityPubInboxDeliveryTransitions.verify(deliveryId, remoteActorId)).outcome ===
    'applied'
  )
}

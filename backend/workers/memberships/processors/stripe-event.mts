import { getStripeWorkLimit } from '@services/stripe/work-limits'
import {
  getStripeEventById,
  markStripeEventCompleted,
  markStripeEventFailed,
  markStripeEventProcessing,
} from '@services/stripe/events'
import { claimRecoverableStripeEvents } from '@services/stripe/recovery'
import { enqueueOrReactivateBulkProcessStripeEvents } from '@queues/memberships/enqueues/stripe-events'
import { handleStripeEvent } from '@services/stripe-event-processing'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import type { ProcessStripeEventData } from '@queues/memberships/types'

export async function processStripeEvent(
  data: ProcessStripeEventData,
  isFinalAttempt = true,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const stripeEvent = await getStripeEventById(data.stripeEventRecordId)
  if (!stripeEvent) return
  const stripeEventRecordId = stripeEvent.id
  const leaseToken = data.leaseToken

  const processingAcquired = await markStripeEventProcessing(stripeEventRecordId, leaseToken)
  if (!processingAcquired) return

  try {
    const outcome = await handleStripeEvent(stripeEvent.payload, applicationContext)
    await markStripeEventCompleted(stripeEventRecordId, outcome, leaseToken)
  } catch (err) {
    await markStripeEventFailed(
      stripeEventRecordId,
      getErrorMessage(err),
      leaseToken,
      isFinalAttempt,
    )
    throw err
  }
}

/** A full page reports possible work for a later scheduled pass. */
export async function recoverStripeEvents(
  ids?: readonly string[],
  batchSize = getStripeWorkLimit('recovery_batch_size'),
): Promise<{ enqueued: number; hasMore: boolean }> {
  const events = await claimRecoverableStripeEvents(ids, batchSize)
  if (events.length > 0) await enqueueOrReactivateBulkProcessStripeEvents(events)
  return { enqueued: events.length, hasMore: events.length === batchSize }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

import {
  getStripeEventById,
  markStripeEventCompleted,
  markStripeEventFailed,
  markStripeEventProcessing,
} from '@services/stripe/events'
import { claimRecoverableStripeEvents } from '@services/stripe/recovery'
import { enqueueBulkProcessStripeEvents } from '@queues/memberships/enqueues'
import { handleStripeEvent } from '@services/stripe-event-processing'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import type { ProcessStripeEventData } from '@queues/memberships/types'

type RecoverStripeEventsDependencies = {
  claimRecoverableStripeEvents: typeof claimRecoverableStripeEvents
  enqueueBulkProcessStripeEvents: typeof enqueueBulkProcessStripeEvents
}

type ProcessStripeEventDependencies = {
  getStripeEventById: typeof getStripeEventById
  handleStripeEvent: typeof handleStripeEvent
  markStripeEventCompleted: typeof markStripeEventCompleted
  markStripeEventFailed: typeof markStripeEventFailed
  markStripeEventProcessing: typeof markStripeEventProcessing
}

export async function processStripeEvent(
  data: ProcessStripeEventData,
  isFinalAttempt = true,
  dependencies?: Partial<ProcessStripeEventDependencies>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const getEvent = dependencies?.getStripeEventById ?? getStripeEventById
  const markProcessing = dependencies?.markStripeEventProcessing ?? markStripeEventProcessing
  const handleEvent = dependencies?.handleStripeEvent ?? handleStripeEvent
  const markCompleted = dependencies?.markStripeEventCompleted ?? markStripeEventCompleted
  const markFailed = dependencies?.markStripeEventFailed ?? markStripeEventFailed
  const stripeEvent = await getEvent(data.stripeEventRecordId)
  if (!stripeEvent) return
  const stripeEventRecordId = stripeEvent.id
  const processingAttemptId = data.processingAttemptId

  const processingAcquired = await markProcessing(stripeEventRecordId, processingAttemptId)
  if (!processingAcquired) return

  try {
    const outcome = await handleEvent(stripeEvent.payload, undefined, applicationContext)
    await markCompleted(stripeEventRecordId, outcome, processingAttemptId)
  } catch (error) {
    await markFailed(
      stripeEventRecordId,
      getErrorMessage(error),
      processingAttemptId,
      isFinalAttempt,
    )
    throw error
  }
}

export async function recoverStripeEvents(
  dependencies?: Partial<RecoverStripeEventsDependencies>,
): Promise<{ enqueued: number }> {
  const claimEvents = dependencies?.claimRecoverableStripeEvents ?? claimRecoverableStripeEvents
  const enqueueEvents =
    dependencies?.enqueueBulkProcessStripeEvents ?? enqueueBulkProcessStripeEvents
  const events = await claimEvents()
  if (events.length > 0) await enqueueEvents(events)
  return { enqueued: events.length }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

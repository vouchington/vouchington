import {
  getStripeEventById,
  markStripeEventCompleted,
  markStripeEventFailed,
  markStripeEventProcessing,
} from '@services/stripe/events'
import { claimRecoverableStripeEvents } from '@services/stripe/recovery'
import { enqueueBulkProcessStripeWebhooks } from '@queues/memberships/enqueues'
import { handleStripeWebhookEvent } from '@services/stripe-webhook-processing'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import type { ProcessStripeWebhookData } from '@queues/memberships/types'

type RecoverStripeWebhooksDependencies = {
  claimRecoverableStripeEvents: typeof claimRecoverableStripeEvents
  enqueueBulkProcessStripeWebhooks: typeof enqueueBulkProcessStripeWebhooks
}

type ProcessStripeWebhookDependencies = {
  getStripeEventById: typeof getStripeEventById
  handleStripeWebhookEvent: typeof handleStripeWebhookEvent
  markStripeEventCompleted: typeof markStripeEventCompleted
  markStripeEventFailed: typeof markStripeEventFailed
  markStripeEventProcessing: typeof markStripeEventProcessing
}

export async function processStripeWebhook(
  data: ProcessStripeWebhookData,
  isFinalAttempt = true,
  dependencies?: Partial<ProcessStripeWebhookDependencies>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const getEvent = dependencies?.getStripeEventById ?? getStripeEventById
  const markProcessing = dependencies?.markStripeEventProcessing ?? markStripeEventProcessing
  const handleEvent = dependencies?.handleStripeWebhookEvent ?? handleStripeWebhookEvent
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

export async function recoverStripeWebhooks(
  dependencies?: Partial<RecoverStripeWebhooksDependencies>,
): Promise<{ enqueued: number }> {
  const claimEvents = dependencies?.claimRecoverableStripeEvents ?? claimRecoverableStripeEvents
  const enqueueEvents =
    dependencies?.enqueueBulkProcessStripeWebhooks ?? enqueueBulkProcessStripeWebhooks
  const events = await claimEvents()
  if (events.length > 0) await enqueueEvents(events)
  return { enqueued: events.length }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

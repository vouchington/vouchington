import { getStripeWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type RecoverableStripeEvent = {
  stripeEventRecordId: string
  processingAttemptId: string
  stripeSubscriptionId: string | null
  livemode: boolean
}

export async function claimRecoverableStripeEvents(): Promise<RecoverableStripeEvent[]> {
  const STRIPE_DISPATCH_TIMEOUT_MINUTES = getStripeWorkLimit('dispatch_timeout_minutes')
  const STRIPE_PROCESSING_TIMEOUT_MINUTES = getStripeWorkLimit('processing_timeout_minutes')
  const WORK_PAGE_SIZE = getStripeWorkLimit('recovery_batch_size')
  const { rows } = await write(sql`/* claimRecoverableStripeEvents */
    WITH candidates AS (
      SELECT id
      FROM stripe_events
      WHERE processed_at IS NULL AND ignored_at IS NULL
        AND (
          (processing_started_at IS NULL AND dispatched_at < NOW() - ${STRIPE_DISPATCH_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute')
          OR processing_started_at < NOW() - ${STRIPE_PROCESSING_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute'
          OR failed_at IS NOT NULL
        )
      ORDER BY id
      LIMIT ${WORK_PAGE_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE stripe_events event
    SET processing_attempt_id = CASE
          WHEN event.processing_started_at < NOW() - ${STRIPE_PROCESSING_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute'
            OR event.failed_at IS NOT NULL
          THEN uuidv7()
          ELSE event.processing_attempt_id
        END,
        dispatched_at = CURRENT_TIMESTAMP,
        processing_started_at = CASE
          WHEN event.processing_started_at < NOW() - ${STRIPE_PROCESSING_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute'
            OR event.failed_at IS NOT NULL
          THEN NULL
          ELSE event.processing_started_at
        END,
        failed_at = NULL
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING event.id, event.processing_attempt_id, event.subscription_id, event.livemode
  `)
  return rows.map(row => {
    const typed = row as {
      id: string
      processing_attempt_id: string
      subscription_id: string | null
      livemode: boolean
    }
    return {
      stripeEventRecordId: typed.id,
      processingAttemptId: typed.processing_attempt_id,
      stripeSubscriptionId: typed.subscription_id,
      livemode: typed.livemode,
    }
  })
}

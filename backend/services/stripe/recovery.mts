import { getStripeWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type RecoverableStripeEvent = {
  stripeEventRecordId: string
  leaseToken: string
  stripeSubscriptionId: string | null
  isLiveMode: boolean
}

export async function claimRecoverableStripeEvents(): Promise<RecoverableStripeEvent[]> {
  const dispatchTimeout = getStripeWorkLimit('dispatch_timeout_minutes')
  const pageSize = getStripeWorkLimit('recovery_batch_size')
  const { rows } = await write(sql`/* claimRecoverableStripeEvents */
    WITH candidates AS (
      SELECT stripe_event_id FROM stripe_event_processing_work_items
      WHERE processed_at IS NULL AND ignored_at IS NULL AND available_at <= clock_timestamp()
        AND ((leased_at IS NULL AND dispatched_at < clock_timestamp() - ${dispatchTimeout}::integer * INTERVAL '1 minute')
          OR lease_expires_at <= clock_timestamp() OR failed_at IS NOT NULL)
      ORDER BY stripe_event_id LIMIT ${pageSize} FOR UPDATE SKIP LOCKED
    ), recovered AS (
      UPDATE stripe_event_processing_work_items work
      SET lease_token = CASE WHEN work.lease_expires_at <= clock_timestamp() OR work.failed_at IS NOT NULL
            THEN uuidv7() ELSE work.lease_token END,
          dispatched_at = clock_timestamp(), leased_at = NULL, lease_expires_at = NULL, failed_at = NULL
      FROM candidates WHERE work.stripe_event_id = candidates.stripe_event_id
      RETURNING work.stripe_event_id, work.lease_token
    ) SELECT event.id, recovered.lease_token, event.subscription_id, event.is_live_mode
      FROM recovered JOIN stripe_events event ON event.id = recovered.stripe_event_id
  `)
  return rows.map(row => {
    const typed = row as {
      id: string
      lease_token: string
      subscription_id: string | null
      is_live_mode: boolean
    }
    return {
      stripeEventRecordId: typed.id,
      leaseToken: typed.lease_token,
      stripeSubscriptionId: typed.subscription_id,
      isLiveMode: typed.is_live_mode,
    }
  })
}

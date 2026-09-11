import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function makeStripeEventRecoverableForTest(
  id: string,
  mode: 'unstarted' | 'stale' | 'failed',
): Promise<void> {
  await write(sql`/* makeStripeEventRecoverableForTest */
    UPDATE stripe_events
    SET dispatched_at = NOW() - INTERVAL '31 minutes',
        processing_started_at = CASE
          WHEN ${mode} = 'stale' THEN NOW() - INTERVAL '31 minutes'
          ELSE NULL
        END,
        failed_at = CASE WHEN ${mode} = 'failed' THEN NOW() ELSE NULL END
    WHERE id = ${id}
  `)
}

export async function setStripeEventReceivedAtForTest(
  stripeEventId: string,
  receivedAt: Date,
): Promise<void> {
  await write(sql`/* setStripeEventReceivedAtForTest */
    UPDATE stripe_events SET received_at = ${receivedAt}
    WHERE stripe_event_id = ${stripeEventId}`)
}

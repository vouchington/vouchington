import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function makeStripeEventRecoverableForTest(
  id: string,
  mode: 'unstarted' | 'stale' | 'failed',
): Promise<void> {
  await write(sql`/* makeStripeEventRecoverableForTest */
    UPDATE stripe_event_processing_work_items
    SET dispatched_at = NOW() - INTERVAL '31 minutes',
        leased_at = CASE
          WHEN ${mode} = 'stale' THEN NOW() - INTERVAL '31 minutes'
          ELSE NULL
        END,
        lease_expires_at = CASE WHEN ${mode} = 'stale' THEN NOW() - INTERVAL '1 minute' ELSE NULL END,
        failed_at = CASE WHEN ${mode} = 'failed' THEN NOW() ELSE NULL END
    WHERE stripe_event_id = ${id}
  `)
}

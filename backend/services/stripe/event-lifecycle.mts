import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markStripeEventCompleted(
  id: string,
  status: 'processed' | 'ignored',
  leaseToken: string,
): Promise<void> {
  await write(sql`/* markStripeEventCompleted */
    UPDATE stripe_event_processing_work_items
    SET processed_at = CASE WHEN ${status} = 'processed' THEN clock_timestamp() ELSE NULL END,
        ignored_at = CASE WHEN ${status} = 'ignored' THEN clock_timestamp() ELSE NULL END,
        leased_at = NULL, lease_expires_at = NULL, last_error_at = NULL, last_error_message = NULL
    WHERE stripe_event_id = ${id} AND lease_token = ${leaseToken}
      AND lease_expires_at > clock_timestamp() AND processed_at IS NULL AND ignored_at IS NULL
  `)
}

export async function markStripeEventFailed(
  id: string,
  errorMessage: string,
  leaseToken: string,
  terminal = true,
): Promise<void> {
  await write(sql`/* markStripeEventFailed */
    UPDATE stripe_event_processing_work_items
    SET failed_at = CASE WHEN ${terminal} THEN clock_timestamp() ELSE NULL END,
        leased_at = NULL, lease_expires_at = NULL,
        last_error_at = clock_timestamp(), last_error_message = ${errorMessage.slice(0, 2000).trim()}
    WHERE stripe_event_id = ${id} AND lease_token = ${leaseToken}
      AND lease_expires_at > clock_timestamp() AND processed_at IS NULL AND ignored_at IS NULL
  `)
}

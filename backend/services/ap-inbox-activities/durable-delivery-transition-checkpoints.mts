import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ActivityPubInboxTransitionResult,
  RecoverableActivityPubInboxDelivery,
} from './durable-delivery-transition-contract.mts'

export async function verifyActivityPubInboxDelivery(
  deliveryId: string,
  leaseToken: string,
  remoteActorId: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* verifyActivityPubInboxDelivery */
    UPDATE activitypub_inbox_delivery_work_items
    SET verified_at = CURRENT_TIMESTAMP,
        remote_actor_id = ${remoteActorId},
        retention_expires_at = CASE
          WHEN first_failed_at IS NULL THEN NULL
          ELSE retention_expires_at
        END
    WHERE id = ${deliveryId}
      AND lease_token = ${leaseToken}
      AND leased_at IS NOT NULL
      AND lease_expires_at > clock_timestamp()
      AND verified_at IS NULL
      AND remote_actor_id IS NULL
      AND available_at IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function admitActivityPubInboxDeliverySender(
  deliveryId: string,
  leaseToken: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* admitActivityPubInboxDeliverySender */
    UPDATE activitypub_inbox_delivery_work_items
    SET sender_allowed_at = CURRENT_TIMESTAMP
    WHERE id = ${deliveryId}
      AND lease_token = ${leaseToken}
      AND leased_at IS NOT NULL
      AND lease_expires_at > clock_timestamp()
      AND verified_at IS NOT NULL
      AND remote_actor_id IS NOT NULL
      AND sender_allowed_at IS NULL
      AND available_at IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function deferActivityPubInboxDelivery(
  deliveryId: string,
  leaseToken: string,
  deferredUntil: Date,
): Promise<ActivityPubInboxTransitionResult<RecoverableActivityPubInboxDelivery>> {
  const { rows } = await write(sql`/* deferActivityPubInboxDelivery */
    UPDATE activitypub_inbox_delivery_work_items
    SET lease_token = uuidv7(),
        leased_at = NULL, lease_expires_at = NULL,
        dispatched_at = NULL,
        available_at = ${deferredUntil},
        last_error = 'Sender hostname rate limited'
    WHERE id = ${deliveryId}
      AND lease_token = ${leaseToken}
      AND leased_at IS NOT NULL
      AND lease_expires_at > clock_timestamp()
      AND verified_at IS NOT NULL
      AND remote_actor_id IS NOT NULL
      AND sender_allowed_at IS NULL
      AND available_at IS NULL
      AND failed_at IS NULL
    RETURNING id, lease_token
  `)
  const row = rows[0] as { id: string; lease_token: string } | undefined
  return row
    ? {
        outcome: 'applied',
        value: { deliveryId: row.id, leaseToken: row.lease_token },
      }
    : { outcome: 'stale' }
}

function mutationResult(rowCount: number | null): ActivityPubInboxTransitionResult {
  return (rowCount ?? 0) > 0 ? { outcome: 'applied', value: undefined } : { outcome: 'stale' }
}
